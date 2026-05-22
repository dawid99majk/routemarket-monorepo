import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useCampaignStats,
  useCampaignCreatives,
  useUpsertCreative,
  type Campaign,
  type CampaignFormData,
  type CampaignStatus,
  type CampaignPlacement,
  type CampaignCreative,
} from '@/hooks/use-campaigns';
import {
  Megaphone, Plus, Pencil, Trash2, Eye, Pause, Play,
  Calendar, Target, Loader2, Palette, X,
} from 'lucide-react';
import { format } from 'date-fns';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'da', label: 'Dansk' },
];

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const PLACEMENT_LABELS: Record<CampaignPlacement, string> = {
  hero_banner: 'Hero Banner',
  card_highlight: 'Card Highlight',
  sidebar: 'Sidebar',
  category_bar: 'Category Bar',
  checkout: 'Checkout',
};

const EMPTY_FORM: CampaignFormData = {
  name: '', description: '', status: 'draft', placement: 'hero_banner',
  start_date: null, end_date: null, target_url: null, priority: 0,
  is_internal: true, budget_cents: null,
};

interface CreativeForm {
  headline: string;
  subheadline: string;
  cta_text: string;
  bg_color: string;
  text_color: string;
}

const EMPTY_CREATIVE: CreativeForm = {
  headline: '', subheadline: '', cta_text: '', bg_color: '#2D6A4F', text_color: '#FFFFFF',
};

/* ── Stats inline ── */
function CampaignStatsInline({ campaignId }: { campaignId: string }) {
  const { data } = useCampaignStats(campaignId);
  if (!data) return null;
  return (
    <div className="flex gap-3 text-xs text-muted-foreground">
      <span><Eye className="inline h-3 w-3 mr-0.5" />{data.impressions}</span>
      <span><Target className="inline h-3 w-3 mr-0.5" />{data.clicks}</span>
      <span>CTR {data.ctr}%</span>
    </div>
  );
}

/* ── Creative Editor Panel ── */
function CreativeEditor({ campaignId }: { campaignId: string }) {
  const { data: creatives = [], isLoading } = useCampaignCreatives(campaignId);
  const upsertMut = useUpsertCreative();
  const [selectedLang, setSelectedLang] = useState('en');
  const [form, setForm] = useState<CreativeForm>(EMPTY_CREATIVE);
  const [editingId, setEditingId] = useState<string | undefined>();

  // When switching language, load existing creative
  const loadLang = (lang: string) => {
    setSelectedLang(lang);
    const existing = creatives.find(c => c.language_code === lang);
    if (existing) {
      setEditingId(existing.id);
      setForm({
        headline: existing.headline,
        subheadline: existing.subheadline ?? '',
        cta_text: existing.cta_text ?? '',
        bg_color: existing.bg_color ?? '#2D6A4F',
        text_color: existing.text_color ?? '#FFFFFF',
      });
    } else {
      setEditingId(undefined);
      setForm(EMPTY_CREATIVE);
    }
  };

  const existingLangs = useMemo(() => new Set(creatives.map(c => c.language_code)), [creatives]);

  const handleSave = async () => {
    if (!form.headline.trim()) return;
    await upsertMut.mutateAsync({
      ...(editingId ? { id: editingId } : {}),
      campaign_id: campaignId,
      language_code: selectedLang,
      headline: form.headline.trim(),
      subheadline: form.subheadline.trim() || null,
      cta_text: form.cta_text.trim() || null,
      bg_color: form.bg_color || null,
      text_color: form.text_color || null,
      image_key: null,
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 pt-2">
      {/* Language selector */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Language</Label>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORTED_LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => loadLang(l.code)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedLang === l.code
                  ? 'bg-primary text-primary-foreground border-primary'
                  : existingLangs.has(l.code)
                  ? 'bg-accent/10 text-accent-foreground border-accent/30 hover:bg-accent/20'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {l.label}
              {existingLangs.has(l.code) && selectedLang !== l.code && (
                <span className="ml-1 text-[10px]">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-3">
        <div>
          <Label>Headline *</Label>
          <Input
            value={form.headline}
            onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
            placeholder="50% off all hiking routes!"
            maxLength={120}
          />
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{form.headline.length}/120</p>
        </div>
        <div>
          <Label>Subheadline</Label>
          <Input
            value={form.subheadline}
            onChange={e => setForm(f => ({ ...f, subheadline: e.target.value }))}
            placeholder="Limited time offer"
            maxLength={200}
          />
        </div>
        <div>
          <Label>CTA Button Text</Label>
          <Input
            value={form.cta_text}
            onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
            placeholder="Shop Now"
            maxLength={40}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="flex items-center gap-1.5"><Palette className="h-3 w-3" /> Background</Label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={form.bg_color}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="w-8 h-8 rounded border border-border cursor-pointer"
              />
              <Input
                value={form.bg_color}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="font-mono text-xs"
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Palette className="h-3 w-3" /> Text Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={form.text_color}
                onChange={e => setForm(f => ({ ...f, text_color: e.target.value }))}
                className="w-8 h-8 rounded border border-border cursor-pointer"
              />
              <Input
                value={form.text_color}
                onChange={e => setForm(f => ({ ...f, text_color: e.target.value }))}
                className="font-mono text-xs"
                maxLength={7}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Live Preview</Label>
        <div
          className="rounded-lg overflow-hidden transition-colors duration-200"
          style={{ backgroundColor: form.bg_color, color: form.text_color }}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate leading-tight">
                {form.headline || 'Headline preview...'}
              </p>
              {form.subheadline && (
                <p className="text-xs opacity-80 truncate mt-0.5">{form.subheadline}</p>
              )}
            </div>
            {form.cta_text && (
              <span className="shrink-0 text-xs font-medium bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
                {form.cta_text}
              </span>
            )}
            <X className="w-3.5 h-3.5 opacity-50 shrink-0" />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={!form.headline.trim() || upsertMut.isPending} className="w-full">
        {upsertMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {editingId ? 'Update Creative' : 'Save Creative'} ({selectedLang.toUpperCase()})
      </Button>
    </div>
  );
}

/* ── Main Page ── */
export default function AdminCampaigns() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const createMut = useCreateCampaign();
  const updateMut = useUpdateCampaign();
  const deleteMut = useDeleteCampaign();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('settings');

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setActiveTab('settings');
    setDialogOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name, description: c.description, status: c.status, placement: c.placement,
      start_date: c.start_date, end_date: c.end_date, target_url: c.target_url,
      priority: c.priority, is_internal: c.is_internal, budget_cents: c.budget_cents,
    });
    setActiveTab('settings');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await updateMut.mutateAsync({ ...form, id: editing.id });
    } else {
      const created = await createMut.mutateAsync(form);
      // Switch to editing mode so Creatives tab becomes available
      setEditing(created);
    }
  };

  const toggleStatus = async (c: Campaign) => {
    const next: CampaignStatus = c.status === 'active' ? 'paused' : 'active';
    await updateMut.mutateAsync({ id: c.id, name: c.name, placement: c.placement, status: next });
  };

  const filtered = filterStatus === 'all' ? campaigns : campaigns.filter(c => c.status === filterStatus);
  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <Badge variant="secondary" className="text-xs">{campaigns.length}</Badge>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Campaign
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'draft', 'scheduled', 'active', 'paused', 'ended'].map(s => (
          <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(s)} className="capitalize text-xs">
            {s}
          </Button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No campaigns found. Create your first one!</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map(c => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 px-5 flex items-center gap-4">
                <div className="shrink-0">
                  <Badge className={`${STATUS_COLORS[c.status]} text-xs capitalize`}>{c.status}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="capitalize">{PLACEMENT_LABELS[c.placement]}</span>
                    {c.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(c.start_date), 'dd MMM')}
                        {c.end_date && ` – ${format(new Date(c.end_date), 'dd MMM')}`}
                      </span>
                    )}
                    <span>Priority: {c.priority}</span>
                  </div>
                </div>
                <CampaignStatsInline campaignId={c.id} />
                <div className="flex items-center gap-1 shrink-0">
                  {(c.status === 'active' || c.status === 'paused') && (
                    <Button variant="ghost" size="icon" onClick={() => toggleStatus(c)} title={c.status === 'active' ? 'Pause' : 'Resume'}>
                      {c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this campaign?')) deleteMut.mutate(c.id); }} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog with Tabs */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit: ${editing.name}` : 'New Campaign'}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="settings" className="flex-1">Settings</TabsTrigger>
              <TabsTrigger value="creatives" className="flex-1" disabled={!editing}>
                Creatives
              </TabsTrigger>
            </TabsList>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4 pt-2">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Spring Sale 2026" maxLength={100} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} maxLength={500} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as CampaignStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['draft', 'scheduled', 'active', 'paused', 'ended'].map(s => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Placement</Label>
                  <Select value={form.placement} onValueChange={v => setForm(f => ({ ...f, placement: v as CampaignPlacement }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLACEMENT_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input type="datetime-local" value={form.start_date?.slice(0, 16) ?? ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="datetime-local" value={form.end_date?.slice(0, 16) ?? ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
                </div>
              </div>
              <div>
                <Label>Target URL</Label>
                <Input value={form.target_url ?? ''} onChange={e => setForm(f => ({ ...f, target_url: e.target.value || null }))} placeholder="https://..." maxLength={500} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Input type="number" value={form.priority ?? 0} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Budget (cents)</Label>
                  <Input type="number" value={form.budget_cents ?? ''} onChange={e => setForm(f => ({ ...f, budget_cents: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Optional" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_internal ?? true} onCheckedChange={v => setForm(f => ({ ...f, is_internal: v }))} />
                <Label>Internal campaign</Label>
              </div>
              <Button onClick={handleSave} disabled={!form.name || isSaving} className="w-full">
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Campaign'}
              </Button>
            </TabsContent>

            {/* Creatives Tab */}
            <TabsContent value="creatives">
              {editing ? (
                <CreativeEditor campaignId={editing.id} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Save the campaign first, then add creatives.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
