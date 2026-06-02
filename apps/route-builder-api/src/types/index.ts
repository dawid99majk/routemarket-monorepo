import { z } from 'zod';

export const RouteRequirementsSchema = z.object({
  route_type: z.enum(['motorcycle', 'cycling', 'gravel', 'hiking', 'city_walk']),
  region: z.string().nullable().optional(),
  start_point: z.string().nullable().optional(),
  end_point: z.string().nullable().optional(),
  loop: z.boolean().default(false),
  distance_target_km: z.number().nullable().optional(),
  duration_target_h: z.number().nullable().optional(),
  difficulty: z.enum(['easy', 'moderate', 'hard', 'expert']),
  surface_preferences: z.array(z.string()).default([]),
  input_notes: z.string().nullable().optional(),
  source_links: z.array(z.string()).default([]),
  source_files: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  ai_can_suggest_missing_points: z.boolean().default(false),
  language: z.string().default('pl')
});

export type RouteRequirements = z.infer<typeof RouteRequirementsSchema>;

export type JobStatus = 'queued' | 'running' | 'waiting_for_user' | 'ready' | 'failed';

export interface RouteBuilderJob {
  id: string;
  project_id: string;
  status: JobStatus;
  current_step: string;
  progress: number;
  human_message: string;
  missing_inputs: string[];
  error_code: string | null;
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
  locked_by?: string | null;
  locked_at?: string | null;
  attempt_count?: number;
}

export interface RouteProject {
  id: string;
  created_at: string;
  user_id?: string | null;
  requirements: RouteRequirements;
}

export interface RouteArtifact {
  id: string;
  project_id: string;
  artifact_type: 'gpx' | 'report' | 'places' | 'summary' | 'research_sources' | 'alternatives' | 'analysis_result' | 'source_materials';
  file_path?: string | null;
  content?: any;
  raw_data?: string | null;
  created_at: string;
}
