import { createClient } from '@supabase/supabase-js';
import { RouteRequirements, RouteProject, RouteBuilderJob, RouteArtifact } from '../types/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';

// TODO: Fallback do operacji na pamięci w przypadku braku klucza (dla local dev bez bazy)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const isMock = SUPABASE_KEY === 'dummy_key';
const mockProjects: Record<string, RouteProject> = {};
const mockJobs: Record<string, RouteBuilderJob> = {};
const mockArtifacts: Record<string, RouteArtifact[]> = {};

export class RouteBuilderRepository {
  async createProject(requirements: RouteRequirements, userId?: string): Promise<RouteProject> {
    if (isMock) {
      const id = `proj_${Date.now()}`;
      const proj: RouteProject = { 
        id, 
        created_at: new Date().toISOString(), 
        requirements,
        user_id: userId || null
      };
      mockProjects[id] = proj;
      return proj;
    }

    const { data, error } = await supabase
      .from('route_builder_projects')
      .insert({ requirements, user_id: userId })
      .select()
      .single();
      
    if (error) throw new Error(error.message);
    return data as RouteProject;
  }

  async getProject(id: string): Promise<RouteProject | null> {
    if (isMock) return mockProjects[id] || null;

    const { data, error } = await supabase
      .from('route_builder_projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();
      
    if (error) throw new Error(error.message);
    return data as RouteProject;
  }

  async updateProject(id: string, requirements: RouteRequirements): Promise<RouteProject> {
    if (isMock) {
      if (!mockProjects[id]) throw new Error('Project not found');
      mockProjects[id].requirements = requirements;
      return mockProjects[id];
    }

    const { data, error } = await supabase
      .from('route_builder_projects')
      .update({ requirements, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw new Error(error.message);
    return data as RouteProject;
  }

  async createJob(projectId: string): Promise<RouteBuilderJob> {
    if (isMock) {
      const id = `job_${Date.now()}`;
      const job: RouteBuilderJob = {
        id, project_id: projectId, status: 'queued', current_step: 'initialized',
        progress: 0, human_message: 'Job w kolejce', missing_inputs: [],
        error_code: null, error_message: null
      };
      mockJobs[id] = job;
      return job;
    }

    const { data, error } = await supabase
      .from('route_builder_jobs')
      .insert({ project_id: projectId, current_step: 'initialized' })
      .select()
      .single();
      
    if (error) throw new Error(error.message);
    return data as RouteBuilderJob;
  }

  async getJob(id: string): Promise<RouteBuilderJob | null> {
    if (isMock) return mockJobs[id] || null;

    const { data, error } = await supabase
      .from('route_builder_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
      
    if (error) throw new Error(error.message);
    return data as RouteBuilderJob;
  }

  async updateJobState(id: string, updates: Partial<RouteBuilderJob>): Promise<RouteBuilderJob> {
    if (isMock) {
      if (!mockJobs[id]) throw new Error('Job not found');
      mockJobs[id] = { ...mockJobs[id], ...updates };
      return mockJobs[id];
    }

    const { data, error } = await supabase
      .from('route_builder_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw new Error(error.message);
    return data as RouteBuilderJob;
  }

  async createArtifact(projectId: string, type: RouteArtifact['artifact_type'], data: { content?: any, raw_data?: string, file_path?: string }): Promise<RouteArtifact> {
    if (isMock) {
      const id = `art_${Date.now()}`;
      const art: RouteArtifact = {
        id, project_id: projectId, artifact_type: type,
        ...data, created_at: new Date().toISOString()
      };
      if (!mockArtifacts[projectId]) mockArtifacts[projectId] = [];
      mockArtifacts[projectId].push(art);
      return art;
    }

    const { data: result, error } = await supabase
      .from('route_builder_artifacts')
      .insert({ project_id: projectId, artifact_type: type, ...data })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return result as RouteArtifact;
  }

  async upsertArtifact(projectId: string, type: RouteArtifact['artifact_type'], data: { content?: any, raw_data?: string, file_path?: string }): Promise<RouteArtifact> {
    if (isMock) {
      if (!mockArtifacts[projectId]) mockArtifacts[projectId] = [];
      const existingIdx = mockArtifacts[projectId].findIndex(a => a.artifact_type === type);
      if (existingIdx !== -1) {
        const existing = mockArtifacts[projectId][existingIdx];
        mockArtifacts[projectId][existingIdx] = {
          ...existing,
          ...data,
          created_at: new Date().toISOString()
        };
        return mockArtifacts[projectId][existingIdx];
      } else {
        const id = `art_${Date.now()}`;
        const art: RouteArtifact = {
          id, project_id: projectId, artifact_type: type,
          ...data, created_at: new Date().toISOString()
        };
        mockArtifacts[projectId].push(art);
        return art;
      }
    }

    const { data: existing, error: findError } = await supabase
      .from('route_builder_artifacts')
      .select('*')
      .eq('project_id', projectId)
      .eq('artifact_type', type)
      .maybeSingle();

    if (findError) throw new Error(findError.message);

    if (existing) {
      const { data: result, error } = await supabase
        .from('route_builder_artifacts')
        .update({ ...data, created_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('artifact_type', type)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return result as RouteArtifact;
    } else {
      const { data: result, error } = await supabase
        .from('route_builder_artifacts')
        .insert({ project_id: projectId, artifact_type: type, ...data })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return result as RouteArtifact;
    }
  }

  async getArtifacts(projectId: string): Promise<RouteArtifact[]> {
    if (isMock) return mockArtifacts[projectId] || [];

    const { data, error } = await supabase
      .from('route_builder_artifacts')
      .select('*')
      .eq('project_id', projectId);

    if (error) throw new Error(error.message);
    return data as RouteArtifact[];
  }

  async getArtifactByType(projectId: string, type: string): Promise<RouteArtifact | null> {
    if (isMock) return (mockArtifacts[projectId] || []).find(a => a.artifact_type === type) || null;

    const { data, error } = await supabase
      .from('route_builder_artifacts')
      .select('*')
      .eq('project_id', projectId)
      .eq('artifact_type', type)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as RouteArtifact;
  }
}

export const repo = new RouteBuilderRepository();
