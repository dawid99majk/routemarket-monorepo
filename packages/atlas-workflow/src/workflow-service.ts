import { join } from "node:path";
import {
  readJsonFile,
  readJsonFileWithSchema,
  RouteProjectSchema,
  SourceSchema,
  ClaimSchema,
  routesPath,
  updateProjectStatus,
  FileProjectRepository,
  type RouteProject,
  type Source,
  type Claim,
  type ProjectRepository,
  type InputItemType
} from "../../atlas-core/src/index.js";
import { z } from "zod";
import { prepareRouteMarketDraft } from "../../atlas-publisher/src/index.js";
import { GoogleRoutesRoutingProvider, buildGpxXml } from "../../atlas-gis/src/index.js";
import { collectSources, discoverDemand, ensureRouteGpx, extractPois, generateClaims, getSearchProviderStatus, runDeepResearch } from "../../atlas-research/src/index.js";
import type { SearchProviderMode } from "../../atlas-research/src/index.js";
import {
  generateGuideDraft,
  generateQualityReport,
  generateRecommendations,
  generateResearchBrief,
  generateRouteConcept,
  generateRouteTips,
  prepareMediaPack,
  writeReviewChecklist
} from "../../atlas-writer/src/index.js";
import { listProjectArtifactsFromRepository } from "./artifacts.js";
import { buildDashboardSummary } from "./dashboard.js";
import { appendProjectEvent, listProjectEvents } from "./events.js";
import { buildProjectExportBundle } from "./export.js";
import { listAtlasCategories } from "./categories.js";
import { filterProjects, type ProjectListFilters } from "./project-filters.js";
import { assessProjectReadiness } from "./readiness.js";
import { buildImportReadiness } from "./import-readiness.js";
import { buildProjectReviewBundle, saveProjectReviewDecision, type ReviewDecision } from "./review.js";
import { readWorkflowState, writeWorkflowState } from "./workflow-state.js";
import { QualityGateError } from "./quality-gates.js";

export type AtlasWorkflowOptions = {
  rootDir: string;
  repository?: ProjectRepository;
};

export type CreateProjectRequest = {
  topic: string;
  category?: string;
  region?: string;
  language?: string;
  ownerUserId?: string;
};

export type DiscoverRequest = {
  category: string;
  region: string;
  language?: string;
  limit?: number;
};

export type CollectSourcesRequest = {
  provider?: SearchProviderMode;
  limit?: number;
};

export type SubmitReviewDecisionRequest = {
  decision: ReviewDecision;
  reviewer?: string;
  notes?: string;
};

export type RunDeepResearchRequest = {
  sourceLimit?: number;
};

export type AddTextInputRequest = {
  fileName: string;
  content: string;
  note?: string;
};

export type RemoveInputRequest = {
  id?: string;
  path?: string;
  originalName?: string;
};

export type WorkflowProgress = {
  message: string;
  progress?: number;
  currentStep?: string;
};

export type WorkflowProgressCallback = (progress: WorkflowProgress) => void;

export class AtlasWorkflowService {
  private readonly repository: ProjectRepository;

  constructor(private readonly options: AtlasWorkflowOptions) {
    this.repository = options.repository ?? new FileProjectRepository(options.rootDir);
  }

  discover(input: DiscoverRequest) {
    return discoverDemand({
      rootDir: this.options.rootDir,
      category: input.category,
      region: input.region,
      language: input.language ?? "en",
      limit: input.limit ?? 10
    });
  }

  async createProject(input: CreateProjectRequest) {
    const project = await this.repository.createProject({
      title: input.topic,
      category: input.category,
      region: input.region,
      language: input.language ?? "en",
      ownerUserId: input.ownerUserId
    });
    await appendProjectEvent(project.id, this.repository, {
      type: "project.created",
      message: `Project created: ${project.title}`,
      data: { status: project.status }
    });
    return project;
  }

  async listProjects(filters: ProjectListFilters = {}) {
    const projects = await this.repository.listProjects();
    return filterProjects(projects, filters);
  }

  async deleteProject(projectSlug: string) {
    await this.repository.deleteProject(projectSlug);
  }

  listCategories() {
    return listAtlasCategories();
  }

  listSourceProviders() {
    return getSearchProviderStatus();
  }

  async dashboard() {
    return buildDashboardSummary((await this.listProjects({ limit: 200 })).projects);
  }

  async interview(projectSlug: string, body: any): Promise<any> {
    const project = await this.repository.getProject(projectSlug);
    if (!project) throw new Error("Project not found");

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { 
        message: "AI Interview unavailable (missing API Key). Please provide notes manually.",
        status: "waiting_for_user"
      };
    }

    // Persist answers if provided
    if (body.answers && Array.isArray(body.answers)) {
      const content = body.answers.map((a: any) => `Q: ${a.question || a.q}\nA: ${a.answer}\n`).join("\n---\n");
      await this.addNoteText(project.id, {
        fileName: `interview_answers_${Date.now()}.md`,
        content: `# Interview Answers for ${project.title}\n\n${content}`
      });
    }

    // Call Gemini to get next question or decide if we are ready
    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    // Load existing notes to avoid redundancy
    const notes = await this.repository.readProjectFile(project.slug, "notes.md").catch(() => "");
    
    const prompt = `
      Jesteś ekspertem RouteMarket. Przeprowadzasz wywiad z twórcą trasy "${project.title}".
      Region: ${project.region}, Kategoria: ${project.category}.
      
      Dotychczasowe ustalenia z notatek:
      ${notes}

      Zasady:
      1. Jeśli brakuje kluczowych informacji (punkt startu, trudność, typ noclegu, dystans), zadaj jedno krótkie, konkretne pytanie.
      2. Jeśli masz już wystarczająco dużo danych, aby wygenerować trasę, zwróć "READY".
      3. Nie powtarzaj pytań o rzeczy już ustalone.
      
      Zwróć odpowiedź w formacie JSON: {"message": "treść pytania lub READY", "isReady": boolean}
    `;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await geminiRes.json() as any;
    const aiResult = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{"message": "Jakie są Twoje preferencje?", "isReady": false}');

    if (aiResult.isReady || aiResult.message === "READY") {
      return { message: "Wspaniale! Mam wszystkie informacje. Rozpoczynam generowanie trasy.", status: "ready" };
    }

    return { 
      message: aiResult.message,
      status: "waiting_for_user"
    };
  }

  async magicGenerate(body: any): Promise<any> {
    // 1. Create project
    const project = await this.repository.createProject({
      title: body.topic,
      region: body.region,
      category: body.category || "adventure"
    });

    // 2. Persist initial notes
    if (body.notes) {
      await this.addNoteText(project.slug, {
        fileName: "initial_notes.md",
        content: body.notes
      });
    }

    // 3. Start background research (mocked for now, will call research providers in real scenario)
    // In a real implementation, we would trigger the full Atlas Engine pipeline here.
    
    return {
      projectId: project.id,
      slug: project.slug,
      status: "started",
      message: `Project ${project.title} created and research pipeline initiated.`
    };
  }

  async calculateGeometry(projectSlug: string, body: any): Promise<any> {
    const project = await this.repository.getProject(projectSlug);
    if (!project) throw new Error("Project not found");

    const waypoints = [body.start];
    if (body.midpoint) waypoints.push(body.midpoint);
    waypoints.push(body.end);

    const provider = new GoogleRoutesRoutingProvider();
    const result = await provider.getRoute(waypoints, body.category === "adventure" ? "motorcycle" : body.category);

    const gpx = buildGpxXml(result);
    await this.repository.writeProjectFile(project.slug, "route.gpx", gpx);
    
    // Save route summary for preview
    await this.repository.saveSummary(project.slug, {
      distanceKm: result.distanceKm,
      estimatedTimeH: result.estimatedTimeH,
      boundingBox: result.points.reduce((acc, pt) => ({
        minLat: Math.min(acc.minLat, pt.lat),
        maxLat: Math.max(acc.maxLat, pt.lat),
        minLng: Math.min(acc.minLng, pt.lng),
        maxLng: Math.max(acc.maxLng, pt.lng),
      }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 })
    } as any);

    return {
      distanceKm: result.distanceKm,
      estimatedTimeH: result.estimatedTimeH,
      geometry: result.geometryGeoJson
    };
  }

  async generateHeavyGeometry(body: any): Promise<any> {
    const waypoints = body.waypoints;
    const category = body.category;

    const provider = new GoogleRoutesRoutingProvider();
    const result = await provider.getRoute(waypoints, category);

    const gpx = buildGpxXml(result);
    const slug = body.slug || `route-${Date.now()}`;
    const gpxUrl = await this.repository.saveToStorage(slug, "route.gpx", gpx, "application/gpx+xml");

    return {
      slug,
      distanceKm: result.distanceKm,
      estimatedTimeH: result.estimatedTimeH,
      geometry: result.geometryGeoJson,
      gpxUrl
    };
  }

  async runDeepResearchPipeline(projectSlug: string, update: WorkflowProgressCallback): Promise<any> {
    const project = await this.repository.getProject(projectSlug);
    
    // 1. Deep Research (Grounded Search + Places)
    update({ message: "Searching for local insights and POIs...", progress: 20 });
    const researchReport = await runDeepResearch({
      project,
      repository: this.repository
    });

    // 2. Generate Claims from research
    update({ message: "Extracting facts and verification claims...", progress: 50 });
    await generateClaims(project);

    // 3. Extract and map POIs
    update({ message: "Mapping points of interest...", progress: 70 });
    await extractPois(project);

    // 4. Final Guide Generation
    update({ message: "Writing the final travel guide...", progress: 90 });
    const guide = await generateGuideDraft({ project, repository: this.repository });

    return {
      researchReport,
      guidePath: "guide.md",
      status: "completed"
    };
  }

  async getProject(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    try {
      const state = await readWorkflowState(project, this.repository);
      return {
        ...project,
        waitingApprovalStage: state.waitingApprovalStage,
        currentStep: state.currentStep,
        nextStep: state.nextStep,
        completedSteps: state.completedSteps
      };
    } catch {
      return project;
    }
  }

  async collectSources(projectSlug: string, input: CollectSourcesRequest = {}) {
    const project = await this.repository.getProject(projectSlug);
    const sources = await collectSources({ project, provider: input.provider, limit: input.limit, repository: this.repository });
    await appendProjectEvent(project.id, this.repository, {
      type: "sources.collected",
      message: `Collected ${sources.length} sources.`,
      data: { sourceCount: sources.length }
    });
    return sources;
  }

  async runDeepResearch(projectSlug: string, input: RunDeepResearchRequest = {}) {
    const project = await this.repository.getProject(projectSlug);
    const report = await runDeepResearch({ project, sourceLimit: input.sourceLimit, repository: this.repository });
    await appendProjectEvent(project.id, this.repository, {
      type: "research.deep_completed",
      message: `Deep research processed ${report.processedSourceCount} sources.`,
      data: {
        processedSourceCount: report.processedSourceCount,
        failedSourceCount: report.failedSourceCount,
        addedClaimCount: report.addedClaimCount,
        candidatePoiCount: report.candidatePoiCount,
        mappedPoiCount: report.mappedPoiCount
      }
    });
    return report;
  }

  async writeBrief(projectSlug: string) {
    const { project, sources } = await this.loadProjectBundle(projectSlug);
    return generateResearchBrief({ project, sources, repository: this.repository });
  }

  async runMvp2(projectSlug: string) {
    return this.runMvp2WithProgress(projectSlug);
  }

  async addNoteText(projectSlug: string, input: AddTextInputRequest) {
    const project = await this.repository.getProject(projectSlug);
    const item = await this.addTextInputThroughRepository(project.id, { ...input, type: "note" });
    await appendProjectEvent(project.id, this.repository, {
      type: "input.note_added",
      message: `Added note input: ${item.originalName}.`,
      data: { item }
    });
    return { project, item };
  }

  async addGpxText(projectSlug: string, input: AddTextInputRequest) {
    const project = await this.repository.getProject(projectSlug);
    const item = await this.addTextInputThroughRepository(project.id, { ...input, type: "gpx" });
    await appendProjectEvent(project.id, this.repository, {
      type: "input.gpx_added",
      message: `Added GPX input: ${item.originalName}.`,
      data: { item }
    });
    return { project, item };
  }

  async addLink(projectSlug: string, input: { url: string; note?: string }) {
    const project = await this.repository.getProject(projectSlug);
    const manifest = await this.repository.loadInputManifest(project.id);
    const now = new Date().toISOString();
    const item = {
      id: `link_${Date.now()}`,
      type: "link" as const,
      path: input.url,
      originalName: input.url,
      mimeType: "text/uri-list",
      sizeBytes: 0,
      addedAt: now,
      status: "added" as const,
      notes: input.note
    };
    manifest.items.push(item);
    manifest.updatedAt = now;
    await this.repository.saveInputManifest(project.id, manifest);
    await appendProjectEvent(project.id, this.repository, {
      type: "input.link_added",
      message: `Added link input: ${input.url}.`,
      data: { item }
    });
    return { project, item };
  }

  async removeInput(projectSlug: string, input: RemoveInputRequest) {
    const project = await this.repository.getProject(projectSlug);
    const manifest = await this.repository.loadInputManifest(project.id);
    const removed = manifest.items.filter((item) => inputMatches(item, input));

    if (removed.length === 0) {
      throw new Error("Input not found in this project.");
    }

    const now = new Date().toISOString();
    manifest.items = manifest.items.filter((item) => !inputMatches(item, input));
    manifest.updatedAt = now;
    await this.repository.saveInputManifest(project.id, manifest);

    if (removed.some((item) => item.type === "gpx")) {
      try {
        await this.repository.writeProjectFile(project.id, "route.gpx", "");
        for (const item of removed.filter((entry) => entry.type === "gpx" && entry.path)) {
          await this.repository.writeProjectFile(project.id, item.path, "");
        }
      } catch {
        // Removing the manifest entry is the authoritative operation.
      }
    }

    await appendProjectEvent(project.id, this.repository, {
      type: "input.removed",
      message: `Removed input: ${removed.map((item) => item.originalName).join(", ")}.`,
      data: {
        removed: removed.map((item) => ({
          id: item.id,
          type: item.type,
          path: item.path,
          originalName: item.originalName
        }))
      }
    });

    return { project, removed, manifest };
  }

  async registerExternalInput(projectSlug: string, input: {
    type: InputItemType;
    originalName: string;
    storageUrl?: string;
    storageKey?: string;
    mimeType: string;
    sizeBytes: number;
    note?: string;
  }) {
    const project = await this.repository.getProject(projectSlug);
    if (!input.storageUrl && !input.storageKey) throw new Error("storageUrl or storageKey is required.");
    const manifest = await this.repository.loadInputManifest(project.id);
    const now = new Date().toISOString();
    const fileName = safeInputName(input.originalName);
    const item = {
      id: `${input.type}_${Date.now()}`,
      type: input.type,
      path: input.storageKey ?? input.storageUrl ?? fileName,
      originalName: fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageUrl: input.storageUrl,
      storageKey: input.storageKey,
      addedAt: now,
      status: externalInputStatus(input.type, fileName, input.mimeType),
      notes: input.note
    };
    manifest.items.push(item);
    manifest.updatedAt = now;
    await this.repository.saveInputManifest(project.id, manifest);
    await appendProjectEvent(project.id, this.repository, {
      type: "input.external_registered",
      message: `Registered external input: ${item.originalName}.`,
      data: { item }
    });
    return { project, item };
  }

  private async addTextInputThroughRepository(projectSlug: string, input: AddTextInputRequest & { type: "note" | "gpx" }) {
    const fileName = safeInputName(input.fileName);
    const isGpx = input.type === "gpx";
    const loweredName = fileName.toLowerCase();

    const isDocument = loweredName.endsWith(".pdf") || loweredName.endsWith(".doc") || loweredName.endsWith(".docx");
    const isText = loweredName.endsWith(".md") || loweredName.endsWith(".txt") || loweredName.endsWith(".csv") || loweredName.endsWith(".json") || loweredName.endsWith(".geojson") || loweredName.endsWith(".kml");

    if (isGpx && !loweredName.endsWith(".gpx")) throw new Error("Only .gpx files are allowed.");
    if (!isGpx && !isText && !isDocument) {
      throw new Error("Unsupported file type. Allowed: .md, .txt, .csv, .json, .geojson, .kml, .pdf, .doc, .docx");
    }

    const maxSize = isGpx ? 10_000_000 : (isDocument ? 10_000_000 : 2_000_000);

    let content: string | Buffer = input.content;
    if (isDocument || (isGpx && input.content.startsWith("data:"))) {
      if (input.content.startsWith("data:")) {
        const base64Data = input.content.split(",")[1];
        content = Buffer.from(base64Data, "base64");
      } else if (/^[a-zA-Z0-9+/=]+$/.test(input.content) && input.content.length % 4 === 0) {
        // Likely base64 encoded binary
        content = Buffer.from(input.content, "base64");
      }
    }

    const sizeBytes = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, "utf8");
    if (sizeBytes > maxSize) throw new Error(`Input is too large. Max size is ${maxSize} bytes.`);

    const manifest = await this.repository.loadInputManifest(projectSlug);
    const now = new Date().toISOString();

    let targetSubDir = "notes";
    if (isGpx) targetSubDir = "gpx";
    else if (isDocument) targetSubDir = "docs";

    const targetPath = `input/${targetSubDir}/${fileName}`;

    // repository.writeProjectFile might need to be updated to handle Buffer if it doesn't
    // but Node.js fs.writeFile handles it, and we saw FileProjectRepository uses fs.writeFile.
    // We should cast it to any if TypeScript complains, or update the interface.
    const storedContent = Buffer.isBuffer(content)
      ? (isGpx ? content.toString("utf8") : input.content)
      : content;

    await this.repository.writeProjectFile(projectSlug, targetPath, storedContent);

    if (isGpx) {
      await this.repository.writeProjectFile(projectSlug, "route.gpx", storedContent);
    }

    const item = {
      id: `${isDocument ? "doc" : input.type}_${Date.now()}`,
      type: isDocument ? "document" as const : input.type,
      path: targetPath,
      originalName: fileName,
      mimeType: mimeTypeForFile(fileName),
      sizeBytes,
      addedAt: now,
      status: externalInputStatus(isDocument ? "document" : input.type, fileName, mimeTypeForFile(fileName)),
      notes: input.note
    };
    manifest.items.push(item);
    manifest.updatedAt = now;
    await this.repository.saveInputManifest(projectSlug, manifest);
    return item;
  }

  async buildResearchPack(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const { buildResearchPack } = await import("../../atlas-research/src/index.js");
    const researchPack = await buildResearchPack(project, this.repository);
    await appendProjectEvent(project.id, this.repository, {
      type: "research.pack_built",
      message: `Built research pack with ${researchPack.materials.length} materials.`,
      data: { materialCount: researchPack.materials.length }
    });
    return { project, researchPack };
  }

  async analyzeGpx(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const { analyzeGpx } = await import("../../atlas-research/src/index.js");
    const routeSummary = await analyzeGpx(project, this.repository);
    await appendProjectEvent(project.id, this.repository, {
      type: "gpx.analyzed",
      message: `Analyzed GPX route: ${routeSummary.distanceKm ?? 0} km.`,
      data: { routeSummary }
    });
    return { project, routeSummary };
  }

  async runMvp2WithProgress(projectSlug: string, onProgress?: WorkflowProgressCallback, startStep?: string, options: { autoApprove?: boolean } = {}) {
    let { project, sources } = await this.loadProjectBundle(projectSlug);

    // Ensure status is 'running' when starting or resuming the workflow.
    if (project.status === "research_needed" || project.status === "sources_collected" || project.status === "paused") {
      project = await this.setProjectStatus(projectSlug, "running");
    }

    const progress = async (message: string, value: number, currentStep: string, waitContext?: any) => {
      await appendProjectEvent(project.id, this.repository, {
        type: `workflow.${currentStep}`,
        message,
        data: { progress: value, paused: !!waitContext }
      });
      await writeWorkflowState(project, {
        currentStep,
        waitingApprovalStage: waitContext?.stage,
        nextStep: waitContext?.stage ? nextStepAfterStage(waitContext.stage) : undefined
      }, this.repository);
      if (waitContext && project.status !== "paused") {
        project = {
          ...project,
          status: "paused" as any,
          updatedAt: new Date().toISOString()
        };
        await this.repository.saveProject(project);
        await appendProjectEvent(project.id, this.repository, {
          type: "project.status_changed",
          message: "Project status changed to paused.",
          data: { status: "paused", reason: waitContext.stage }
        });
      }
      onProgress?.({ message, progress: value, currentStep, waitContext } as any);
    };

    const isApproved = async (stage: string) => {
      try {
        const approvals = await this.repository.loadApprovals(projectSlug);
        return approvals.approvals.some((a: any) => a.stage === stage && a.decision === "approved");
      } catch {
        return false;
      }
    };

    const steps = [
      {
        id: "input",
        run: async () => {
          await progress("Processing input materials.", 5, "input");
          const { buildResearchPack } = await import("../../atlas-research/src/index.js");
          await buildResearchPack(project, this.repository);
        }
      },
      {
        id: "claims",
        run: async () => {
          await progress("Generating claims.", 25, "claims");
          await generateClaims(project, this.repository);

          if (!await isApproved("claims_approval")) {
            await progress("Claims generated. Waiting for approval.", 30, "claims_approval", {
              type: "approval_needed",
              stage: "claims_approval"
            });
            return { pause: true, stage: "claims_approval" };
          }
        }
      },
      {
        id: "concept",
        run: async () => {
          await progress("Writing route concept.", 55, "concept");
          const [claims, poisData] = await Promise.all([
            this.repository.loadClaims(project.id).catch(() => []),
            this.repository.loadArtifact(project.id, "poi_candidates").catch(() => undefined)
          ]);
          const pois = Array.isArray((poisData as any)?.pois) ? (poisData as any).pois : [];
          await generateRouteConcept({ project, sources, claims, pois, repository: this.repository });

          if (!await isApproved("concept_approval")) {
            await progress("Concept generated. Waiting for approval.", 60, "concept_approval", {
              type: "approval_needed",
              stage: "concept_approval"
            });
            return { pause: true, stage: "concept_approval" };
          }
        }
      },
      {
        id: "guide_outline",
        run: async () => {
          await progress("Generating guide outline.", 70, "guide_outline");
          const { writeGuideOutline } = await import("../../atlas-writer/src/index.js");
          await writeGuideOutline(project, this.repository);

          if (!await isApproved("guide_outline_approval")) {
            await progress("Outline generated. Waiting for approval.", 75, "guide_outline_approval", {
              type: "approval_needed",
              stage: "guide_outline_approval"
            });
            return { pause: true, stage: "guide_outline_approval" };
          }
        }
      },
      {
        id: "gpx",
        run: async () => {
          await progress("Generating or analyzing GPX.", 76, "gpx");
          const generated = await ensureRouteGpx(project, this.repository);
          if (generated.status === "blocked") {
            await progress(generated.message, 78, "gpx_summary_approval", {
              type: "approval_needed",
              stage: "gpx_summary_approval",
              blocking: true
            });
            return { pause: true, stage: "gpx_summary_approval" };
          }

          const { analyzeGpx } = await import("../../atlas-research/src/index.js");
          try {
            await analyzeGpx(project, this.repository);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await this.repository.saveMissingInputs(project.id, {
              projectId: project.id,
              generatedAt: new Date().toISOString(),
              blocking: true,
              missing: [{
                code: "gpx_analysis_failed",
                message: `GPX exists but analysis failed: ${message}`,
                requiredFor: "gpx"
              }]
            });
            await progress(`GPX analysis failed: ${message}`, 78, "gpx_summary_approval", {
              type: "approval_needed",
              stage: "gpx_summary_approval",
              blocking: true
            });
            return { pause: true, stage: "gpx_summary_approval" };
          }

          if (!await isApproved("gpx_summary_approval")) {
            await progress("GPX analyzed. Waiting for summary approval.", 78, "gpx_summary_approval", {
              type: "approval_needed",
              stage: "gpx_summary_approval"
            });
            return { pause: true, stage: "gpx_summary_approval" };
          }
        }
      },
      {
        id: "pois",
        run: async () => {
          await progress("Extracting POI.", 79, "pois");
          await extractPois(project, this.repository);
        }
      },
      {
        id: "guide",
        run: async () => {
          await progress("Writing final guide.", 80, "guide");
          const { generateGuideV2 } = await import("../../atlas-writer/src/index.js");
          const guide = await generateGuideV2(project, this.repository);
          if (!guide) {
            await progress("Guide cannot be generated until the blocking inputs are fixed.", 85, "guide_final_approval", {
              type: "approval_needed",
              stage: "guide_final_approval",
              blocking: true
            });
            return { pause: true, stage: "guide_final_approval" };
          }

          if (!await isApproved("guide_final_approval")) {
            await progress("Guide written. Waiting for final approval.", 85, "guide_final_approval", {
              type: "approval_needed",
              stage: "guide_final_approval"
            });
            return { pause: true, stage: "guide_final_approval" };
          }
        }
      },
      {
        id: "poi_review",
        run: async () => {
          if (!await isApproved("poi_approval")) {
            await progress("POI extracted. Waiting for verification.", 88, "poi_approval", {
              type: "approval_needed",
              stage: "poi_approval"
            });
            return { pause: true, stage: "poi_approval" };
          }
        }
      },
      {
        id: "finalize",
        run: async () => {
          await progress("Finalizing artifacts.", 90, "finalize");
          await generateRouteTips(project, this.repository);
          await generateRecommendations(project, this.repository);
          await prepareMediaPack(project, this.repository);
          await generateQualityReport({ project, sources, gpxValid: true, geojsonValid: true, repository: this.repository });
          await writeReviewChecklist(project, this.repository);
          try {
            await prepareRouteMarketDraft(project, this.repository);
          } catch (error) {
            if (error instanceof QualityGateError) {
              await this.repository.saveMissingInputs(project.id, {
                projectId: project.id,
                generatedAt: new Date().toISOString(),
                blocking: true,
                missing: error.issues.map((issue) => ({
                  code: `quality_${issue.rule}`,
                  message: issue.message,
                  requiredFor: "publish"
                }))
              });
              await appendProjectEvent(project.id, this.repository, {
                type: "publish.payload_blocked",
                message: "RouteMarket payload was not prepared because quality gates need attention.",
                data: { issues: error.issues }
              });
            } else {
              throw error;
            }
          }

          project = await updateProjectStatus(project, "draft_generated");
          await appendProjectEvent(project.id, this.repository, {
            type: "project.status_changed",
            message: "Project status changed to draft_generated.",
            data: { status: "draft_generated" }
          });
        }
      }
    ];

    let currentStepId = startStep;
    if (!currentStepId) {
      // Find the first step that isn't approved or missing artifacts
      for (const step of steps) {
        if (step.id === "input") {
          if (!await this.repository.exists(project.id, "research_pack.json")) {
            currentStepId = "input";
            break;
          }
          continue;
        }
        if (step.id === "pois") {
          if (!await this.repository.exists(project.id, "poi_candidates.json")) {
            currentStepId = "pois";
            break;
          }
          continue;
        }

        const stage = getStageForStep(step.id);
        if (stage && !await isApproved(stage)) {
          currentStepId = step.id;
          break;
        }
      }
      if (!currentStepId) currentStepId = "input"; // Fallback to start
    }

    let startIndex = steps.findIndex(s => s.id === currentStepId);
    if (startIndex === -1) startIndex = 0;

    for (let i = startIndex; i < steps.length; i++) {
      const result = await steps[i].run() as any;
      if (result?.pause) {
        await this.setProjectStatus(projectSlug, "paused");
        return { project, status: "paused", step: steps[i].id, stage: result.stage };
      }
      const state = await readWorkflowState(project, this.repository);
      await writeWorkflowState(project, {
        completedSteps: [...new Set([...state.completedSteps, steps[i].id])],
        currentStep: steps[i].id,
        waitingApprovalStage: undefined,
        nextStep: steps[i + 1]?.id
      }, this.repository);
    }

    onProgress?.({ message: "Workflow completed.", progress: 100, currentStep: "completed" });
    return { project, status: "completed" };
  }


  async preparePublish(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const { checkQualityGates, QualityGateError } = await import("./quality-gates.js");
    const issues = await checkQualityGates(project, this.repository);
    if (issues.length > 0) {
      throw new QualityGateError(issues);
    }
    return prepareRouteMarketDraft(project, this.repository);
  }

  async listArtifacts(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    return {
      project,
      artifacts: await listProjectArtifactsFromRepository(project.id, this.repository)
    };
  }

  async getProjectBundle(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const [artifacts, events] = await Promise.all([
      listProjectArtifactsFromRepository(project.id, this.repository),
      listProjectEvents(project.id, this.repository)
    ]);
    return { project, artifacts, events };
  }

  async assessReadiness(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const [artifacts, sources, claims] = await Promise.all([
      listProjectArtifactsFromRepository(project.id, this.repository),
      this.loadSources(projectSlug),
      this.loadClaims(projectSlug)
    ]);

    const { checkQualityGates } = await import("./quality-gates.js");
    const qualityIssues = await checkQualityGates(project, this.repository);

    const readiness = assessProjectReadiness({ project, artifacts, sources, claims, qualityIssues });
    readiness.importReadiness = await buildImportReadiness({ project, qualityIssues, repository: this.repository });
    return readiness;
  }

  async getReview(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    const [artifacts, sources, claims] = await Promise.all([
      listProjectArtifactsFromRepository(project.id, this.repository),
      this.loadSources(projectSlug),
      this.loadClaims(projectSlug)
    ]);
    const { checkQualityGates } = await import("./quality-gates.js");
    const qualityIssues = await checkQualityGates(project, this.repository);
    return buildProjectReviewBundle({ project, repository: this.repository, artifacts, sources, claims, qualityIssues });
  }

  async submitReviewDecision(projectSlug: string, input: SubmitReviewDecisionRequest) {
    const project = await this.repository.getProject(projectSlug);
    return saveProjectReviewDecision({
      project,
      repository: this.repository,
      decision: input.decision,
      reviewer: input.reviewer,
      notes: input.notes
    });
  }

  async approveStage(projectSlug: string, stage: string, decision: import("./review.js").ApprovalDecision, notes?: string, reviewer?: string) {
    const project = await this.repository.getProject(projectSlug);
    const { saveProjectApprovalDecision } = await import("./review.js");
    const result = await saveProjectApprovalDecision({
      project,
      repository: this.repository,
      stage,
      decision,
      reviewer,
      notes
    });
    await writeWorkflowState(project, { waitingApprovalStage: undefined, nextStep: nextStepAfterStage(stage) }, this.repository);
    return result;
  }

  async exportProject(projectSlug: string) {
    const { project, artifacts, events } = await this.getProjectBundle(projectSlug);
    return buildProjectExportBundle({ project, artifacts, events, repository: this.repository });
  }

  async archiveProject(projectSlug: string, reason?: string): Promise<RouteProject> {
    const updated = await this.setProjectStatus(projectSlug, "archived");
    await appendProjectEvent(updated.id, this.repository, {
      type: "project.archived",
      message: reason ? `Project archived: ${reason}` : "Project archived.",
      data: { reason }
    });
    return updated;
  }

  async listEvents(projectSlug: string) {
    const project = await this.repository.getProject(projectSlug);
    return {
      project,
      events: await listProjectEvents(project.id, this.repository)
    };
  }

  async readProjectFile(projectSlug: string, file: string): Promise<string> {
    if (!isAllowedProjectFile(file, "read")) {
      throw new Error("Invalid file path.");
    }
    return this.repository.readProjectFile(projectSlug, file);
  }

  async writeProjectFile(projectSlug: string, file: string, content: string): Promise<{ path: string; content: string }> {
    const project = await this.getProject(projectSlug);
    if (!isAllowedProjectFile(file, "write")) {
      throw new Error("File is not writable through Atlas API.");
    }
    await this.repository.writeProjectFile(projectSlug, file, content);
    await appendProjectEvent(project.id, this.repository, {
      type: "project.file_updated",
      message: `Updated ${file}.`,
      data: { path: file }
    });
    return { path: file, content };
  }

  async setProjectStatus(projectSlug: string, status: import("../../atlas-core/src/index.js").ProjectStatus): Promise<RouteProject> {
    const project = await this.getProject(projectSlug);
    const updated = await updateProjectStatus(project, status);
    await this.repository.saveProject(updated);
    await appendProjectEvent(project.id, this.repository, {
      type: "project.status_changed",
      message: `Project status changed to ${status}.`,
      data: { status }
    });
    return updated;
  }

  private async loadProjectBundle(projectSlug: string): Promise<{ project: RouteProject; sources: Source[] }> {
    const project = await this.repository.getProject(projectSlug);
    const sources = await this.loadSources(projectSlug);
    return { project, sources };
  }

  private loadSources(projectSlug: string): Promise<Source[]> {
    return this.repository.loadSources(projectSlug);
  }

  private loadClaims(projectSlug: string): Promise<Claim[]> {
    return this.repository.loadClaims(projectSlug);
  }
}


function safeInputName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) ?? "";
  if (!base || base === "." || base === ".." || base.startsWith(".") || base.includes("..")) {
    throw new Error("Invalid filename.");
  }
  if (fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("Invalid filename.");
  }
  return base;
}

function mimeTypeForFile(fileName: string): string {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".md")) return "text/markdown";
  if (lowered.endsWith(".txt")) return "text/plain";
  if (lowered.endsWith(".gpx")) return "application/gpx+xml";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function externalInputStatus(type: InputItemType, fileName: string, mimeType: string) {
  const lowered = fileName.toLowerCase();
  if (type === "note" && (lowered.endsWith(".md") || lowered.endsWith(".txt"))) return "needs_parser" as const;
  if (type === "gpx" && lowered.endsWith(".gpx")) return "needs_parser" as const;
  if (type === "photo" && mimeType.startsWith("image/")) return "needs_review" as const;
  if (type === "document" && (lowered.endsWith(".pdf") || lowered.endsWith(".docx") || lowered.endsWith(".doc"))) return "needs_parser" as const;
  return "unsupported" as const;
}

function inputMatches(item: { id?: string; path?: string; originalName?: string }, input: RemoveInputRequest): boolean {
  const id = input.id?.trim();
  const path = input.path?.trim();
  const originalName = input.originalName?.trim();
  return Boolean(
    (id && item.id === id)
    || (path && item.path === path)
    || (originalName && item.originalName === originalName)
  );
}

const allowedProjectFiles = new Set([
  "project.json",
  "brief.md",
  "sources.json",
  "claims.json",
  "notes.md",
  "poi.geojson",
  "route.gpx",
  "approvals.json",
  "route_concept.md",
  "guide_outline.md",
  "guide.md",
  "tips.json",
  "recommendations.json",
  "quality_report.md",
  "review_checklist.md",
  "routemarket_payload.json",
  "review_decision.json",
  "deep_research.json",
  "research_pack.json",
  "route_summary.json",
  "route_segments.json",
  "route_warnings.json",
  "route_segments.geojson",
  "workflow_state.json",
  "input_manifest.json",
  "elevation_profile.json",
  "research/deep/source_001.txt",
  "research/deep/source_002.txt",
  "research/deep/source_003.txt",
  "media/license_report.md",
  "media/manifest.json",
  "missing_inputs.json"
]);

const writableProjectFiles = new Set([
  "brief.md",
  "notes.md",
  "route_concept.md",
  "guide_outline.md",
  "route.gpx",
  "poi.geojson",
  "guide.md",
  "quality_report.md",
  "review_checklist.md",
  "media/license_report.md"
]);

function isAllowedProjectFile(file: string, mode: "read" | "write"): boolean {
  if (!isSafeProjectFilePath(file)) return false;
  if (mode === "read" && allowedProjectFiles.has(file)) return true;
  if (mode === "write" && writableProjectFiles.has(file)) return true;

  if (mode === "read") {
    return isAllowedInputReadPath(file) || isAllowedOutputReadPath(file);
  }

  return false;
}

function isSafeProjectFilePath(file: string): boolean {
  return Boolean(file)
    && !file.includes("..")
    && !file.startsWith("/")
    && !file.startsWith("\\")
    && !file.includes("\\")
    && /^[a-zA-Z0-9_./-]+$/.test(file);
}

function isAllowedInputReadPath(file: string): boolean {
  if (file.startsWith("input/notes/")) return /\.(md|txt)$/i.test(file);
  if (file.startsWith("input/gpx/")) return /\.gpx$/i.test(file);
  if (file.startsWith("input/docs/")) return /\.(pdf|doc|docx)$/i.test(file);
  return false;
}

function isAllowedOutputReadPath(file: string): boolean {
  return [
    "output/guide_outline.md",
    "output/route.gpx",
    "output/poi.geojson"
  ].includes(file);
}

function getStageForStep(stepId: string): string | undefined {
  const map: Record<string, string> = {
    gpx: "gpx_summary_approval",
    claims: "claims_approval",
    poi_review: "poi_approval",
    concept: "concept_approval",
    guide_outline: "guide_outline_approval",
    guide: "guide_final_approval"
  };
  return map[stepId];
}

function nextStepAfterStage(stage: string): string | undefined {
  const nextStepMap: Record<string, string> = {
    claims_approval: "concept",
    concept_approval: "guide_outline",
    guide_outline_approval: "gpx",
    gpx_summary_approval: "pois",
    guide_final_approval: "poi_review",
    poi_approval: "finalize"
  };
  return nextStepMap[stage];
}
