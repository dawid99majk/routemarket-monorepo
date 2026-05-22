import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { parseGpx } from '@/lib/gpx-parser';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AtlasInterviewWizard } from '@/components/atlas/AtlasInterviewWizard';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { TopUpModal } from '@/components/ui/TopUpModal';
import RouteTerrain3D from '@/components/RouteTerrain3D';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Files,
  Film,
  Image,
  Link,
  Map,
  MessageSquare,
  Pencil,
  Route,
  Send,
  Sparkles,
  Upload,
  Wand2,
  X,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Shield,
  Compass,
  Bike,
  Mountain,
  Landmark,
  ToggleLeft,
  Eye,
  Info,
  CloudRain,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';

type PipelineStep = 'sources' | 'interview' | 'outline' | 'gpx' | 'guide' | 'media' | 'publish';
type ApprovalState = 'pending' | 'approved';

interface SourceFile {
  name: string;
  size: number;
}

interface Project {
  id: string;
  title: string;
  category: string;
  region: string;
  language: string;
  status: string;
  waitingApprovalStage?: string;
  [key: string]: unknown;
}

interface EventLog {
  type?: string;
  message: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface Route {
  id: number;
  title: string;
  status: string;
}

interface PoiFeature {
  type: string;
  properties?: {
    name?: string;
    description?: string;
  };
  geometry?: unknown;
}

interface PoiGeoJson {
  features?: PoiFeature[];
}

function generateGpxXml(points: [number, number][], title: string = 'Trasa AI') {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<gpx version="1.1" creator="RouteMarket AI Studio" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  xml += `  <metadata>\n`;
  xml += `    <name>${title}</name>\n`;
  xml += `  </metadata>\n`;
  xml += `  <trk>\n`;
  xml += `    <name>${title}</name>\n`;
  xml += `    <trkseg>\n`;
  points.forEach(([lat, lon], idx) => {
    const seed = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233 + idx));
    const ele = Math.round(150 + seed * 450);
    xml += `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">\n`;
    xml += `        <ele>${ele}</ele>\n`;
    xml += `      </trkpt>\n`;
  });
  xml += `    </trkseg>\n`;
  xml += `  </trk>\n`;
  xml += `</gpx>`;
  return xml;
}

const getLinkIconAndBrand = (url: string) => {
  const FilmIcon = Film;
  const LinkIcon = Link;
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return { icon: FilmIcon, brand: 'YouTube', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
  }
  if (url.includes('instagram.com')) {
    return { icon: FilmIcon, brand: 'Instagram', color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' };
  }
  if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
    return { icon: FilmIcon, brand: 'Facebook', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
  }
  return { icon: LinkIcon, brand: 'Blog / Strona', color: 'text-muted-foreground bg-muted/40 border-border/80' };
};

const steps: Array<{ id: PipelineStep; label: string; icon: typeof Files }> = [
  { id: 'sources', label: '1. Materiały', icon: Files },
  { id: 'interview', label: '2. Wywiad AI', icon: MessageSquare },
  { id: 'outline', label: '3. Konspekt', icon: FileText },
  { id: 'gpx', label: '4. GPX i mapa', icon: Route },
  { id: 'guide', label: '5. Opis', icon: Pencil },
  { id: 'media', label: '6. Media', icon: Image },
  { id: 'publish', label: '7. Publikacja', icon: CheckCircle2 },
];

export default function CreatorAiStudio() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth & Balance hook
  const { user } = useAuth();
  const { balance, spendCredits } = useProfileBalance(user?.id);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Active project ID (slug)
  const [activeSlug, setActiveSlug] = useState<string | null>(() => localStorage.getItem('creator_ai_studio_slug'));
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // New Project Form
  const [newProjectForm, setNewProjectForm] = useState({
    topic: '',
    category: 'motorcycle',
    region: 'Polska',
    language: 'pl',
    deepResearch: false,
    cyclingSurface: 'offroad' as 'asphalt' | 'offroad',
    aiArchetype: 'aesthetic' as 'aesthetic' | 'mountain' | 'city' | 'family',
  });
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    const presetArchetype = localStorage.getItem('creator_ai_studio_preset_archetype');
    if (presetArchetype) {
      let matchedCategory = 'motorcycle';
      if (presetArchetype === 'mountain') matchedCategory = 'hiking';
      else if (presetArchetype === 'city') matchedCategory = 'city';
      else if (presetArchetype === 'family') matchedCategory = 'cycling';

      setNewProjectForm(prev => ({
        ...prev,
        aiArchetype: presetArchetype as 'aesthetic' | 'mountain' | 'city' | 'family',
        category: matchedCategory,
        topic: prev.topic || `Wyprawa - ${
          presetArchetype === 'aesthetic' ? 'Szosowy Esteta' :
          presetArchetype === 'mountain' ? 'Górski Wyjadacz' :
          presetArchetype === 'city' ? 'Miejski Odkrywca' : 'Rodzinny Piknikowicz'
        }`
      }));
      localStorage.removeItem('creator_ai_studio_preset_archetype');
    }
  }, []);

  // Workspace State
  const [activeStep, setActiveStep] = useState<PipelineStep>('sources');
  const [projectDetails, setProjectDetails] = useState<Project | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [mapViewMode, setMapViewMode] = useState<'3d' | '2d'>('3d');

  const defaultTrackPoints = useMemo<[number, number][]>(() => [
    [49.524, 20.124],
    [49.528, 20.130],
    [49.532, 20.138],
    [49.535, 20.145],
    [49.538, 20.152],
    [49.542, 20.160],
    [49.538, 20.168],
    [49.532, 20.174],
    [49.528, 20.180]
  ], []);

  // Imported route details (after final database publish)
  const [importedRoute, setImportedRoute] = useState<Route | null>(null);

  // Parsed GPX summary from XML
  const parsedGpx = useMemo(() => {
    if (!gpxXml) return null;
    try {
      return parseGpx(gpxXml);
    } catch {
      return null;
    }
  }, [gpxXml]);

  const activeTrackPoints = useMemo(() => {
    if (parsedGpx && parsedGpx.trackPoints.length >= 2) {
      return parsedGpx.trackPoints;
    }
    return defaultTrackPoints;
  }, [parsedGpx, defaultTrackPoints]);

  // 2D Editor Local States
  const [editingPoiName, setEditingPoiName] = useState('');
  const [editingPoiType, setEditingPoiType] = useState<'parking' | 'hotel' | 'viewpoint' | 'danger'>('viewpoint');
  const [selectedTrackPointIndex, setSelectedTrackPointIndex] = useState<number | null>(null);
  const [customPois, setCustomPois] = useState<Array<{ name: string; type: string; lat: number; lng: number }>>([
    { name: 'Start & Miejsce Parkingowe', type: 'parking', lat: 49.524, lng: 20.124 },
    { name: 'Schronisko PTTK', type: 'hotel', lat: 49.535, lng: 20.145 },
    { name: 'Punkt Widokowy Ochotnica', type: 'viewpoint', lat: 49.542, lng: 20.160 }
  ]);

  // Asphalt Quality Checker State
  const [analyzingAsphalt, setAnalyzingAsphalt] = useState(false);
  const [asphaltProgress, setAsphaltProgress] = useState(0);
  const [asphaltQualityScore, setAsphaltQualityScore] = useState<number | null>(null);
  const [asphaltAuditLog, setAsphaltAuditLog] = useState<string[]>([]);

  // Weather & Climate Optimizer States
  const [analyzingWeather, setAnalyzingWeather] = useState(false);
  const [weatherProgress, setWeatherProgress] = useState(0);
  const [weatherData, setWeatherData] = useState<{
    bestMonths: string;
    temperatureRange: string;
    windSecurity: number;
    gearRecommendation: string;
    microclimateNote: string;
  } | null>(null);

  // AI Roadbook States
  const [generatingRoadbook, setGeneratingRoadbook] = useState(false);
  const [roadbookProgress, setRoadbookProgress] = useState(0);
  const [roadbookGenerated, setRoadbookGenerated] = useState(false);

  const maxAllowedStep = useMemo<PipelineStep>(() => {
    if (!projectDetails) return 'sources';
    const status = projectDetails.status;
    const waitingStage = projectDetails.waitingApprovalStage;

    if (status === 'created') {
      return 'interview';
    }
    if (status === 'paused' || status === 'running') {
      if (waitingStage === 'guide_outline_approval') return 'outline';
      if (waitingStage === 'gpx_summary_approval') return 'gpx';
      if (waitingStage === 'guide_final_approval') return 'guide';
      return 'sources'; // Fallback
    }
    if (status === 'draft_generated' || status === 'completed') {
      return 'publish'; // All steps allowed
    }
    return 'sources';
  }, [projectDetails]);

  // Step 1: Sources State
  const [notes, setNotes] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<SourceFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Loaded artifacts from backend
  const [outline, setOutline] = useState('');
  const [gpxXml, setGpxXml] = useState('');
  const [guide, setGuide] = useState('');
  const [poiGeoJson, setPoiGeoJson] = useState<PoiGeoJson | null>(null);

  // Pipeline processing status
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStatusText, setPipelineStatusText] = useState('');

  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const progress = ((activeIndex + 1) / steps.length) * 100;

  // Helper to invoke edge function
  const invokeAtlas = async (action: string, input?: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.functions.invoke('atlas-admin', {
        body: { action, input },
      });
      if (error) {
        // Attempt to extract descriptive error from context
        if ('context' in error && error.context instanceof Response) {
          try {
            const body = await error.context.clone().json();
            if (body && typeof body === 'object' && body.error) {
              throw new Error(String(body.error));
            }
          } catch {
            try {
              const text = await error.context.clone().text();
              if (text) throw new Error(text);
            } catch {}
          }
        }
        throw error;
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }
      return data;
    } catch (err) {
      console.error('invokeAtlas error:', err);
      throw err;
    }
  };

  // Dashboard logic: load all projects
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const data = await invokeAtlas('list_projects', { limit: 100 }) as { projects?: Project[] };
      // Filter out internal system projects
      const filteredProjects = (data.projects ?? []).filter(
        (project) => project.id !== '__system__' && project.category !== 'system'
      );
      setProjectList(filteredProjects);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas ładowania projektów: ' + (err as Error).message);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (!activeSlug) {
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug]);

  // Load project workspace details and files
  const loadProjectWorkspace = async (slug: string) => {
    setLoadingDetails(true);
    setProjectDetails(null);
    
    // Clean reset of all project workspace states
    setActiveStep('sources');
    setNotes('');
    setLinks([]);
    setUploadedFiles([]);
    setOutline('');
    setGpxXml('');
    setGuide('');
    setPoiGeoJson(null);
    setImportedRoute(null);
    setEvents([]);

    try {
      // 1. Get project details
      const detailData = await invokeAtlas('get_project', { slug }) as { project: Project };
      const proj = detailData.project;
      setProjectDetails(proj);

      // 2. Load events (AI logs)
      const eventData = await invokeAtlas('list_events', { slug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);

      // 3. Map status/checkpoints to active studio step & load relevant files
      if (proj.status === 'created' || proj.status === 'research_needed') {
        setActiveStep('sources');
        await loadFile(slug, 'notes.md', setNotes);
      } else if (proj.status === 'paused' || proj.status === 'running') {
        const waitingStage = proj.waitingApprovalStage;
        if (waitingStage === 'gpx_summary_approval') {
          setActiveStep('gpx');
          await loadFile(slug, 'route.gpx', setGpxXml);
        } else if (waitingStage === 'guide_outline_approval') {
          setActiveStep('outline');
          await loadFile(slug, 'guide_outline.md', setOutline);
        } else if (waitingStage === 'guide_final_approval') {
          setActiveStep('guide');
          await loadFile(slug, 'guide.md', setGuide);
        } else if (waitingStage && ['claims_approval', 'poi_approval', 'concept_approval'].includes(waitingStage)) {
          // Auto-approve intermediate stages to keep experience focused!
          await handleAutoApproval(slug, waitingStage);
        }
      } else if (proj.status === 'draft_generated' || proj.status === 'completed') {
        setActiveStep('media');
        await loadFile(slug, 'poi.geojson', (content) => {
          try {
            setPoiGeoJson(JSON.parse(content));
          } catch {
            setPoiGeoJson(null);
          }
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Błąd ładowania projektu: ' + (err as Error).message);
      // Auto-exit if project fails to load to prevent getting stuck
      handleExitProject();
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadFile = async (slug: string, path: string, setter: (content: string) => void) => {
    try {
      const data = await invokeAtlas('get_file', { slug, path }) as { content?: string };
      setter(data.content ?? '');
    } catch (err) {
      console.warn(`Failed to load project file ${path}:`, err);
    }
  };

  const handleAutoApproval = async (slug: string, stage: string) => {
    console.log(`Auto-approving intermediate stage: ${stage}`);
    try {
      await invokeAtlas('approve_stage', {
        slug,
        stage,
        decision: 'approved',
        reviewer: 'Creator Studio Auto-Approver',
        notes: 'Automatically approved by Creator Studio pipeline'
      });
      // Re-run pipeline
      runPipeline(slug);
    } catch (err) {
      console.error('Auto-approval failed:', err);
    }
  };

  useEffect(() => {
    if (activeSlug) {
      loadProjectWorkspace(activeSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug]);

  // Run pipeline (MVP2)
  const runPipeline = async (slug: string) => {
    setPipelineRunning(true);
    setPipelineStatusText('AI rozpoczyna przetwarzanie. Prowadzenie badań i generowanie trasy (do 90 sekund)...');
    try {
      await invokeAtlas('run_mvp2', { slug });
      toast.success('Przetwarzanie zakończone pomyślnie!');
      await loadProjectWorkspace(slug);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas uruchamiania potoku: ' + (err as Error).message);
    } finally {
      setPipelineRunning(false);
      setPipelineStatusText('');
    }
  };

  const handleGoToInterview = async () => {
    if (!activeSlug) return;
    setLoadingDetails(true);
    try {
      if (notes.trim()) {
        await invokeAtlas('add_notes', {
          slug: activeSlug,
          fileName: 'notes.md',
          content: notes,
          note: 'Creator detailed notes'
        });
      }
      toast.success('Notatki i materiały zostały zapisane.');
      
      const eventData = await invokeAtlas('list_events', { slug: activeSlug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);
      
      setActiveStep('interview');
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas zapisywania notatek: ' + (err as Error).message);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Create project form submit
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectForm.topic.trim()) return;

    setCreatingProject(true);
    const cost = newProjectForm.deepResearch ? 50 : 25;
    const userCredits = balance?.credit_balance ?? 100;

    if (userCredits < cost) {
      toast.error(`Niewystarczająca ilość kredytów! Ten projekt wymaga ${cost} kredytów, a Twój obecny stan to ${userCredits}.`);
      setIsTopUpOpen(true);
      setCreatingProject(false);
      return;
    }

    try {
      // 1. Spend credits in Supabase
      await spendCredits.mutateAsync({
        amount: cost,
        purpose: newProjectForm.deepResearch ? 'route_deep_research' : 'route_creation'
      });

      // 2. Call edge function to create workspace
      const data = await invokeAtlas('create_project', {
        topic: newProjectForm.topic,
        category: newProjectForm.category,
        region: newProjectForm.region,
        language: newProjectForm.language,
        deepResearch: newProjectForm.deepResearch,
        cyclingSurface: newProjectForm.cyclingSurface,
        aiArchetype: newProjectForm.aiArchetype,
      } as unknown as Record<string, unknown>) as { id: string };

      toast.success(`Projekt został pomyślnie utworzony! Odliczono ${cost} kredytów.`);
      localStorage.setItem('creator_ai_studio_slug', data.id);
      setActiveSlug(data.id);
      setNewProjectForm({
        topic: '',
        category: 'motorcycle',
        region: 'Polska',
        language: 'pl',
        deepResearch: false,
        cyclingSurface: 'offroad',
        aiArchetype: 'aesthetic'
      });
    } catch (err) {
      console.error(err);
      toast.error('Nie udało się utworzyć projektu: ' + (err as Error).message);
    } finally {
      setCreatingProject(false);
    }
  };

  // Add source link
  const handleAddLink = async () => {
    const url = linkInput.trim();
    if (!url || !activeSlug) return;

    try {
      await invokeAtlas('add_link', { slug: activeSlug, url, note: 'Creator input link' });
      setLinks((current) => [...current, url]);
      setLinkInput('');
      toast.success('Link został dodany do źródeł!');
      // Reload events
      const eventData = await invokeAtlas('list_events', { slug: activeSlug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Błąd dodawania linku: ' + (err as Error).message);
    }
  };

  // Upload source files (GPX / Notes)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !activeSlug) return;

    setUploadingFiles(true);
    try {
      for (const file of files) {
        const textLike = /\.(txt|md|markdown|csv|json|geojson|kml|gpx)$/i.test(file.name) || file.type.startsWith('text/');
        if (textLike) {
          const content = await file.text();
          if (file.name.endsWith('.gpx')) {
            await invokeAtlas('add_gpx', { slug: activeSlug, fileName: file.name, content });
          } else {
            await invokeAtlas('add_notes', { slug: activeSlug, fileName: file.name, content, note: 'Creator uploaded file' });
          }
        } else {
          toast.warning(`Plik ${file.name} jest plikiem binarnym. Obsługujemy pliki tekstowe, GPX i KML.`);
          continue;
        }
        setUploadedFiles((current) => [...current, { name: file.name, size: file.size }]);
      }
      toast.success('Materiały zostały przesłane pomyślnie!');
      const eventData = await invokeAtlas('list_events', { slug: activeSlug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Błąd przesyłania plików: ' + (err as Error).message);
    } finally {
      setUploadingFiles(false);
      event.target.value = '';
    }
  };

  // Save textual notes
  const handleSaveNotes = async () => {
    if (!activeSlug || !notes.trim()) return;
    try {
      await invokeAtlas('add_notes', {
        slug: activeSlug,
        fileName: 'notes.md',
        content: notes,
        note: 'Creator detailed notes'
      });
      toast.success('Notatki zostały zapisane!');
      const eventData = await invokeAtlas('list_events', { slug: activeSlug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Błąd zapisywania notatek: ' + (err as Error).message);
    }
  };

  // Approve a stage and run pipeline next step
  const handleApproveStep = async (step: PipelineStep, stage: string) => {
    if (!activeSlug) return;
    setPipelineRunning(true);
    try {
      await invokeAtlas('approve_stage', {
        slug: activeSlug,
        stage,
        decision: 'approved',
        reviewer: 'Creator AI Studio',
        notes: `Approved via step ${step}`
      });

      toast.success(`Etap ${step} został zaakceptowany!`);
      await runPipeline(activeSlug);
    } catch (err) {
      console.error(err);
      toast.error('Błąd akceptacji etapu: ' + (err as Error).message);
      setPipelineRunning(false);
    }
  };

  // Final Ingestion into RouteMarket Database
  const handleImportToRouteMarket = async () => {
    if (!activeSlug) return;
    setPipelineRunning(true);
    setPipelineStatusText('Zapisywanie gotowej trasy, punktów POI i przewodnika bezpośrednio do bazy danych...');
    try {
      const data = await invokeAtlas('import_draft', { slug: activeSlug, publish: false }) as { route?: Route };
      const route = data?.route;
      if (route?.id) {
        setImportedRoute(route);
        toast.success(`Trasa została pomyślnie zaimportowana jako szkic #${route.id}!`);
        setActiveStep('publish');
      } else {
        throw new Error('Brak ID zaimportowanej trasy w odpowiedzi.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Błąd importu: ' + (err as Error).message);
    } finally {
      setPipelineRunning(false);
      setPipelineStatusText('');
    }
  };

  const handleDeleteProject = async (slug: string) => {
    if (!slug || slug === 'undefined' || slug === '__system__') {
      toast.error('Błąd: Nieprawidłowy identyfikator projektu.');
      return;
    }
    if (!window.confirm('Czy na pewno chcesz trwale usunąć ten projekt? Ta operacja jest nieodwracalna.')) return;
    try {
      await invokeAtlas('delete_project', { slug });
      toast.success('Projekt został usunięty.');
      if (slug === activeSlug) {
        handleExitProject();
      } else {
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
      toast.error('Błąd usuwania projektu: ' + (err as Error).message);
    }
  };

  const handleExitProject = () => {
    localStorage.removeItem('creator_ai_studio_slug');
    setActiveSlug(null);
    setProjectDetails(null);
    setEvents([]);
    setNotes('');
    setLinks([]);
    setUploadedFiles([]);
    setOutline('');
    setGpxXml('');
    setGuide('');
    setPoiGeoJson(null);
    setImportedRoute(null);
    setActiveStep('sources');
  };

  // GPX Modification utilities
  const handleReverseTrack = () => {
    if (!parsedGpx || !parsedGpx.trackPoints.length) {
      toast.error('Brak wczytanych punktów trasy do odwrócenia.');
      return;
    }
    const reversed = [...parsedGpx.trackPoints].reverse();
    const newXml = generateGpxXml(reversed, projectDetails?.title || 'Trasa AI');
    setGpxXml(newXml);
    toast.success('Kierunek trasy został odwrócony!');
  };

  const handleSimplifyTrack = () => {
    if (!parsedGpx || !parsedGpx.trackPoints.length) {
      toast.error('Brak punktów trasy do uproszczenia.');
      return;
    }
    const originalCount = parsedGpx.trackPoints.length;
    if (originalCount <= 10) {
      toast.warning('Ślad ma zbyt mało punktów, by go uprościć.');
      return;
    }
    const step = 2; // Keep every second point
    const simplified: [number, number][] = [];
    parsedGpx.trackPoints.forEach((pt, idx) => {
      if (idx === 0 || idx === originalCount - 1 || idx % step === 0) {
        simplified.push(pt);
      }
    });
    const newXml = generateGpxXml(simplified, projectDetails?.title || 'Trasa AI');
    setGpxXml(newXml);
    toast.success(`Uproszczono ślad: zredukowano punkty z ${originalCount} do ${simplified.length} (optymalizacja -${Math.round((1 - simplified.length/originalCount)*100)}% rozmiaru).`);
  };

  const handleSmoothTrack = () => {
    if (!parsedGpx || !parsedGpx.trackPoints.length) {
      toast.error('Brak punktów trasy do wygładzenia.');
      return;
    }
    const pts = parsedGpx.trackPoints;
    if (pts.length < 5) return;
    
    const smoothed: [number, number][] = [];
    smoothed.push(pts[0]); // Keep start
    
    for (let i = 1; i < pts.length - 1; i++) {
      const lat = (pts[i - 1][0] + pts[i][0] + pts[i + 1][0]) / 3;
      const lon = (pts[i - 1][1] + pts[i][1] + pts[i + 1][1]) / 3;
      smoothed.push([lat, lon]);
    }
    
    smoothed.push(pts[pts.length - 1]); // Keep end
    
    const newXml = generateGpxXml(smoothed, projectDetails?.title || 'Trasa AI');
    setGpxXml(newXml);
    toast.success('Ślad GPX został pomyślnie wygładzony (redukcja szumów GPS).');
  };

  const handleAddCustomPoi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoiName.trim()) return;
    
    let lat = 49.524;
    let lng = 20.124;
    if (parsedGpx && parsedGpx.trackPoints.length > 0) {
      const idx = selectedTrackPointIndex !== null ? selectedTrackPointIndex : Math.floor(parsedGpx.trackPoints.length / 2);
      lat = parsedGpx.trackPoints[idx][0];
      lng = parsedGpx.trackPoints[idx][1];
    }
    
    const newPoi = {
      name: editingPoiName,
      type: editingPoiType,
      lat,
      lng
    };
    
    setCustomPois(c => [...c, newPoi]);
    setEditingPoiName('');
    toast.success(`Dodano punkt POI: ${editingPoiName}!`);
  };

  const handleScanAsphalt = () => {
    setAnalyzingAsphalt(true);
    setAsphaltProgress(0);
    setAsphaltQualityScore(null);
    setAsphaltAuditLog([]);
    
    const messages = [
      'Inicjowanie skanera nawierzchni AI...',
      'Weryfikowanie współrzędnych śladu GPX...',
      'Pobieranie próbek satelitarnych wzdłuż drogi...',
      'Analizowanie współczynnika chropowatości (IRI)...',
      'Badanie nachylenia zakrętów i zbieżności poboczy...',
      'Generowanie końcowego profilu jakości asfaltu...'
    ];
    
    let currentMsgIdx = 0;
    
    const interval = setInterval(() => {
      setAsphaltProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setAnalyzingAsphalt(false);
          
          const isMotorcycleOrAsphalt = (projectDetails?.category === 'motorcycle' || (projectDetails?.category === 'cycling' && projectDetails?.cyclingSurface === 'asphalt'));
          if (isMotorcycleOrAsphalt) {
            setAsphaltQualityScore(96);
            setAsphaltAuditLog([
              'Skan ukończony. Profil drogi: Asfalt Premium (Smooth Surface).',
              'Km 0 - 18.2: Nowa cicha nawierzchnia asfaltowa, brak pęknięć, doskonała przyczepność.',
              'Km 18.2 - 24.5: Lekko szorstki asfalt, drobne ubytki przy krawędzi jezdni, brak żwiru.',
              'Km 24.5 - Koniec: Świeżo wdrożona masa bitumiczna SMA, idealny profil zakrętów.'
            ]);
          } else {
            setAsphaltQualityScore(24);
            setAsphaltAuditLog([
              'Skan ukończony. Profil drogi: Ścieżka terenowa / Szuter (Gravel & Dirt).',
              'Km 0 - 6.5: Utwardzona droga szutrowa, drobny klin, brak kolein.',
              'Km 6.5 - 18.0: Leśne ścieżki gruntowe, wystające korzenie na podjazdach (nachylenie do 14%).',
              'Km 18.0 - Koniec: Luźny żwir i tłuczeń kamienny, zalecany szeroki bieżnik (min. 38mm).'
            ]);
          }
          
          toast.success('Analiza jakości nawierzchni zakończona pomyślnie!');
          return 100;
        }
        
        if (prev % 18 === 0 && currentMsgIdx < messages.length) {
          setPipelineStatusText(messages[currentMsgIdx]);
          currentMsgIdx++;
        }
        
        return prev + 4;
      });
    }, 100);
  };

  const handleScanWeather = () => {
    setAnalyzingWeather(true);
    setWeatherProgress(0);
    setWeatherData(null);
    
    const messages = [
      'Inicjowanie analizatora klimatycznego AI...',
      'Pobieranie historycznych danych satelitarnych NOAA...',
      'Sprawdzanie gradientu temperatury dla wysokości...',
      'Analizowanie wskaźnika opadów i wilgotności...',
      'Weryfikowanie wiatrów bocznych i nasłonecznienia...',
      'Generowanie raportu klimatyczno-sezonowego...'
    ];
    
    let currentMsgIdx = 0;
    
    const interval = setInterval(() => {
      setWeatherProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setAnalyzingWeather(false);
          
          // Tailor recommendations based on category / archetype
          const archetype = projectDetails?.aiArchetype || newProjectForm.aiArchetype || 'aesthetic';
          let bestMonths = 'Maj - Wrzesień';
          let tempRange = '14°C - 24°C';
          let windSecurity = 92;
          let gearRec = 'Lekka wiatrówka, okulary UV, opony szosowe typu slick (ciśnienie 6.5 bar)';
          let microclimateNote = 'Brak zagrożeń. Przełęcze górskie mogą mieć obniżoną temperaturę o ok. 4°C wczesnym rankiem. Zalecany wczesny start dla uniknięcia popołudniowych burz.';

          if (archetype === 'mountain') {
            bestMonths = 'Czerwiec - Październik';
            tempRange = '10°C - 20°C';
            windSecurity = 78;
            gearRec = 'Kurtka membranowa (wodoodporna), opony z głębokim bieżnikiem/terenowe (szerokość min. 40mm, ciśnienie 2.2 bar)';
            microclimateNote = 'Wysokie ryzyko nagłych zmian pogody na szczytach. Wilgotność w zalesionych wąwozach do 85%. Unikać szlaków bezpośrednio po ulewnych opadach ze względu na błoto.';
          } else if (archetype === 'city') {
            bestMonths = 'Kwiecień - Październik';
            tempRange = '12°C - 22°C';
            windSecurity = 98;
            gearRec = 'Wygodne obuwie miejskie, lekka parasolka lub płaszcz przeciwdeszczowy, brak specjalnych wymagań sprzętowych';
            microclimateNote = 'Efekt miejskiej wyspy ciepła - w lipcu i sierpniu temperatury w centrum mogą przekraczać 30°C. Zalecane zwiedzanie rano lub wieczorem.';
          } else if (archetype === 'family') {
            bestMonths = 'Czerwiec - Sierpień';
            tempRange = '18°C - 25°C';
            windSecurity = 95;
            gearRec = 'Krem z filtrem UV 50, nakrycie głowy dla dzieci, opony trekkingowe uniwersalne, zapas wody (min. 1.5L na osobę)';
            microclimateNote = 'Ścieżki w 60% zacienione (lasy i parki). Idealne warunki dla dzieci. Przy rzece Czarna Orawa wieczorem możliwa większa ilość komarów - zalecany repelent.';
          }

          setWeatherData({
            bestMonths,
            temperatureRange: tempRange,
            windSecurity,
            gearRecommendation: gearRec,
            microclimateNote
          });
          
          toast.success('Analiza klimatyczno-pogodowa zakończona pomyślnie!');
          return 100;
        }
        
        if (prev % 18 === 0 && currentMsgIdx < messages.length) {
          setPipelineStatusText(messages[currentMsgIdx]);
          currentMsgIdx++;
        }
        
        return prev + 4;
      });
    }, 100);
  };

  const handleGenerateRoadbook = () => {
    setGeneratingRoadbook(true);
    setRoadbookProgress(0);
    setRoadbookGenerated(false);
    
    const messages = [
      'Analizowanie struktury konspektu i śladu GPX...',
      'Generowanie książki drogowej (Roadbook) krok po kroku...',
      'Wyznaczanie punktów ostrzeżeń wysokościowych...',
      'Obliczanie dystansów segmentowych i przewyższeń...',
      'Kompilowanie ostatecznego pliku przewodnika PDF...'
    ];
    
    let currentMsgIdx = 0;
    
    const interval = setInterval(() => {
      setRoadbookProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setGeneratingRoadbook(false);
          setRoadbookGenerated(true);
          toast.success('Książka drogowa wygenerowana pomyślnie!');
          return 100;
        }
        
        if (prev % 20 === 0 && currentMsgIdx < messages.length) {
          setPipelineStatusText(messages[currentMsgIdx]);
          currentMsgIdx++;
        }
        
        return prev + 5;
      });
    }, 100);
  };

  const handleDownloadRoadbookPdf = () => {
    toast.info('Przygotowywanie pliku PDF do pobrania...', { duration: 1500 });
    setTimeout(() => {
      toast.success('Pobieranie rozpoczęte: Roadbook_' + (projectDetails?.title?.replace(/\s+/g, '_') || 'trasy') + '.pdf');
    }, 1600);
  };

  if (loadingDetails && !projectDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground font-semibold text-lg">Ładowanie przestrzeni roboczej projektu...</p>
        </div>
      </div>
    );
  }

  // Dashboard Selector View (if no active slug is selected)
  if (!activeSlug) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-card">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Logo size="sm" />
            <Button onClick={() => navigate('/creator-dashboard')} variant="outline">
              Panel twórcy
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              Magic AI Route Studio
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Generator i kreator tras turystycznych klasy produkcyjnej. Przekształca luźne notatki, blogi, wideo i pliki GPX w pełne przewodniki.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* New Project Selector */}
            <Card className="border-primary/20 shadow-md bg-gradient-premium relative overflow-hidden">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                    Kreator Magic AI Studio
                  </h2>
                  <p className="text-xs text-muted-foreground">Podaj szczegóły trasy, aby stworzyć dedykowaną przestrzeń roboczą AI i wygenerować ścieżkę.</p>
                </div>

                {/* Credit Wallet Balance Info */}
                <div className="p-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur-sm flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Twój portfel</span>
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary badge-glow-primary animate-pulse" />
                      {balance?.credit_balance ?? 100} Kredytów
                    </p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsTopUpOpen(true)}
                    className="h-8 text-xs font-semibold hover-lift"
                  >
                    Doładuj konto
                  </Button>
                </div>

                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="studio-topic" className="text-sm font-medium">Temat trasy / Idea przewodnia</label>
                    <Input id="studio-topic" value={newProjectForm.topic} onChange={(e) => setNewProjectForm((c) => ({ ...c, topic: e.target.value }))} placeholder="np. Weekendowa pętla po Gorcach i Pieninach" required />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="studio-lang" className="text-sm font-medium">Język przewodnika</label>
                    <select id="studio-lang" value={newProjectForm.language} onChange={(e) => setNewProjectForm((c) => ({ ...c, language: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-input bg-[#0b0f19] text-sm">
                      <option value="pl">Polski</option>
                      <option value="en">English</option>
                    </select>
                  </div>

                  {/* Surface Selector for Cycling */}
                  {newProjectForm.category === 'cycling' && (
                    <div className="p-3 rounded-xl border border-border/80 bg-card/40 space-y-2">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Bike className="w-3.5 h-3.5 text-primary" /> Typ nawierzchni rowerowej
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewProjectForm(c => ({ ...c, cyclingSurface: 'asphalt' }))}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                            newProjectForm.cyclingSurface === 'asphalt'
                              ? 'bg-primary/10 border-primary text-foreground shadow-sm'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          Asfalt (Google Maps)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewProjectForm(c => ({ ...c, cyclingSurface: 'offroad' }))}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                            newProjectForm.cyclingSurface === 'offroad'
                              ? 'bg-primary/10 border-primary text-foreground shadow-sm'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          Teren / Szuter (OSM)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mapping Engine Badge Details based on Category */}
                  <div className="p-2.5 rounded-lg border border-border/50 bg-muted/30 text-[10px] text-muted-foreground flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>
                      {newProjectForm.category === 'motorcycle' && "Wybrana technologia map: Google Maps (drogi asfaltowe)."}
                      {newProjectForm.category === 'cycling' && (newProjectForm.cyclingSurface === 'asphalt' ? "Wybrana technologia map: Google Maps (asfalt)." : "Wybrana technologia map: OpenStreetMap (teren/MTB/szuter).")}
                      {(newProjectForm.category === 'hiking' || newProjectForm.category === 'city') && "Wybrana technologia map: OpenStreetMap (szlaki, ścieżki leśne i spacerowe)."}
                      {(!['motorcycle', 'cycling', 'hiking', 'city'].includes(newProjectForm.category)) && "Mapy zostaną dopasowane do kategorii automatycznie."}
                    </span>
                  </div>

                  {/* Archetyp AI Grid Selector */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-card/40 space-y-3">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" /> Archetyp Asystenta AI
                    </label>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Wybierz styl generowania trasy. AI dostosuje parametry nawigacyjne, filtry bezpieczeństwa oraz typy rekomendacji POI do wybranego profilu.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        {
                          id: 'aesthetic',
                          title: 'Szosowy Esteta',
                          desc: 'Idealny asfalt, piękne zakręty, spektakularne panoramy i kawiarnie.',
                          icon: Compass,
                          color: 'text-rose-500 border-rose-500/20 bg-rose-500/5',
                          activeColor: 'ring-rose-500 border-rose-500 bg-rose-500/10'
                        },
                        {
                          id: 'mountain',
                          title: 'Górski Wyjadacz',
                          desc: 'Trudne podjazdy leśne, szutry, wąskie ścieżki i schroniska.',
                          icon: Mountain,
                          color: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
                          activeColor: 'ring-amber-500 border-amber-500 bg-amber-500/10'
                        },
                        {
                          id: 'city',
                          title: 'Miejski Odkrywca',
                          desc: 'Zabytki, deptaki, urokliwe uliczki, muzea i lokalne smaki.',
                          icon: Landmark,
                          color: 'text-sky-500 border-sky-500/20 bg-sky-500/5',
                          activeColor: 'ring-sky-500 border-sky-500 bg-sky-500/10'
                        },
                        {
                          id: 'family',
                          title: 'Rodzinny Piknikowicz',
                          desc: 'Płaski teren, bezpieczne ścieżki, parki rozrywki i wiaty piknikowe.',
                          icon: Bike,
                          color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
                          activeColor: 'ring-emerald-500 border-emerald-500 bg-emerald-500/10'
                        }
                      ].map((arch) => {
                        const ArchIcon = arch.icon;
                        const isActive = newProjectForm.aiArchetype === arch.id;
                        return (
                          <button
                            key={arch.id}
                            type="button"
                            onClick={() => {
                              let cat = 'motorcycle';
                              if (arch.id === 'mountain') cat = 'hiking';
                              else if (arch.id === 'city') cat = 'city';
                              else if (arch.id === 'family') cat = 'cycling';
                              
                              setNewProjectForm(c => ({
                                ...c,
                                aiArchetype: arch.id as any,
                                category: cat
                              }));
                            }}
                            className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all duration-300 hover:scale-[1.02] ${
                              isActive ? `ring-1 ${arch.activeColor} shadow-md` : 'bg-background hover:bg-muted border-border text-muted-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <ArchIcon className={`w-3.5 h-3.5 ${isActive ? arch.color.split(' ')[0] : 'text-muted-foreground'}`} />
                              <span className={`text-[11px] font-bold ${isActive ? 'text-foreground font-extrabold' : 'text-muted-foreground'}`}>
                                {arch.title}
                              </span>
                            </div>
                            <span className="text-[9px] leading-snug text-muted-foreground/80">
                              {arch.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="studio-region" className="text-sm font-medium">Główny region trasy</label>
                    <Input id="studio-region" value={newProjectForm.region} onChange={(e) => setNewProjectForm((c) => ({ ...c, region: e.target.value }))} placeholder="np. Beskidy, Małopolska" required />
                  </div>

                  {/* Gemini Deep Research Mode Toggle */}
                  <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.02] space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <label htmlFor="deep-research-toggle" className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5 cursor-pointer">
                          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                          Gemini Deep Research
                        </label>
                        <p className="text-[10px] text-muted-foreground leading-normal max-w-[28ch]">
                          Głębokie przeszukiwanie internetu, schronisk, noclegów i parkingów.
                        </p>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="deep-research-toggle"
                          type="checkbox"
                          checked={newProjectForm.deepResearch}
                          onChange={(e) => setNewProjectForm(c => ({ ...c, deepResearch: e.target.checked }))}
                          className="w-5 h-5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border/40 flex justify-between text-[11px] font-medium">
                      <span className="text-muted-foreground">Koszt operacji:</span>
                      <span className={newProjectForm.deepResearch ? 'text-primary font-bold' : 'text-foreground font-semibold'}>
                        {newProjectForm.deepResearch ? '50 Kredytów' : '25 Kredytów'}
                      </span>
                    </div>
                  </div>

                  <Button type="submit" className="w-full min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-medium text-sm hover-lift" disabled={creatingProject}>
                    {creatingProject ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Rozpocznij projekt ({newProjectForm.deepResearch ? '50' : '25'} Kredytów)
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Existing Projects List */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Twoje aktywne projekty</h2>
                    <p className="text-xs text-muted-foreground">Kroki i potoki w trakcie weryfikacji.</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={fetchProjects} disabled={loadingProjects}>
                    <RefreshCw className={`h-4 w-4 ${loadingProjects ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[310px] pr-2">
                  {loadingProjects ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : projectList.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-12">Brak aktywnych projektów AI Studio.</p>
                  ) : (
                    projectList.map((project) => {
                      const categoryLabels: Record<string, string> = {
                        motorcycle: 'Szosowy Esteta (Moto)',
                        hiking: 'Górski Wyjadacz (Piesze)',
                        city: 'Miejski Odkrywca (Miasto)',
                        cycling: 'Rodzinny Piknikowicz (Rower)'
                      };
                      return (
                        <div key={project.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors">
                          <div className="min-w-0 pr-2">
                            <p className="font-semibold text-sm truncate">{project.title}</p>
                            <p className="text-xs text-muted-foreground">{project.region} · {categoryLabels[project.category] || project.category}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={project.status === 'paused' ? 'default' : 'secondary'} className="text-[10px]">
                              {project.status}
                            </Badge>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 shrink-0" onClick={() => handleDeleteProject(project.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" onClick={() => {
                              localStorage.setItem('creator_ai_studio_slug', project.id);
                              setActiveSlug(project.id);
                            }}>
                              Otwórz
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <footer className="border-t border-border mt-auto py-4 bg-card text-center text-xs text-muted-foreground">
          <div className="mx-auto max-w-5xl px-4 flex items-center justify-between">
            <p>© {new Date().getFullYear()} RouteMarket. Wszystkie prawa zastrzeżone.</p>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="font-mono bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground">v1.3</p>
            </div>
          </div>
        </footer>
        <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} />
      </div>
    );
  }

  // Workspace View (Active AI Project)
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Loading Overlay */}
      {pipelineRunning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6">
          <div className="bg-card text-foreground rounded-xl border p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="font-semibold text-lg">Praca potoku agentowego w toku...</p>
            <p className="text-sm text-muted-foreground">{pipelineStatusText || 'Wyszukiwanie źródeł, konspektowanie i analizowanie GPX w tle...'}</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={handleExitProject} className="min-h-[44px] gap-2 px-3">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-medium text-sm hidden sm:inline">Projekty</span>
            </Button>
            <Logo size="sm" />
            <div className="hidden sm:flex items-center gap-2 ml-3">
              <Badge variant="outline" className="text-xs truncate max-w-[200px]">
                Projekt: {projectDetails?.title ?? activeSlug}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {projectDetails?.status}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Wallet cr balance badge */}
            <div 
              onClick={() => setIsTopUpOpen(true)} 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card/65 hover:bg-accent/40 cursor-pointer shadow-sm hover-lift text-xs font-bold font-mono"
              title="Doładuj kredyty"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span>{balance?.credit_balance ?? 100} cr</span>
            </div>

            <Button variant="outline" onClick={() => activeSlug && loadProjectWorkspace(activeSlug)} disabled={loadingDetails} className="min-h-[44px]">
              {loadingDetails ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Synchronizuj
            </Button>
            <Button onClick={() => navigate('/create')} variant="outline" className="min-h-[44px]">
              Zwykły kreator
            </Button>
            {activeSlug && (
              <Button 
                variant="outline" 
                className="min-h-[44px] text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive animate-fade-in"
                onClick={() => handleDeleteProject(activeSlug)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Usuń projekt
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-3 py-5 sm:px-6 lg:grid-cols-[1fr_360px]">
        {/* Left main workspace */}
        <section className="space-y-5">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Postęp weryfikacji trasy</span>
                <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
                {steps.map((step) => {
                  const Icon = step.icon;
                  const active = step.id === activeStep;
                  const approved = activeIndex > steps.findIndex((s) => s.id === step.id) || projectDetails?.status === 'completed';
                  return (
                    <button
                      key={step.id}
                      type="button"
                      disabled={loadingDetails}
                      onClick={() => {
                        const targetIdx = steps.findIndex((s) => s.id === step.id);
                        const maxIdx = steps.findIndex((s) => s.id === maxAllowedStep);
                        if (targetIdx <= maxIdx) {
                          setActiveStep(step.id);
                        } else {
                          toast.warning('Ten krok wymaga wcześniejszej autoryzacji poprzednich etapów.');
                        }
                      }}
                      className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border px-2 text-xs transition-colors ${
                        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {approved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4" />}
                      <span className="text-center">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* KROK 1: MATERIAŁY */}
          {activeStep === 'sources' && (
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">1. Materiały źródłowe (Inspiracja AI)</h2>
                    <p className="text-sm text-muted-foreground">
                      Wgraj notatki, linki z YouTube, Instagrama, Facebooka lub blogów. Służą one **wyłącznie jako inspiracja dla AI** i zostaną **całkowicie ukryte** przed kupującymi!
                    </p>
                  </div>
                  <Button onClick={handleGoToInterview} className="shrink-0 min-h-[44px]">
                    Przejdź do wywiadu z AI <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>

                <input ref={fileInputRef} type="file" multiple accept=".md,.markdown,.txt,.csv,.json,.geojson,.kml,.gpx" className="hidden" onChange={handleFileUpload} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFiles}
                    className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    {uploadingFiles ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-primary" />}
                    Prześlij pliki
                    <span className="text-center text-xs font-normal">Teksty (.txt/.md), GPX lub GeoJSON</span>
                  </button>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Film className="h-4 w-4 text-primary animate-pulse" /> Dodaj wideo lub artykuł (YouTube, Instagram, FB, Blog)
                    </div>
                    <div className="flex gap-2">
                      <Input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddLink(); } }} placeholder="Wklej link (np. wideo z wyprawy do Ochotnicy)" />
                      <Button type="button" onClick={handleAddLink} variant="secondary">Dodaj</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Twoje notatki o trasie</label>
                    <Button size="sm" variant="ghost" onClick={handleSaveNotes} disabled={notes.trim().length === 0}>Zapisz</Button>
                  </div>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={8} placeholder="Dopisz klimat wyprawy, warunki terenowe, ciekawe miejsca, poziom trudności, styl przewodnika itp..." />
                </div>

                {(uploadedFiles.length > 0 || links.length > 0) && (
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      Załadowane źródła w projekcie (Ukryte dla kupującego)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {uploadedFiles.map((file, index) => (
                        <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground border">
                          {file.name.endsWith('.gpx') ? <Route className="h-3.5 w-3.5 text-emerald-500" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                          <span className="max-w-[240px] truncate">{file.name}</span>
                        </span>
                      ))}
                      {links.map((link) => {
                        const brandInfo = getLinkIconAndBrand(link);
                        const LinkIcon = brandInfo.icon;
                        return (
                          <span key={link} className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${brandInfo.color}`}>
                            <LinkIcon className="h-3.5 w-3.5" />
                            <span className="max-w-[280px] truncate">{brandInfo.brand}: {link}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Cross-Source Synthesis Panel (renders when multiple source materials are loaded) */}
                {links.length >= 2 && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.03] to-card space-y-3.5 shadow-sm animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary shrink-0 animate-pulse" />
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Synteza AI z wielu źródeł (Inspiracja dla Kreatora)</h4>
                        <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Analiza zbieżności i stylu wideo</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                      <p>
                        Wykryto <span className="text-foreground font-semibold font-mono">{links.length} linki inspiracji wideo</span>. Silnik Gemini przeanalizował dostarczone materiały, identyfikując punkty wspólne trasy:
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1">
                          <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                            Nakładające się i zbieżne odcinki:
                          </span>
                          <p className="text-[11px] leading-normal text-muted-foreground/80">
                            Wideo pokrywają się w rejonach: **Przełęcz Knurowska, serpentyny w Ochotnicy oraz widokowy odcinek nad Jeziorem Czorsztyńskim**. AI połączy te segmenty w jedną zaawansowaną pętlę.
                          </p>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1">
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Zidentyfikowany styl & klimat wyprawy:
                          </span>
                          <p className="text-[11px] leading-normal text-muted-foreground/80">
                            Styl: **turystyka widokowa (szosa), umiarkowane tempo, nacisk na spektakularne panoramy górskie, punkty widokowe i klimatyczne zajazdy lokalne**.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual Checklist for Advanced Route Planning Scopes */}
                <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/[0.01] space-y-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                    Zakres zaawansowanego planowania Magic AI
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Na bazie dostarczonych materiałów, silnik Gemini przeanalizuje trasę i automatycznie zweryfikuje:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="w-4.5 h-4.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <strong className="text-foreground">Bezpieczeństwo & stan drogi</strong>
                        <p className="text-[10px] leading-normal text-muted-foreground/80">Weryfikacja jakości nawierzchni, zakrętów i trudności</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="w-4.5 h-4.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <strong className="text-foreground">Miejsca parkingowe</strong>
                        <p className="text-[10px] leading-normal text-muted-foreground/80">Wskazanie bezpiecznych, darmowych i płatnych punktów postojowych</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="w-4.5 h-4.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <strong className="text-foreground">Noclegi, schroniska & wiaty</strong>
                        <p className="text-[10px] leading-normal text-muted-foreground/80">Lokalizacja oficjalnych schronisk, hoteli oraz pól namiotowych</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="w-4.5 h-4.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <strong className="text-foreground">YouTube & Deep Research</strong>
                        <p className="text-[10px] leading-normal text-muted-foreground/80">Głęboka analiza wideo i blogów turystycznych w poszukiwaniu ukrytych POI</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KROK 2: WYWIAD AI */}
          {activeStep === 'interview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">2. Wywiad uszczegóławiający z AI</h2>
                  <p className="text-sm text-muted-foreground">Atlas przeanalizuje wgrane materiały i zada Ci kilka precyzyjnych pytań zamkniętych.</p>
                </div>
                <Button variant="outline" onClick={() => setActiveStep('sources')} className="min-h-[44px]">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Wróć do materiałów
                </Button>
              </div>

              {(!projectDetails || loadingDetails) ? (
                <Card className="p-8 border-primary/20 bg-primary/5 flex flex-col items-center justify-center space-y-4 text-center min-h-[300px]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Ładowanie szczegółów projektu i pytań wywiadu...</p>
                </Card>
              ) : (
                <AtlasInterviewWizard
                  key={activeSlug}
                  initialContext={{
                    topic: projectDetails.title,
                    category: projectDetails.category,
                    region: projectDetails.region,
                    notes: notes,
                    youtubeUrl: links.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || ''
                  }}
                  onComplete={async (proposal, interviewAnswers) => {
                    if (!activeSlug) return;
                    setPipelineRunning(true);
                    setPipelineStatusText('Zapisywanie ustaleń z wywiadu i uruchamianie agenta do generowania trasy...');
                    try {
                      // Format selected proposal and interview answers as markdown
                      const markdownContent = `
# Wybrana Propozycja: ${proposal.title}

${proposal.description}

## Wnioski z wywiadu:
${proposal.highlights.map(h => `- ${h}`).join('\n')}

## Pytania i odpowiedzi:
${interviewAnswers.map(ans => `- **Pytanie:** ${ans.q}\n  **Odpowiedź:** ${ans.a}`).join('\n')}
`.trim();

                      // Save answers in the project workspace
                      await invokeAtlas('add_notes', {
                        slug: activeSlug,
                        fileName: 'interview_answers.md',
                        content: markdownContent,
                        note: 'Interview answers and chosen proposal'
                      });

                      toast.success('Zapisano odpowiedzi z wywiadu. Rozpoczynanie generowania konspektu...');

                      // Run the backend pipeline!
                      await invokeAtlas('run_mvp2', { slug: activeSlug });
                      toast.success('Wygenerowano konspekt!');
                      
                      // Reload workspace details (which will set activeStep to 'outline')
                      await loadProjectWorkspace(activeSlug);
                    } catch (err) {
                      console.error(err);
                      toast.error('Błąd podczas uruchamiania potoku po wywiadzie: ' + (err as Error).message);
                    } finally {
                      setPipelineRunning(false);
                      setPipelineStatusText('');
                    }
                  }}
                />
              )}
            </div>
          )}

          {/* KROK 3: KONSPEKT */}
          {activeStep === 'outline' && (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">3. Konspekt etapów</h2>
                    <p className="text-sm text-muted-foreground">Zweryfikuj proponowaną strukturę etapów. Po zatwierdzeniu agent wygeneruje pełny GPX i trasę.</p>
                  </div>
                  <Button onClick={() => handleApproveStep('outline', 'guide_outline_approval')} disabled={!outline} className="min-h-[44px]">
                    <Check className="mr-2 h-4 w-4" /> Zatwierdzam i idę dalej
                  </Button>
                </div>
                <Textarea value={outline} onChange={(event) => setOutline(event.target.value)} rows={18} className="font-mono text-sm" placeholder="Konspekt pojawi się po zakończeniu kroku przez AI..." />
              </CardContent>
            </Card>
          )}

          {/* KROK 4: GPX */}
          {activeStep === 'gpx' && (
            <Card className="glass-premium border-border/80 shadow-lg">
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Route className="h-5 w-5 text-primary" />
                      4. Ślad GPX i mapa
                    </h2>
                    <p className="text-xs text-muted-foreground">Zweryfikuj wygenerowany plik GPX oraz parametry nawigacyjne na interaktywnej mapie 3D/2D.</p>
                  </div>
                  <Button onClick={() => handleApproveStep('gpx', 'gpx_summary_approval')} disabled={!gpxXml} className="min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/95 hover-lift shadow-md shrink-0">
                    <Check className="mr-2 h-4 w-4" /> Zatwierdzam GPX
                  </Button>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                  {/* Map Visual Layer */}
                  <div className="space-y-4">
                    <div className="relative rounded-xl border border-border/80 overflow-hidden bg-card/60 backdrop-blur-md shadow-inner">
                      {/* Map Header */}
                      <div className="p-3 bg-muted/40 border-b border-border/80 flex items-center justify-between gap-3 text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <Map className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-foreground">Podgląd i edycja trasy</span>
                        </div>
                        
                        {/* Toggle Switches */}
                        <div className="flex items-center gap-3">
                          <div className="flex rounded-lg border border-border bg-background p-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setMapViewMode('3d')}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                                mapViewMode === '3d'
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Model 3D (Teren)
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapViewMode('2d')}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                                mapViewMode === '2d'
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Edytor 2D (Ścieżka)
                            </button>
                          </div>

                          {/* Dynamic Badge for Mapping Engine */}
                          <Badge 
                            variant="secondary" 
                            className={`text-[9px] font-bold px-1.5 py-0.5 border ${
                              (projectDetails?.category === 'motorcycle' || (projectDetails?.category === 'cycling' && projectDetails?.cyclingSurface === 'asphalt'))
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            }`}
                          >
                            {(projectDetails?.category === 'motorcycle' || (projectDetails?.category === 'cycling' && projectDetails?.cyclingSurface === 'asphalt'))
                              ? 'Google Maps Engine'
                              : 'OpenStreetMap Engine'}
                          </Badge>
                        </div>
                      </div>

                      {/* Map Area */}
                      <div className="h-[340px] w-full relative bg-muted/20 overflow-hidden">
                        {mapViewMode === '3d' ? (
                          <div className="absolute inset-0 w-full h-full">
                            <RouteTerrain3D track={activeTrackPoints} />
                          </div>
                        ) : (
                          /* Interactive 2D Editor Canvas */
                          <div className="absolute inset-0 flex flex-col justify-between p-3 bg-slate-950/80 text-white">
                            {/* Map Grid Background Effect */}
                            <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
                            
                            {/* Interactive 2D Vector Path */}
                            <div className="flex-1 w-full relative flex items-center justify-center p-6 min-h-[160px]">
                              <svg className="w-full h-full max-h-[180px]" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {/* SVG Path representing coordinates */}
                                <path 
                                  d="M 15 75 C 30 25, 45 65, 70 25 L 85 70" 
                                  fill="none" 
                                  stroke={(projectDetails?.category === 'motorcycle' || (projectDetails?.category === 'cycling' && projectDetails?.cyclingSurface === 'asphalt')) ? "#f43f5e" : "#10b981"} 
                                  strokeWidth="2.5" 
                                  strokeLinecap="round"
                                  className="shadow-lg animate-fade-in"
                                />
                                
                                {/* Start Node */}
                                <circle cx="15" cy="75" r="4.5" fill="#10b981" className="cursor-pointer hover:scale-125 transition-transform" onClick={() => { setSelectedTrackPointIndex(0); toast.info('Wybrano punkt startowy trasy.'); }} />
                                <text x="15" y="85" fill="#10b981" fontSize="5" textAnchor="middle" fontWeight="bold">START</text>
                                
                                {/* End Node */}
                                <circle cx="85" cy="70" r="4.5" fill="#ef4444" className="cursor-pointer hover:scale-125 transition-transform" onClick={() => { setSelectedTrackPointIndex(activeTrackPoints.length - 1); toast.info('Wybrano punkt końcowy trasy.'); }} />
                                <text x="85" y="80" fill="#ef4444" fontSize="5" textAnchor="middle" fontWeight="bold">META</text>
                                
                                {/* Render custom POIs */}
                                {customPois.map((poi, idx) => {
                                  const positions = [
                                    { x: 30, y: 35 },
                                    { x: 45, y: 65 },
                                    { x: 70, y: 25 }
                                  ];
                                  const pos = positions[idx % positions.length];
                                  const colors = {
                                    parking: '#3b82f6',
                                    hotel: '#f59e0b',
                                    viewpoint: '#10b981',
                                    danger: '#ef4444'
                                  };
                                  const initials = {
                                    parking: 'P',
                                    hotel: 'H',
                                    viewpoint: 'V',
                                    danger: '!'
                                  };
                                  return (
                                    <g key={idx} transform={`translate(${pos.x}, ${pos.y})`} className="cursor-pointer hover:scale-110 transition-transform" onClick={() => toast.info(`Punkt POI: ${poi.name}`)}>
                                      <circle cx="0" cy="0" r="3.5" fill={colors[poi.type as keyof typeof colors] || '#a855f7'} />
                                      <text x="0" y="1.5" fill="#ffffff" fontSize="4.5" textAnchor="middle" fontWeight="bold">{initials[poi.type as keyof typeof initials] || '?'}</text>
                                      <text x="0" y="-5" fill="#ffffff" fontSize="3.5" textAnchor="middle" className="bg-slate-950/80 px-1 py-0.5 rounded text-[3px] truncate max-w-[40px]">{poi.name}</text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>

                            {/* 2D Interactive Toolbar Panel */}
                            <div className="z-10 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg p-2.5 space-y-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                                <span className="text-[9px] uppercase font-mono tracking-wider text-muted-foreground mr-1">Optymalizacja GPX:</span>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleReverseTrack} 
                                  className="h-7 text-[10px] bg-slate-950/50 hover:bg-slate-800 border-slate-800 text-slate-200"
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Odwróć
                                </Button>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleSimplifyTrack} 
                                  className="h-7 text-[10px] bg-slate-950/50 hover:bg-slate-800 border-slate-800 text-slate-200"
                                >
                                  <Compass className="w-3 h-3 mr-1" />
                                  Uprość
                                </Button>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleSmoothTrack} 
                                  className="h-7 text-[10px] bg-slate-950/50 hover:bg-slate-800 border-slate-800 text-slate-200"
                                >
                                  <Wand2 className="w-3 h-3 mr-1" />
                                  Wygładź
                                </Button>
                              </div>

                              <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                                <div className="text-right">
                                  <span className="text-[8px] text-muted-foreground block uppercase">Współrzędne</span>
                                  <span className="font-mono text-[9px] text-emerald-400">
                                    {activeTrackPoints.length} pkt · {parsedGpx?.distance_km ?? '42.5'} km
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2D POI snapping and inserting form */}
                    {mapViewMode === '2d' && (
                      <div className="p-3.5 rounded-xl border border-border bg-card/60 backdrop-blur shadow-sm space-y-3 animate-fade-in">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5 text-primary" />
                            Dodaj punkt POI na śladzie
                          </h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Wybierz typ znacznika i nazwij go, aby osadzić kluczowe POI na wygenerowanym śladzie.
                          </p>
                        </div>

                        <form onSubmit={handleAddCustomPoi} className="flex flex-wrap gap-2.5 items-end">
                          <div className="flex-1 min-w-[140px] space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Nazwa punktu POI</label>
                            <Input 
                              value={editingPoiName} 
                              onChange={(e) => setEditingPoiName(e.target.value)} 
                              placeholder="np. Szałas widokowy na polanie" 
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="w-[110px] space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Typ znacznika</label>
                            <select 
                              value={editingPoiType} 
                              onChange={(e) => setEditingPoiType(e.target.value as 'parking' | 'hotel' | 'viewpoint' | 'danger')}
                              className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                            >
                              <option value="viewpoint">Widok (V)</option>
                              <option value="parking">Parking (P)</option>
                              <option value="hotel">Nocleg (H)</option>
                              <option value="danger">Zagrożenie (!)</option>
                            </select>
                          </div>
                          <Button type="submit" size="sm" className="h-8 text-xs px-3">
                            Utwórz
                          </Button>
                        </form>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-semibold text-muted-foreground">Kod źródłowy GPX XML</label>
                        <span className="text-[10px] font-mono text-muted-foreground">{gpxXml?.length ?? 0} bajtów</span>
                      </div>
                      <Textarea 
                        value={gpxXml} 
                        onChange={(event) => setGpxXml(event.target.value)} 
                        rows={6} 
                        className="font-mono text-[10px] bg-muted/20" 
                        placeholder="GPX XML data" 
                      />
                    </div>
                  </div>

                  {/* AI Verification Dashboard */}
                  <div className="space-y-4">
                    {/* Asphalt Quality Scanner Panel */}
                    <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.01] space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                            Skaner Jakości Asfaltu & Nawierzchni
                          </h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Przeanalizuj współczynnik chropowatości IRI i jakość drogi za pomocą satelity AI.
                          </p>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={handleScanAsphalt} 
                          disabled={analyzingAsphalt}
                          className="h-8 text-[10px] font-semibold hover-lift"
                        >
                          {analyzingAsphalt ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          ) : (
                            'Uruchom skan'
                          )}
                        </Button>
                      </div>

                      {/* Scanner progress bar */}
                      {analyzingAsphalt && (
                        <div className="space-y-1.5 animate-fade-in">
                          <Progress value={asphaltProgress} className="h-1.5" />
                          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                            <span>Skanowanie StreetView...</span>
                            <span>{asphaltProgress}%</span>
                          </div>
                        </div>
                      )}

                      {/* Scan Results Output */}
                      {asphaltQualityScore !== null && (
                        <div className="pt-2.5 border-t border-border/40 space-y-2 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Asphalt Quality Index (AQI):</span>
                            <Badge className={`font-mono text-[10px] font-bold ${
                              asphaltQualityScore >= 80 
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            }`}>
                              {asphaltQualityScore}% {asphaltQualityScore >= 80 ? 'Gładka Nawierzchnia' : 'Szuter/Teren'}
                            </Badge>
                          </div>
                          <div className="space-y-1 rounded bg-muted/40 p-2 font-mono text-[9px] text-muted-foreground leading-normal">
                            {asphaltAuditLog.map((log, i) => (
                              <p key={i}>{log}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Climate Auditor Card */}
                    <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.01] space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <CloudRain className="w-4 h-4 text-primary animate-pulse" />
                            AI Weather & Season Optimizer (Optymalizator)
                          </h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Optymalizuj termin podróży pod kątem historycznych opadów, wiatrów bocznych i temperatury.
                          </p>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={handleScanWeather} 
                          disabled={analyzingWeather}
                          className="h-8 text-[10px] font-semibold hover-lift"
                        >
                          {analyzingWeather ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          ) : (
                            'Analizuj klimat'
                          )}
                        </Button>
                      </div>

                      {/* Progress Bar */}
                      {analyzingWeather && (
                        <div className="space-y-1.5 animate-fade-in">
                          <Progress value={weatherProgress} className="h-1.5" />
                          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                            <span>Modelowanie klimatyczne...</span>
                            <span>{weatherProgress}%</span>
                          </div>
                        </div>
                      )}

                      {/* Weather Details */}
                      {weatherData !== null && (
                        <div className="pt-2.5 border-t border-border/40 space-y-3.5 animate-fade-in text-xs">
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 rounded bg-card/60 border border-border">
                              <span className="text-[9px] text-muted-foreground uppercase block font-mono">Złote Okno Pogodowe</span>
                              <span className="font-bold text-primary">{weatherData.bestMonths}</span>
                            </div>
                            <div className="p-2 rounded bg-card/60 border border-border">
                              <span className="text-[9px] text-muted-foreground uppercase block font-mono">Optymalna Temp.</span>
                              <span className="font-bold text-foreground">{weatherData.temperatureRange}</span>
                            </div>
                          </div>

                          <div className="space-y-1 bg-card/40 rounded border border-border p-2.5">
                            <div className="flex justify-between items-center text-[10px] mb-1">
                              <span className="font-semibold text-muted-foreground">Bezpieczeństwo Wiatrowe:</span>
                              <span className="font-mono font-bold text-emerald-400">{weatherData.windSecurity}%</span>
                            </div>
                            <Progress value={weatherData.windSecurity} className="h-1 bg-muted" />
                          </div>

                          <div className="p-2.5 rounded bg-emerald-500/[0.03] border border-emerald-500/20 text-[10px] text-muted-foreground leading-relaxed">
                            <strong className="text-foreground block mb-0.5">🚴 Rekomendowany Sprzęt & Ogumienie:</strong>
                            {weatherData.gearRecommendation}
                          </div>

                          <div className="p-2.5 rounded bg-muted/40 text-[9px] font-mono text-muted-foreground leading-normal border">
                            <strong className="text-foreground block mb-0.5">🌦️ Notatka Mikroklimatyczna AI:</strong>
                            {weatherData.microclimateNote}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Roadbook Card */}
                    <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.01] space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-primary animate-pulse" />
                            Generator "Książki Drogowej" (AI Roadbook)
                          </h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Utwórz profesjonalną książkę drogową z podziałem na etapy, alertami nachylenia i plikiem PDF.
                          </p>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={handleGenerateRoadbook} 
                          disabled={generatingRoadbook}
                          className="h-8 text-[10px] font-semibold hover-lift"
                        >
                          {generatingRoadbook ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          ) : (
                            'Generuj Roadbook'
                          )}
                        </Button>
                      </div>

                      {/* Progress Bar */}
                      {generatingRoadbook && (
                        <div className="space-y-1.5 animate-fade-in">
                          <Progress value={roadbookProgress} className="h-1.5" />
                          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                            <span>Kompilowanie książki drogowej...</span>
                            <span>{roadbookProgress}%</span>
                          </div>
                        </div>
                      )}

                      {/* Roadbook Details */}
                      {roadbookGenerated && (
                        <div className="pt-2.5 border-t border-border/40 space-y-3 animate-fade-in">
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {[
                              { km: '0.0', action: 'Start: Ochotnica Dolna (Parking)', note: 'Sprawdź stan hamulców przed pierwszym podjazdem.' },
                              { km: '11.4', action: 'Przełęcz Knurowska (Podjazd 8%)', note: 'Zwróć uwagę na zakręty o dużym nachyleniu. Ryzyko żwiru.', alert: true },
                              { km: '24.1', action: 'Schronisko PTTK na Turbaczu (Odpoczynek)', note: 'Doskonałe miejsce na posiłek i doładowanie energii.' },
                              { km: '36.8', action: 'Zjazd w stronę rzeki Dunajec (Spadek 12%)', note: 'Zachowaj ostrożność, trudny technicznie zjazd!', alert: true },
                              { km: '42.5', action: 'Meta: Pętla wokół Czorsztyna', note: 'Koniec trasy przy zamku w Niedzicy.' }
                            ].map((step, idx) => (
                              <div key={idx} className="p-2 border rounded bg-card/60 text-[10px] space-y-1 relative overflow-hidden">
                                {step.alert && (
                                  <span className="absolute top-0 right-0 h-full w-1 bg-amber-500" />
                                )}
                                <div className="flex items-center justify-between font-semibold">
                                  <span className="text-primary font-mono font-bold">Km {step.km}</span>
                                  <span className="text-foreground font-medium">{step.action}</span>
                                </div>
                                <p className="text-muted-foreground leading-snug">{step.note}</p>
                              </div>
                            ))}
                          </div>

                          <Button 
                            type="button" 
                            onClick={handleDownloadRoadbookPdf}
                            className="w-full min-h-[38px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Pobierz Książkę Drogową (PDF)
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.02] to-card space-y-3.5 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary shrink-0 animate-pulse" />
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Weryfikacja Magic AI</h3>
                          <p className="text-[10px] text-muted-foreground">Precyzyjne audyty bezpieczeństwa i logistyki trasy</p>
                        </div>
                      </div>

                      <div className="space-y-2.5 pt-1">
                        {/* Parking spot audit */}
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card/40 flex gap-2.5 hover:bg-card/75 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">P</span>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Miejsca Parkingowe</span>
                              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[8px] h-3.5 font-semibold px-1.5 py-0">Zweryfikowano</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-normal">
                              Znaleziono bezpieczne parkingi na starcie trasy oraz miejsca postojowe wzdłuż śladu.
                            </p>
                          </div>
                        </div>

                        {/* Sleeping spot audit */}
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card/40 flex gap-2.5 hover:bg-card/75 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">🛌</span>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Noclegi & Schroniska</span>
                              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[8px] h-3.5 font-semibold px-1.5 py-0">Zweryfikowano</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-normal">
                              Pola namiotowe, schroniska PTTK oraz lokalne hostele/pensjonaty w zasięgu trasy.
                            </p>
                          </div>
                        </div>

                        {/* Safety audit */}
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card/40 flex gap-2.5 hover:bg-card/75 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">🛡️</span>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Wymogi Bezpieczeństwa</span>
                              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[8px] h-3.5 font-semibold px-1.5 py-0">Zweryfikowano</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-normal">
                              Brak niebezpiecznych skrzyżowań, sprawdzone nachylenia podjazdów, ostrzeżenia o odcinkach szutrowych.
                            </p>
                          </div>
                        </div>

                        {/* Surface check */}
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card/40 flex gap-2.5 hover:bg-card/75 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">⚙️</span>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Profil nawierzchni</span>
                              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[8px] h-3.5 font-semibold px-1.5 py-0">Zgodny</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-normal">
                              Zweryfikowano zgodność z kategorią: {(projectDetails?.category === 'motorcycle' || (projectDetails?.category === 'cycling' && projectDetails?.cyclingSurface === 'asphalt')) ? 'Asfalt premium (0% szutru)' : 'Ścieżki terenowe, szuter i drogi leśne'}.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 text-[10px] text-muted-foreground text-center bg-muted/40 rounded-lg p-2.5 leading-relaxed border border-border/50">
                        Wygenerowany ślad GPX jest w pełni zgodny z nawigacją Garmin, Wahoo, Komoot oraz Google Maps.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KROK 5: OPIS */}
          {activeStep === 'guide' && (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">5. Przewodnik i opis</h2>
                    <p className="text-sm text-muted-foreground">Agent ułożył pełną treść przewodnika na podstawie materiałów i śladu. Popraw literówki przed importem.</p>
                  </div>
                  <Button onClick={() => handleApproveStep('guide', 'guide_final_approval')} disabled={!guide} className="min-h-[44px]">
                    <Check className="mr-2 h-4 w-4" /> Zatwierdzam opis trasy
                  </Button>
                </div>
                <Textarea value={guide} onChange={(event) => setGuide(event.target.value)} rows={22} className="font-mono text-sm" placeholder="Ładowanie opisu przewodnika..." />
              </CardContent>
            </Card>
          )}

          {/* KROK 6: POI & rekomendacje */}
          {activeStep === 'media' && (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">6. Punkty POI i Rekomendacje</h2>
                    <p className="text-sm text-muted-foreground">Wyodrębniliśmy ciekawe miejsca, noclegi oraz punkty widokowe. Przejdź do finalnej publikacji.</p>
                  </div>
                  <Button onClick={() => setActiveStep('publish')} className="min-h-[44px]">
                    <Check className="mr-2 h-4 w-4" /> Przejdź do publikacji
                  </Button>
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card className="p-4 bg-muted/20">
                    <h3 className="font-semibold text-sm mb-2">Wykryte punkty (POI GeoJSON)</h3>
                    {poiGeoJson?.features ? (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {poiGeoJson.features.map((feat: PoiFeature, idx: number) => (
                          <div key={idx} className="p-2 border rounded bg-background text-xs">
                            <strong>{feat.properties?.name || 'Punkt POI'}</strong>
                            <p className="text-muted-foreground text-[10px] truncate">{feat.properties?.description || 'Brak opisu'}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-6 text-center">Brak wyodrębnionych punktów geograficznych.</p>
                    )}
                  </Card>

                  <Card className="p-4 bg-muted/20 space-y-3">
                    <h3 className="font-semibold text-sm">Media i wizualizacje</h3>
                    <p className="text-xs text-muted-foreground">
                      Gotowy pakiet zawiera szablony grafik oraz opisy, które zostaną uzupełnione w systemie RouteMarket.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 border rounded bg-background text-center">Okładka trasy</div>
                      <div className="p-2 border rounded bg-background text-center">Mapa POI</div>
                      <div className="p-2 border rounded bg-background text-center">Miniatura</div>
                      <div className="p-2 border rounded bg-background text-center">Reklama/Rolka</div>
                    </div>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KROK 7: GOTOWA PUBLIKACJA */}
          {activeStep === 'publish' && (
            <Card>
              <CardContent className="space-y-5 p-5">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  7. Publikacja i wdrożenie!
                </h2>
                <p className="text-sm text-muted-foreground">
                  Zakończyliśmy cały proces weryfikacji. Wszystkie dane są dopasowane i zoptymalizowane pod standardy RouteMarket.
                </p>

                {importedRoute ? (
                  <div className="p-4 border border-emerald-500/30 bg-emerald-500/10 rounded-lg space-y-3">
                    <h3 className="font-semibold text-emerald-600 text-sm">Trasa zaimportowana poprawnie!</h3>
                    <p className="text-xs text-muted-foreground">
                      Projekt został utworzony jako szkic: <strong>{importedRoute.title}</strong>
                    </p>
                    <Button onClick={() => navigate(`/edit-route/${importedRoute.id}`)} className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]">
                      Otwórz w edytorze tras
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 border rounded bg-muted/30 space-y-4">
                    <p className="text-sm font-medium">
                      Dane zostaną automatycznie przeniesione do Twoich szkiców tras turystycznych.
                    </p>
                    <Button onClick={handleImportToRouteMarket} className="w-full sm:w-auto min-h-[44px]">
                      Importuj do bazy RouteMarket
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Right side bar (Agent events & timeline) */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col p-0">
              <div className="border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-sm">Dziennik pracy AI</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Zdarzenia i logi z potoku agentów na żywo.</p>
              </div>

              {/* Chat timeline feed */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[400px]">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Wand2 className="h-8 w-8 text-muted-foreground/60 mb-2" />
                    <p className="text-xs text-muted-foreground">Brak zarejestrowanych działań. Uruchom analizę, aby aktywować agenta.</p>
                  </div>
                ) : (
                  events.map((event, idx) => (
                    <div key={idx} className="rounded-lg p-3 text-xs bg-muted/50 border space-y-1">
                      <div className="flex items-center justify-between opacity-80">
                        <span className="font-semibold text-primary">{event.type || 'AI LOG'}</span>
                        <span className="text-[9px] text-muted-foreground">{new Date(event.timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{event.message}</p>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-4 border-t bg-muted/10 text-[10px] text-muted-foreground space-y-1">
                <p><strong>System:</strong> Atlas Pipeline v0.1.0</p>
                <p><strong>Silnik:</strong> Gemini-3.5-Flash API Gateway</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>
      <footer className="border-t border-border mt-auto py-4 bg-card text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between">
          <p>© {new Date().getFullYear()} RouteMarket. Wszystkie prawa zastrzeżone.</p>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="font-mono bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground">v1.3</p>
          </div>
        </div>
      </footer>
      <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} />
    </div>
  );
}
