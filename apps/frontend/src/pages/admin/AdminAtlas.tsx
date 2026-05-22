import { type ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, CheckCircle2, Loader2, PackagePlus, Play, RefreshCw, Search, ShieldCheck, Sparkles, Upload, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type AtlasProject = {
  id: string;
  title: string;
  category: string;
  region: string;
  language: string;
  status: string;
  updatedAt: string;
};

type AtlasReview = {
  project: AtlasProject;
  readiness: {
    status: string;
    score: number;
    blockingCount: number;
    warningCount: number;
    checks: Array<{ id: string; label: string; passed: boolean; severity: string; message: string }>;
  };
  sourceSummary: {
    total: number;
    officialCount: number;
    averageTrustScore: number;
    byType: Record<string, number>;
  };
  claimSummary: {
    total: number;
    needsReview: number;
  };
  artifactSummary: {
    requiredPresent: string[];
    requiredMissing: string[];
    optionalPresent: string[];
  };
  latestDecision?: {
    decision: string;
    reviewer?: string;
    notes?: string;
    decidedAt: string;
  } | null;
};

const DEFAULT_FORM = {
  topic: '',
  category: 'motorcycle',
  region: 'Albania',
  language: 'en',
};

export default function AdminAtlas() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: 'all', limit: '25' });
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [lastImportedRoute, setLastImportedRoute] = useState<{ id: number; title: string; status: string } | null>(null);
  const [payloadJson, setPayloadJson] = useState('');
  const [payloadFileName, setPayloadFileName] = useState('');
  const [publishOnImport, setPublishOnImport] = useState(true);

  const providersQuery = useQuery({
    queryKey: ['atlas-providers'],
    queryFn: () => invokeAtlas('providers'),
  });

  const projectsQuery = useQuery({
    queryKey: ['atlas-projects', filters],
    queryFn: async () => {
      const data = await invokeAtlas('list_projects', {
        q: filters.q || undefined,
        status: filters.status === 'all' ? undefined : filters.status,
        limit: Number(filters.limit),
      });
      return (data.projects ?? []) as AtlasProject[];
    },
  });

  const reviewQuery = useQuery({
    queryKey: ['atlas-review', selectedSlug],
    enabled: Boolean(selectedSlug),
    queryFn: () => invokeAtlas('get_review', { slug: selectedSlug }) as Promise<AtlasReview>,
  });

  const createProject = useMutation({
    mutationFn: () => invokeAtlas('create_project', form),
    onSuccess: (data) => {
      toast.success(`Atlas project created: ${data.id}`);
      setSelectedSlug(data.id);
      qc.invalidateQueries({ queryKey: ['atlas-projects'] });
    },
    onError: onMutationError,
  });

  const collectSources = useAtlasActionMutation('collect_sources', qc, selectedSlug, 'Sources collected.');
  const deepResearch = useAtlasActionMutation('deep_research', qc, selectedSlug, 'Deep research completed.');
  const runMvp2 = useAtlasActionMutation('run_mvp2', qc, selectedSlug, 'MVP2 completed.');
  const preparePublish = useAtlasActionMutation('prepare_publish', qc, selectedSlug, 'Payload prepared.');
  const importDraft = useMutation({
    mutationFn: () => invokeAtlas('import_draft', { slug: selectedSlug, publish: publishOnImport }),
    onSuccess: (data) => {
      const route = data?.route;
      if (route?.id) {
        setLastImportedRoute({
          id: Number(route.id),
          title: String(route.title ?? selectedProject?.title ?? 'Imported draft'),
          status: String(route.status ?? (publishOnImport ? 'published' : 'draft')),
        });
      }
      if (data?.imported === false && data?.reason === 'already_imported' && route?.id) {
        toast.success(`Atlas draft already exists as RouteMarket route #${route.id}.`);
        return;
      }
      toast.success(route?.id ? `Atlas draft imported as RouteMarket route #${route.id}.` : 'Atlas draft imported.');
    },
    onError: onMutationError,
  });
  const bulkImportDrafts = useMutation({
    mutationFn: () => invokeAtlas('bulk_import_drafts', { slugs: selectedProjectIds, publish: publishOnImport }),
    onSuccess: (data) => {
      const results = Array.isArray(data?.results) ? data.results : [];
      const latestImported = results.find((result: any) => result.imported && result.routeId);
      if (latestImported?.routeId) {
        const matchingProject = projectsQuery.data?.find((project) => project.id === latestImported.slug);
        setLastImportedRoute({
          id: Number(latestImported.routeId),
          title: String(matchingProject?.title ?? latestImported.slug),
          status: publishOnImport ? 'published' : 'draft',
        });
      }
      toast.success(`Bulk import finished. Imported: ${data?.imported ?? 0}, skipped: ${data?.skipped ?? 0}, failed: ${data?.failed ?? 0}.`);
    },
    onError: onMutationError,
  });
  const importPayload = useMutation({
    mutationFn: () => invokeAtlas('import_payload', { payload: payloadJson, publish: publishOnImport }),
    onSuccess: (data) => {
      const route = data?.route;
      if (route?.id) {
        setLastImportedRoute({
          id: Number(route.id),
          title: String(route.title ?? 'Imported payload'),
          status: String(route.status ?? (publishOnImport ? 'published' : 'draft')),
        });
      }
      toast.success(route?.id ? `Payload imported as RouteMarket route #${route.id}.` : 'Payload imported.');
      setPayloadJson('');
      setPayloadFileName('');
    },
    onError: onMutationError,
  });

  const reviewDecision = useMutation({
    mutationFn: (decision: 'approved' | 'changes_requested' | 'blocked') =>
      invokeAtlas('submit_review_decision', {
        slug: selectedSlug,
        decision,
        reviewer: 'RouteMarket Admin',
        notes: reviewNotes || undefined,
      }),
    onSuccess: () => {
      toast.success('Review decision saved.');
      qc.invalidateQueries({ queryKey: ['atlas-projects'] });
      qc.invalidateQueries({ queryKey: ['atlas-review', selectedSlug] });
    },
    onError: onMutationError,
  });

  const selectedProject = useMemo(
    () => projectsQuery.data?.find((project) => project.id === selectedSlug),
    [projectsQuery.data, selectedSlug],
  );

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((value) => value !== projectId)
        : [...current, projectId],
    );
  };

  const allVisibleSelected = !!projectsQuery.data?.length && selectedProjectIds.length === projectsQuery.data.length;

  const handlePayloadFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPayloadJson(text);
    setPayloadFileName(file.name);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Atlas Integration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Internal bridge to Atlas API for route research, review, and draft preparation.
          </p>
        </div>
        <Button variant="outline" onClick={() => {
          qc.invalidateQueries({ queryKey: ['atlas-providers'] });
          qc.invalidateQueries({ queryKey: ['atlas-projects'] });
          if (selectedSlug) qc.invalidateQueries({ queryKey: ['atlas-review', selectedSlug] });
        }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Atlas status</h2>
              <p className="text-sm text-muted-foreground">Providers and project creation.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(providersQuery.data?.providers ?? []).map((provider: any) => (
                <Badge key={provider.id} variant={provider.activeByDefault ? 'default' : 'secondary'}>
                  {provider.id}: {provider.configured ? 'configured' : 'not configured'}
                </Badge>
              ))}
            </div>
            {providersQuery.error && (
              <p className="text-sm text-destructive">{formatError(providersQuery.error)}</p>
            )}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="atlas-topic">Topic</Label>
                <Input id="atlas-topic" value={form.topic} onChange={(e) => setForm((current) => ({ ...current, topic: e.target.value }))} placeholder="Albania motorcycle route 7 days" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="atlas-category">Category</Label>
                  <Input id="atlas-category" value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="atlas-language">Language</Label>
                  <Input id="atlas-language" value={form.language} onChange={(e) => setForm((current) => ({ ...current, language: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="atlas-region">Region</Label>
                <Input id="atlas-region" value={form.region} onChange={(e) => setForm((current) => ({ ...current, region: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={() => createProject.mutate()} disabled={!form.topic.trim() || createProject.isPending}>
                {createProject.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Create Atlas project
              </Button>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Atlas actions</h2>
              <p className="text-sm text-muted-foreground">Work on the selected Atlas project.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Select project</Label>
              <Select value={selectedSlug} onValueChange={setSelectedSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose Atlas project" />
                </SelectTrigger>
                <SelectContent>
                  {(projectsQuery.data ?? []).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publishOnImport} onChange={(event) => setPublishOnImport(event.target.checked)} />
              Publish immediately after import
            </label>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton label="Collect sources" icon={Search} onClick={() => collectSources.mutate({ slug: selectedSlug, provider: 'auto', limit: 20 })} disabled={!selectedSlug || collectSources.isPending} />
              <ActionButton label="Deep research" icon={Wand2} onClick={() => deepResearch.mutate({ slug: selectedSlug, sourceLimit: 3 })} disabled={!selectedSlug || deepResearch.isPending} />
              <ActionButton label="Run MVP2" icon={Play} onClick={() => runMvp2.mutate({ slug: selectedSlug })} disabled={!selectedSlug || runMvp2.isPending} />
              <ActionButton label="Prepare payload" icon={ShieldCheck} onClick={() => preparePublish.mutate({ slug: selectedSlug })} disabled={!selectedSlug || preparePublish.isPending} />
            </div>
            <Button variant="secondary" className="w-full" onClick={() => importDraft.mutate()} disabled={!selectedSlug || importDraft.isPending}>
              {importDraft.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
              Import as RouteMarket draft
            </Button>
            {selectedProject && (
              <div className="rounded-lg border p-3 text-sm bg-muted/40">
                <div className="font-medium">{selectedProject.title}</div>
                <div className="text-muted-foreground mt-1">
                  {selectedProject.category} · {selectedProject.region} · {selectedProject.language}
                </div>
                <div className="mt-2">
                  <Badge variant="outline">{selectedProject.status}</Badge>
                </div>
              </div>
            )}
            {lastImportedRoute && (
              <div className="rounded-lg border p-3 text-sm bg-muted/40">
                <div className="font-medium">Last imported draft: #{lastImportedRoute.id}</div>
                <div className="text-muted-foreground mt-1">
                  {lastImportedRoute.title} · {lastImportedRoute.status}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Import ready payload</h2>
              <p className="text-sm text-muted-foreground">Import a ready `routemarket_payload.json` directly into RouteMarket.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="atlas-payload-file">Payload file</Label>
              <Input id="atlas-payload-file" type="file" accept=".json,application/json" onChange={handlePayloadFileChange} />
              {payloadFileName && (
                <p className="text-xs text-muted-foreground">Loaded file: {payloadFileName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="atlas-payload-json">Payload JSON</Label>
              <Textarea
                id="atlas-payload-json"
                value={payloadJson}
                onChange={(e) => setPayloadJson(e.target.value)}
                placeholder='Paste routemarket_payload.json here'
                className="min-h-[220px] font-mono text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publishOnImport} onChange={(event) => setPublishOnImport(event.target.checked)} />
              Publish immediately after import
            </label>
            <Button variant="secondary" className="w-full" onClick={() => importPayload.mutate()} disabled={!payloadJson.trim() || importPayload.isPending}>
              {importPayload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import payload as draft
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Atlas projects</h2>
                <p className="text-sm text-muted-foreground">Search and pick a working project.</p>
              </div>
              <div className="flex items-center gap-2">
                {projectsQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => bulkImportDrafts.mutate()}
                  disabled={selectedProjectIds.length === 0 || bulkImportDrafts.isPending}
                >
                  {bulkImportDrafts.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
                  Import selected
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_110px] gap-3">
              <Input value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Search Atlas projects" />
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="ready_for_review">ready_for_review</SelectItem>
                  <SelectItem value="approved_for_publish">approved_for_publish</SelectItem>
                  <SelectItem value="changes_requested">changes_requested</SelectItem>
                  <SelectItem value="blocked">blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.limit} onValueChange={(value) => setFilters((current) => ({ ...current, limit: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[42px]">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => {
                          setSelectedProjectIds(event.target.checked ? (projectsQuery.data ?? []).map((project) => project.id) : []);
                        }}
                      />
                    </TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(projectsQuery.data ?? []).map((project) => (
                    <TableRow key={project.id} className="cursor-pointer" onClick={() => setSelectedSlug(project.id)}>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.includes(project.id)}
                          onChange={() => toggleProjectSelection(project.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{project.title}</div>
                        <div className="text-xs text-muted-foreground">{project.id}</div>
                      </TableCell>
                      <TableCell><Badge variant={project.id === selectedSlug ? 'default' : 'secondary'}>{project.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(project.updatedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {(projectsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No Atlas projects yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Review</h2>
                <p className="text-sm text-muted-foreground">Readiness and human decision for the selected Atlas project.</p>
              </div>
              {reviewQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {!selectedSlug && <p className="text-sm text-muted-foreground">Select an Atlas project to load review details.</p>}
            {reviewQuery.error && <p className="text-sm text-destructive">{formatError(reviewQuery.error)}</p>}
            {reviewQuery.data && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard label="Readiness" value={reviewQuery.data.readiness.status} />
                  <MetricCard label="Score" value={String(reviewQuery.data.readiness.score)} />
                  <MetricCard label="Sources" value={String(reviewQuery.data.sourceSummary.total)} />
                  <MetricCard label="Claims" value={String(reviewQuery.data.claimSummary.total)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="font-medium mb-2">Checks</h3>
                    <div className="space-y-2">
                      {reviewQuery.data.readiness.checks.map((check) => (
                        <div key={check.id} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant={check.passed ? 'default' : check.severity === 'blocking' ? 'destructive' : 'secondary'}>
                              {check.passed ? 'passed' : check.severity}
                            </Badge>
                            <span className="font-medium">{check.label}</span>
                          </div>
                          <p className="text-muted-foreground mt-1">{check.message}</p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-medium mb-2">Artifacts and sources</h3>
                    <div className="text-sm space-y-2">
                      <p>Official sources: <strong>{reviewQuery.data.sourceSummary.officialCount}</strong></p>
                      <p>Average trust: <strong>{reviewQuery.data.sourceSummary.averageTrustScore}</strong></p>
                      <p>Claims needing review: <strong>{reviewQuery.data.claimSummary.needsReview}</strong></p>
                      <p>Missing required artifacts: <strong>{reviewQuery.data.artifactSummary.requiredMissing.length}</strong></p>
                      <p>Optional present: <strong>{reviewQuery.data.artifactSummary.optionalPresent.join(', ') || 'none'}</strong></p>
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="atlas-review-notes">Review notes</Label>
                  <Textarea id="atlas-review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Notes for Atlas review decision" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => reviewDecision.mutate('approved')} disabled={reviewDecision.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => reviewDecision.mutate('changes_requested')} disabled={reviewDecision.isPending}>
                    Request changes
                  </Button>
                  <Button variant="destructive" onClick={() => reviewDecision.mutate('blocked')} disabled={reviewDecision.isPending}>
                    Block
                  </Button>
                </div>

                {reviewQuery.data.latestDecision && (
                  <div className="rounded-lg border p-3 text-sm bg-muted/40">
                    <div className="font-medium">Latest decision: {reviewQuery.data.latestDecision.decision}</div>
                    <div className="text-muted-foreground mt-1">
                      {reviewQuery.data.latestDecision.reviewer || 'Unknown reviewer'} · {new Date(reviewQuery.data.latestDecision.decidedAt).toLocaleString()}
                    </div>
                    {reviewQuery.data.latestDecision.notes && (
                      <p className="mt-2">{reviewQuery.data.latestDecision.notes}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Search;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      <Icon className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </Card>
  );
}

function useAtlasActionMutation(action: string, qc: ReturnType<typeof useQueryClient>, slug: string, successMessage: string) {
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => invokeAtlas(action, input),
    onSuccess: () => {
      toast.success(successMessage);
      qc.invalidateQueries({ queryKey: ['atlas-projects'] });
      if (slug) qc.invalidateQueries({ queryKey: ['atlas-review', slug] });
    },
    onError: onMutationError,
  });
}

async function invokeAtlas(action: string, input?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('atlas-admin', {
    body: { action, input },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

function onMutationError(error: unknown) {
  toast.error(formatError(error));
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Atlas request failed.';
}
