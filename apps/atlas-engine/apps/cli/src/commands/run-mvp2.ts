import { Command } from "commander";
import { AtlasWorkflowService } from "@routemarket/atlas-workflow/src/index.js";
import { InteractiveAgent } from "@routemarket/atlas-workflow/src/interactive-agent.js";
import { FileProjectRepository } from "@routemarket/atlas-core/src/index.js";

export function registerRunMvp2Command(program: Command): void {
  program
    .command("run-mvp2")
    .description("Run MVP 2 local pipeline with interactive agent")
    .requiredOption("--project <project>", "Project slug")
    .option("--interactive", "Run interactive conversation first")
    .option("--step <step>", "Step to start/resume from")
    .action(async (options) => {
      const rootDir = process.cwd();
      const repository = new FileProjectRepository(rootDir);
      const service = new AtlasWorkflowService({ rootDir, repository });
      const project = await service.getProject(options.project);

      if (options.interactive) {
        const agent = new InteractiveAgent(project, service, repository);
        await agent.runConversationLoop();
      }

      const result = await service.runMvp2WithProgress(
        options.project, 
        (progress) => {
          console.log(`[${progress.currentStep}] ${progress.message} (${progress.progress}%)`);
        },
        options.step
      );

      if (result.status === "paused") {
        console.log(`\nWorkflow PAUSED at step: ${result.step}`);
        console.log(`Please approve the stage to continue.`);
        console.log(`Command: npm run atlas -- approve --project ${options.project} --stage <stage>`);
      } else {
        console.log(`\nMVP 2 pipeline COMPLETED for ${options.project}.`);
      }
    });
}
