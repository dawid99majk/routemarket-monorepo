import { useState, useCallback } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { Project, EventLog, PipelineStep, PoiGeoJson } from '@/features/creator/types/creator.types';
import { toast } from 'sonner';

const stepOrder: PipelineStep[] = ['sources', 'interview', 'outline', 'gpx', 'guide', 'media', 'publish'];

type WorkflowState = {
  currentStep?: string;
  nextStep?: string;
  waitingApprovalStage?: string;
  completedSteps?: string[];
};

export function useAtlasProjectWorkspace(slug: string | null) {
  const { invokeAtlas } = useAtlasApi();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [activeStep, setActiveStep] = useState<PipelineStep>('sources');
  const [maxAllowedIdx, setMaxAllowedIdx] = useState(0);

  // Artifacts
  const [notes, setNotes] = useState('');
  const [gpxXml, setGpxXml] = useState('');
  const [outline, setOutline] = useState('');
  const [guide, setGuide] = useState('');
  const [poiGeoJson, setPoiGeoJson] = useState<PoiGeoJson | null>(null);
  const [claims, setClaims] = useState<any[]>([]);

  const loadFile = useCallback(async (path: string) => {
    if (!slug) return '';
    try {
      const data = await invokeAtlas('get_file', { slug, path }) as { content?: string };
      if (data.content) return data.content;

      // Fallback for common subdirectories if root file is missing/empty
      const fallbacks: Record<string, string[]> = {
        'notes.md': ['input/notes/notes.md', 'input/notes/notes.txt'],
        'interview_answers.md': ['input/notes/interview_answers.md'],
        'guide_outline.md': ['output/guide_outline.md', 'route_concept.md'],
        'route.gpx': ['output/route.gpx', 'input/gpx/route.gpx'],
        'poi.geojson': ['output/poi.geojson']
      };

      if (fallbacks[path]) {
        for (const fallbackPath of fallbacks[path]) {
          const fallbackData = await invokeAtlas('get_file', { slug, path: fallbackPath }) as { content?: string };
          if (fallbackData.content) return fallbackData.content;
        }
      }

      return '';
    } catch (err) {
      console.warn(`Failed to load project file ${path}:`, err);
      return '';
    }
  }, [slug, invokeAtlas]);

  const fetchWorkspace = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      setNotes('');
      setGpxXml('');
      setOutline('');
      setGuide('');
      setPoiGeoJson(null);
      setClaims([]);

      const [detailData, eventData, workflowData] = await Promise.all([
        invokeAtlas('get_project', { slug }),
        invokeAtlas('list_events', { slug }),
        invokeAtlas('get_workflow_state', { slug }).catch(() => null)
      ]) as [{ project: Project }, { events?: EventLog[] }, { content?: string } | null];

      const proj = detailData.project;
      const eventsList = eventData.events ?? [];
      const workflowState = parseWorkflowState(workflowData?.content);
      setProject(proj);
      setEvents(eventsList);

      const claimsContent = await loadFile('claims.json');
      try { setClaims(claimsContent ? JSON.parse(claimsContent) : []); } catch { setClaims([]); }

      // 1. Determine Base Step from Status
      const status = proj.status;
      const waitingStage = workflowState?.waitingApprovalStage || proj.waitingApprovalStage;
      let targetStep: PipelineStep = 'sources';
      let currentMaxIdx = 0;

      if (status === 'created' || status === 'research_needed') {
        targetStep = 'sources';
        currentMaxIdx = 1;
      } else if (status === 'sources_collected') {
        targetStep = 'interview';
        currentMaxIdx = 1;
      } else if (status === 'ready_for_review' || status === 'changes_requested' || waitingStage) {
        currentMaxIdx = 5;
        if (waitingStage === 'gpx_summary_approval') targetStep = 'gpx';
        else if (waitingStage === 'guide_outline_approval' || waitingStage === 'concept_approval') targetStep = 'outline';
        else if (waitingStage === 'guide_final_approval') targetStep = 'guide';
        else if (waitingStage === 'claims_approval') targetStep = 'interview';
        else if (waitingStage === 'poi_approval') targetStep = 'media';
      } else if (status === 'draft_generated' || status === 'approved_for_publish' || status === 'completed') {
        targetStep = 'publish';
        currentMaxIdx = 6;
      }

      const completedSteps = new Set(workflowState?.completedSteps ?? (Array.isArray((proj as any).completedSteps) ? (proj as any).completedSteps : []));
      for (const completed of completedSteps) {
        const mapped = pipelineStepFromWorkflowStep(completed);
        if (mapped) currentMaxIdx = Math.max(currentMaxIdx, stepOrder.indexOf(mapped) + 1);
      }

      const workflowMappedStep = pipelineStepFromWorkflowStep(workflowState?.currentStep || (proj as any).currentStep);
      if (workflowMappedStep) {
        targetStep = workflowMappedStep;
        currentMaxIdx = Math.max(currentMaxIdx, stepOrder.indexOf(workflowMappedStep));
      }

      // 2. Event-Driven Overrides (more reliable if status lags)
      const hasInterview = eventsList.some(e =>
        (e.type === 'input.note_added' && JSON.stringify(e.data).includes('interview_answers.md')) ||
        ['workflow.concept_approval', 'workflow.concept_final_approval'].includes(e.type || '')
      );
      const hasOutline = eventsList.some(e => (e.type === 'workflow.guide_outline_approval' || JSON.stringify(e.data).includes('guide_outline.md')));
      const hasGpx = eventsList.some(e => (e.type === 'workflow.gpx_summary_approval' || JSON.stringify(e.data).includes('route.gpx')));
      const hasGuide = eventsList.some(e => (e.type === 'workflow.guide_final_approval' || JSON.stringify(e.data).includes('guide.md')));

      if (hasGuide) { targetStep = 'guide'; currentMaxIdx = Math.max(currentMaxIdx, 4); }
      else if (hasGpx) { targetStep = 'gpx'; currentMaxIdx = Math.max(currentMaxIdx, 3); }
      else if (hasOutline) { targetStep = 'outline'; currentMaxIdx = Math.max(currentMaxIdx, 2); }
      else if (hasInterview) {
        if (targetStep === 'sources') targetStep = 'outline';
        currentMaxIdx = Math.max(currentMaxIdx, 2);
      }

      currentMaxIdx = Math.min(Math.max(currentMaxIdx, stepOrder.indexOf(targetStep)), stepOrder.length - 1);
      setActiveStep(targetStep);
      setMaxAllowedIdx(currentMaxIdx);

      // 3. Load artifacts based on target step
      const loadAllFiles = async () => {
        // Special logic for notes: merge ANY .txt/.md file from inputs
        let allNotes = await loadFile('notes.md');
        if (eventsList.length > 0) {
          const noteEvents = eventsList.filter(e => e.type === 'input.note_added');
          for (const e of noteEvents) {
            const fileName = (e.data as any)?.item?.originalName || (e.data as any)?.item?.name;
            if (fileName && fileName !== 'notes.md' && fileName !== 'interview_answers.md') {
              const extraNote = await loadFile(`input/notes/${fileName}`);
              if (extraNote) allNotes += `\n\n--- ${fileName} ---\n\n${extraNote}`;
            }
          }
        }
        setNotes(allNotes);

        if (stepOrder.indexOf(targetStep) >= stepOrder.indexOf('outline') || hasOutline) setOutline(await loadFile('guide_outline.md'));
        if (stepOrder.indexOf(targetStep) >= stepOrder.indexOf('gpx') || hasGpx) setGpxXml(await loadFile('route.gpx'));
        if (stepOrder.indexOf(targetStep) >= stepOrder.indexOf('guide') || hasGuide) setGuide(await loadFile('guide.md'));
        if (stepOrder.indexOf(targetStep) >= stepOrder.indexOf('media')) {
          const poiContent = await loadFile('poi.geojson');
          try { setPoiGeoJson(poiContent ? JSON.parse(poiContent) : null); } catch { setPoiGeoJson(null); }
        }
      };
      await loadAllFiles();

    } catch (err) {
      console.error(err);
      toast.error('Błąd ładowania projektu: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug, invokeAtlas, loadFile]);

  return {
    project,
    loading,
    events,
    activeStep,
    setActiveStep,
    maxAllowedStep: stepOrder[maxAllowedIdx] as PipelineStep,
    artifacts: {
      notes, setNotes,
      gpxXml, setGpxXml,
      outline, setOutline,
      guide, setGuide,
      poiGeoJson, setPoiGeoJson,
      claims, setClaims
    },
    fetchWorkspace,
    loadFile
  };
}

function parseWorkflowState(content?: string): WorkflowState | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as WorkflowState;
  } catch {
    return null;
  }
}

function pipelineStepFromWorkflowStep(step?: string): PipelineStep | undefined {
  const map: Record<string, PipelineStep> = {
    input: 'sources',
    gpx: 'gpx',
    gpx_summary_approval: 'gpx',
    claims: 'interview',
    claims_approval: 'interview',
    pois: 'media',
    poi_approval: 'media',
    concept: 'outline',
    concept_approval: 'outline',
    guide_outline: 'outline',
    guide_outline_approval: 'outline',
    guide: 'guide',
    guide_final_approval: 'guide',
    finalize: 'publish',
    completed: 'publish'
  };
  return step ? map[step] : undefined;
}
