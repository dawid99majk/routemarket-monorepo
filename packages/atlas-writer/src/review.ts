import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouteProject, ProjectRepository } from "../../atlas-core/src/index.js";

export async function writeReviewChecklist(project: RouteProject, repository?: ProjectRepository): Promise<string> {
  const issues = await buildChecklistIssues(project, repository);
  
  let header = "# Review Checklist\n\n";
  
  if (issues.length > 0) {
    header += "## ❌ PUBLISH BLOCKED\n\n";
    header += "The following quality gates failed:\n\n";
    for (const issue of issues) {
      header += `- [ ] **${issue.rule}**: ${issue.message}\n`;
    }
    header += "\n---\n\n";
  } else {
    header += "## ✅ QUALITY GATES PASSED\n\nReady for final review.\n\n---\n\n";
  }

  const checklist = `${header}## Research

- [ ] At least 3 useful sources collected
- [ ] Official/local source checked
- [ ] Important claims are not single-source

## Route

- [ ] Route concept reviewed
- [ ] POI coordinates checked
- [ ] Distance and timing validated
- [ ] GPX validated

## Safety

- [ ] Weather/season note checked
- [ ] Category-specific risks checked
- [ ] Emergency/logistics fallback considered

## RouteMarket

- [ ] Guide reviewed
- [ ] Tips reviewed
- [ ] Recommendations reviewed
- [ ] Media/license report checked
- [ ] RouteMarket payload prepared
- [ ] Human approved before publish
`;

  if (repository) {
    await repository.writeProjectFile(project.id, "review_checklist.md", checklist);
  } else {
    await writeFile(join(project.folderPath, "review_checklist.md"), checklist, "utf8");
  }
  return checklist;
}

async function buildChecklistIssues(project: RouteProject, repository?: ProjectRepository): Promise<Array<{ rule: string; message: string }>> {
  const issues: Array<{ rule: string; message: string }> = [];
  const fileExists = async (file: string) => {
    if (repository) return repository.exists(project.id, file);
    try {
      const { stat } = await import("node:fs/promises");
      await stat(join(project.folderPath, file));
      return true;
    } catch {
      return false;
    }
  };
  const readJson = async (file: string) => {
    if (repository) return JSON.parse(await repository.readProjectFile(project.id, file));
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(join(project.folderPath, file), "utf8"));
  };

  if (!await fileExists("guide.md")) {
    issues.push({ rule: "missing_guide", message: "guide.md is missing." });
  }
  if (!await fileExists("route.gpx")) {
    issues.push({ rule: "missing_gpx", message: "route.gpx is missing." });
  }

  try {
    const claims = await readJson("claims.json");
    if (!Array.isArray(claims) || claims.length < 3) {
      issues.push({ rule: "min_claims", message: "At least 3 reviewed claims are recommended." });
    }
  } catch {
    issues.push({ rule: "claims_unreadable", message: "claims.json is missing or invalid." });
  }

  try {
    const missing = await readJson("missing_inputs.json");
    if (missing?.blocking && Array.isArray(missing.missing) && missing.missing.length > 0) {
      issues.push({ rule: "blocking_missing_inputs", message: `Project has ${missing.missing.length} blocking missing inputs.` });
    }
  } catch {}

  return issues;
}
