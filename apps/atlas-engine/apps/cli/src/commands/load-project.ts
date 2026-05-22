import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { readJsonFile, routesPath, type RouteProject, type Source, type Claim, type Poi } from "@routemarket/atlas-core/src/index.js";

export async function loadProject(rootDir: string, slug: string): Promise<RouteProject> {
  return readJsonFile<RouteProject>(join(routesPath(rootDir, slug), "project.json"));
}

export async function loadProjectSources(project: RouteProject): Promise<Source[]> {
  try {
    return await readJsonFile<Source[]>(join(project.folderPath, "sources.json"));
  } catch {
    return [];
  }
}

export async function loadProjectClaims(project: RouteProject): Promise<Claim[]> {
  try {
    return await readJsonFile<Claim[]>(join(project.folderPath, "claims.json"));
  } catch {
    return [];
  }
}

export async function loadProjectPois(project: RouteProject): Promise<Poi[]> {
  try {
    const geojson = await readJsonFile<any>(join(project.folderPath, "poi.geojson"));
    return geojson.features.map((f: any) => ({
      name: f.properties.name,
      description: f.properties.description,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0]
    }));
  } catch {
    return [];
  }
}

export async function loadProjectConcept(project: RouteProject): Promise<string> {
  try {
    return await readFile(join(project.folderPath, "route_concept.md"), "utf8");
  } catch {
    return "";
  }
}
