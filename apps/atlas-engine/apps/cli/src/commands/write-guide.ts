import { Command } from "commander";
import { generateGuideDraft } from "@routemarket/atlas-writer/src/index.js";
import { loadProject, loadProjectSources, loadProjectClaims, loadProjectPois, loadProjectConcept } from "./load-project.js";

export function registerWriteGuideCommand(program: Command): void {
  program
    .command("write-guide")
    .description("Generate guide.md for a route project based on research and concept")
    .requiredOption("--project <project>", "Project slug")
    .action(async (options) => {
      const project = await loadProject(process.cwd(), options.project);
      const sources = await loadProjectSources(project);
      const claims = await loadProjectClaims(project);
      const pois = await loadProjectPois(project);
      const concept = await loadProjectConcept(project);
      const guide = await generateGuideDraft({ project, sources, claims, pois, concept });
      console.log(`Wrote guide draft for ${project.id} (${guide.length} characters)`);
    });
}
