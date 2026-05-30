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

export interface AuthenticatedRouteBuilderUser {
  id: string;
  email?: string;
  roles: string[];
}

export class RouteBuilderRepository {
  async getAuthenticatedUser(accessToken: string): Promise<AuthenticatedRouteBuilderUser | null> {
    if (isMock && accessToken === 'dev-token') {
      return { id: 'dev-user', email: 'dev@routemarket.local', roles: ['admin'] };
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id);

    const roles = (rolesData || []).map((row: any) => row.role);
    return {
      id: data.user.id,
      email: data.user.email,
      roles: roles.length > 0 ? roles : ['user']
    };
  }

  canAccessProject(project: RouteProject, user: AuthenticatedRouteBuilderUser): boolean {
    if (user.roles.includes('admin')) return true;
    return Boolean(project.user_id && project.user_id === user.id);
  }

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

  async listProjects(user: AuthenticatedRouteBuilderUser, limit = 25): Promise<RouteProject[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    if (isMock) {
      return Object.values(mockProjects)
        .filter((project) => this.canAccessProject(project, user))
        .slice(0, safeLimit);
    }

    let query = supabase
      .from('route_builder_projects')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(safeLimit);

    if (!user.roles.includes('admin')) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as RouteProject[];
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

  async deleteProject(id: string): Promise<boolean> {
    if (isMock) {
      if (!mockProjects[id]) return false;
      delete mockProjects[id];
      delete mockJobs[id];
      delete mockArtifacts[id];
      return true;
    }

    const { error } = await supabase
      .from('route_builder_projects')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return true;
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

  async getProjectJobs(projectId: string, limit = 10): Promise<RouteBuilderJob[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    if (isMock) {
      return Object.values(mockJobs)
        .filter((job) => job.project_id === projectId)
        .slice(0, safeLimit);
    }

    const { data, error } = await supabase
      .from('route_builder_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw new Error(error.message);
    return (data || []) as RouteBuilderJob[];
  }

  async updateJobState(id: string, updates: Partial<RouteBuilderJob>): Promise<RouteBuilderJob> {
    if (isMock) {
      if (!mockJobs[id]) throw new Error('Job not found');
      mockJobs[id] = { ...mockJobs[id], ...updates, updated_at: new Date().toISOString() };
      return mockJobs[id];
    }

    const { data, error } = await supabase
      .from('route_builder_jobs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw new Error(error.message);
    return data as RouteBuilderJob;
  }

  async claimNextQueuedJob(workerId: string): Promise<RouteBuilderJob | null> {
    if (isMock) {
      const job = Object.values(mockJobs)
        .filter((item) => item.status === 'queued')
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0];
      if (!job) return null;
      mockJobs[job.id] = {
        ...job,
        status: 'running',
        current_step: 'claimed',
        progress: Math.max(job.progress || 0, 5),
        human_message: 'Zadanie zostało przejęte przez worker.',
        locked_by: workerId,
        locked_at: new Date().toISOString(),
        attempt_count: (job.attempt_count || 0) + 1,
        updated_at: new Date().toISOString()
      };
      return mockJobs[job.id];
    }

    const { data: queued, error: queueError } = await supabase
      .from('route_builder_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);

    if (queueError) throw new Error(queueError.message);
    const next = queued?.[0] as RouteBuilderJob | undefined;
    if (!next) return null;

    const { data: claimed, error: claimError } = await supabase
      .from('route_builder_jobs')
      .update({
        status: 'running',
        current_step: 'claimed',
        progress: Math.max(next.progress || 0, 5),
        human_message: 'Zadanie zostało przejęte przez worker.',
        locked_by: workerId,
        locked_at: new Date().toISOString(),
        attempt_count: (next.attempt_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', next.id)
      .eq('status', 'queued')
      .select()
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    return claimed as RouteBuilderJob | null;
  }

  async requeueStaleRunningJobs(staleAfterMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString();
    if (isMock) {
      let count = 0;
      for (const job of Object.values(mockJobs)) {
        const lockedAt = job.locked_at || job.updated_at || job.created_at;
        if (job.status === 'running' && lockedAt && lockedAt < cutoff) {
          mockJobs[job.id] = {
            ...job,
            status: 'queued',
            current_step: 'retrying',
            progress: 0,
            human_message: 'Zadanie wznowione po przerwanym workerze.',
            locked_by: null,
            locked_at: null,
            updated_at: new Date().toISOString()
          };
          count += 1;
        }
      }
      return count;
    }

    const stalePayload = {
      status: 'queued',
      current_step: 'retrying',
      progress: 0,
      human_message: 'Zadanie wznowione po przerwanym workerze.',
      locked_by: null,
      locked_at: null,
      updated_at: new Date().toISOString()
    };

    const { data: lockedRows, error: lockedError } = await supabase
      .from('route_builder_jobs')
      .update(stalePayload)
      .eq('status', 'running')
      .lt('locked_at', cutoff)
      .select('id');
    if (lockedError) throw new Error(lockedError.message);

    const { data: legacyRows, error: legacyError } = await supabase
      .from('route_builder_jobs')
      .update(stalePayload)
      .eq('status', 'running')
      .is('locked_at', null)
      .lt('updated_at', cutoff)
      .select('id');
    if (legacyError) throw new Error(legacyError.message);

    return (lockedRows?.length || 0) + (legacyRows?.length || 0);
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
      .order('created_at', { ascending: false })
      .limit(1)
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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as RouteArtifact;
  }

}

export const repo = new RouteBuilderRepository();
