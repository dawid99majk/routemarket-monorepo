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


  // --- Katalog miejsc -------------------------------------------------------
  // Zapis idzie przez backend, bo RLS daje użytkownikom wyłącznie odczyt:
  // katalog jest wspólnym dobrem i nie może być przepisywalny z przeglądarki.

  async findCatalogPlace(osmId: string | null, slug: string): Promise<any | null> {
    if (osmId) {
      const { data } = await supabase.from('place_catalog').select('*').eq('osm_id', osmId).maybeSingle();
      if (data) return data;
    }
    const { data } = await supabase.from('place_catalog').select('*').eq('slug', slug).maybeSingle();
    return data ?? null;
  }

  async insertCatalogPlace(row: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.from('place_catalog').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateCatalogPlace(id: string, patch: Record<string, unknown>): Promise<any | null> {
    if (Object.keys(patch).length <= 1) return null;
    const { data, error } = await supabase.from('place_catalog').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Opisy czekające na tłumaczenie: mają wersję polską, nie mają docelowej.
   *
   * Filtrujemy po stronie bazy, a nie w Node: przy czterystu miejscach różnica
   * jest bez znaczenia, ale ten sam zapytanie posłuży przy czterdziestu
   * tysiącach, a wtedy ściąganie całego katalogu po to, żeby odrzucić 90%,
   * przestanie być obojętne.
   */
  async listOpisyDoTlumaczenia(jezyk: string, limit = 60): Promise<any[]> {
    const { data, error } = await supabase
      .from('place_catalog')
      .select('id, name, description, description_i18n')
      .not('description_i18n->>pl', 'is', null)
      .is(`description_i18n->>${jezyk}`, null)
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Ile opisów jest w każdym języku — do raportu po tłumaczeniu. */
  async pokrycieJezykow(jezyki: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const j of jezyki) {
      const { count } = await supabase
        .from('place_catalog')
        .select('id', { count: 'exact', head: true })
        .not(`description_i18n->>${j}`, 'is', null);
      out[j] = count ?? 0;
    }
    return out;
  }

  async setVibeTags(id: string, tags: string[]): Promise<void> {
    await supabase.from('place_catalog').update({ vibe_tags: tags }).eq('id', id);
  }

  /** Cały katalog albo jedno miasto — do zadań przebudowujących zapisane dane. */
  /** Miejsca na tablicach, którym brakuje zdjęcia — do uzupełnienia z Commons. */
  async listBoardPlacesWithoutPhoto(limit = 300): Promise<any[]> {
    const { data, error } = await supabase
      .from('trip_project_places')
      .select('id, name, lat, lng, image_url, project_id, trip_projects(destination)')
      .is('image_url', null)
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async setBoardPlacePhoto(id: string, url: string): Promise<void> {
    await supabase.from('trip_project_places').update({ image_url: url }).eq('id', id);
  }

  /**
   * Identyfikatory OSM, które nie mają wracać do katalogu.
   *
   * Scalanie duplikatu przez skasowanie wiersza nie jest trwałe — seed wstawia
   * z powrotem wszystko, czego nie zna, a obiekt w OSM dalej istnieje.
   */
  async listCatalogExclusions(): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('katalog_wykluczenia').select('osm_id');
    if (error) {
      console.warn('[katalog] Nie udało się odczytać wykluczeń:', error.message);
      return new Set();
    }
    return new Set((data ?? []).map((w: any) => String(w.osm_id)));
  }

  /** Wszystkie miasta obecne w katalogu — do odsiewania zdjęć spoza miasta. */
  async listCities(): Promise<string[]> {
    const { data, error } = await supabase
      .from('place_catalog').select('city');
    if (error) {
      console.warn('[katalog] Nie udało się odczytać listy miast:', error.message);
      return [];
    }
    return [...new Set((data ?? []).map((w: any) => String(w.city || '')).filter(Boolean))];
  }

  async listCatalogAll(city: string | null, limit = 500): Promise<any[]> {
    // description i description_i18n sa tu potrzebne: /catalog/enrich filtruje po nich
    // "ktore miejsca nie maja jeszcze opisu". Bez nich filtr przepuszczal wszystko
    // i endpoint nadpisywal gotowe opisy.
    let q = supabase.from('place_catalog')
      .select('id, name, kind, city, lat, lng, photos, description, description_i18n, visit_minutes, wikipedia')
      .limit(limit);
    if (city) q = q.ilike('city', city);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Podpowiedzi z katalogu: dopasowanie po fragmencie nazwy, opcjonalnie w mieście. */
  async searchCatalogByName(query: string, city: string | null, limit = 6): Promise<any[]> {
    let q = supabase
      .from('place_catalog')
      .select('id, slug, name, city, country, lat, lng, category, kind, photos, visit_minutes, opening_hours, website, description')
      .ilike('name', `%${query}%`)
      .order('waznosc', { ascending: false, nullsFirst: false })
      .order('pin_count', { ascending: false })
      .limit(limit);
    if (city) q = q.ilike('city', `%${city}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /**
   * Dane na wizytówkę publicznej tablicy. Zwraca null także wtedy, gdy tablica
   * istnieje, ale nie jest publiczna — robot nie ma prawa zobaczyć jej tytułu
   * bardziej niż jej treści.
   */
  async publicBoardCard(id: string): Promise<any | null> {
    const { data: b } = await supabase
      .from('trip_projects')
      .select('id, name, destination, days, author_display, is_public, is_example')
      .eq('id', id).eq('is_public', true).maybeSingle();
    if (!b) return null;

    const { data: places } = await supabase
      .from('trip_project_places')
      .select('name, image_url, priority')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    const lista = places ?? [];
    return {
      ...b,
      place_count: lista.length,
      // Nazwy z kubełka „na pewno": to one opisują tablicę, a nie odrzucone pomysły.
      sample_names: lista.filter((p: any) => p.priority === 'must').map((p: any) => p.name).slice(0, 6),
      photo: lista.find((p: any) => p.image_url)?.image_url ?? null,
    };
  }

  /** Dane na wizytówkę miejsca z katalogu. */
  async catalogCardBySlug(slug: string): Promise<any | null> {
    const { data } = await supabase
      .from('place_catalog')
      .select('slug, name, city, country, lat, lng, description, wiki_extract, photos')
      .eq('slug', slug).maybeSingle();
    return data ?? null;
  }

  /** Adresy do mapy strony: publiczne tablice i wszystkie miejsca katalogu. */
  async sitemapEntries(): Promise<{ boards: any[]; places: any[] }> {
    const [{ data: boards }, { data: places }] = await Promise.all([
      supabase.from('trip_projects').select('id, updated_at').eq('is_public', true),
      supabase.from('place_catalog').select('slug, updated_at').limit(5000),
    ]);
    return { boards: boards ?? [], places: places ?? [] };
  }

  async listCatalogByCity(city: string, limit = 40): Promise<any[]> {
    const { data } = await supabase
      .from('place_catalog').select('*')
      .ilike('city', city)
      .order('waznosc', { ascending: false, nullsFirst: false })
      .order('pin_count', { ascending: false })
      .limit(limit);
    return data ?? [];
  }


  /** Wydarzenie rozpoznajemy po mieście, nazwie i dacie startu — ta trójka jest
   *  wystarczająco unikalna, a pozwala odświeżać listę bez mnożenia duplikatów. */
  async upsertEvent(row: Record<string, any>): Promise<any | null> {
    const { data: existing } = await supabase
      .from('place_events').select('id')
      .eq('city', row.city).eq('name', row.name).eq('starts_on', row.starts_on)
      .maybeSingle();
    if (existing) {
      const { data } = await supabase.from('place_events').update(row).eq('id', existing.id).select('*').single();
      return data;
    }
    const { data, error } = await supabase.from('place_events').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }


  // --- Tokeny ---------------------------------------------------------------
  // Saldo jest sumą operacji w księdze, nie polem do nadpisania. Pole potrafi się
  // rozjechać po każdym nieudanym zapisie i nie da się potem odtworzyć, co się
  // stało; suma zawsze zgadza się z historią, którą użytkownik widzi.

  private static readonly WELCOME_GRANT = 100;

  async getTokenBalance(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('token_ledger').select('amount').eq('user_id', userId);
    if (error) throw new Error(error.message);

    // Pierwsze wejście: przyznajemy pulę powitalną leniwie, przy pierwszym
    // odczycie salda. Wyzwalacz na auth.users już raz położył rejestrację,
    // więc nie ruszamy tej ścieżki.
    if (!data || data.length === 0) {
      await supabase.from('token_ledger').insert({
        user_id: userId,
        amount: RouteBuilderRepository.WELCOME_GRANT,
        reason: 'powitalne'
      });
      return RouteBuilderRepository.WELCOME_GRANT;
    }
    return data.reduce((sum: number, row: any) => sum + row.amount, 0);
  }

  /**
   * Pobranie opłaty. Naliczamy PO udanej operacji, nie przed: gdy generowanie
   * padnie, użytkownik nie może zostać z pustym portfelem i niczym w ręku.
   */
  async chargeTokens(userId: string, amount: number, reason: string, ref?: string): Promise<void> {
    if (amount <= 0) return;
    const { error } = await supabase.from('token_ledger').insert({
      user_id: userId, amount: -Math.abs(amount), reason, ref: ref ?? null
    });
    if (error) console.error('[tokens] Nie udało się zapisać opłaty:', error.message);
  }

  async grantTokens(userId: string, amount: number, reason: string, ref?: string): Promise<void> {
    const { error } = await supabase.from('token_ledger').insert({
      user_id: userId, amount: Math.abs(amount), reason, ref: ref ?? null
    });
    if (error) throw new Error(error.message);
  }

  async listLedger(userId: string, limit = 50): Promise<any[]> {
    const { data } = await supabase
      .from('token_ledger').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    return data ?? [];
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
