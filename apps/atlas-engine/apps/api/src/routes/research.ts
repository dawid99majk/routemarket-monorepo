import { ResearchBodySchema } from "../schemas.js";
import { readJson } from "../http.js";

export const researchHandler = async ({ req, service }: any) => {
  const body = ResearchBodySchema.parse(await readJson(req));
  
  const project = await service.createProject({
    topic: body.userIntent.substring(0, 50) || "AI Researched Route",
    category: "touring"
  });

  const gpxContent = await fetch(body.gpxUrl).then(r => r.text());
  await service.addGpxText(project.id, { content: gpxContent, fileName: "route.gpx" });
  await service.addNoteText(project.id, { content: body.userIntent, fileName: "user_intent.md" });

  await service.runDeepResearch(project.id, { sourceLimit: 3 });
  await service.runMvp2(project.id);
  await service.setProjectStatus(project.id, "published");

  return {
    projectId: project.id,
    status: "completed"
  };
};
