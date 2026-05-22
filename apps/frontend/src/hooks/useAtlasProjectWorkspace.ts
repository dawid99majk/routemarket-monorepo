import { useState, useCallback } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { Project, EventLog, PipelineStep, PoiGeoJson } from '@/types/atlas-types';
import { toast } from 'sonner';

export function useAtlasProjectWorkspace(slug: string | null) {
  const { invokeAtlas } = useAtlasApi();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [activeStep, setActiveStep] = useState<PipelineStep>('sources');
  
  // Artifacts
  const [notes, setNotes] = useState('');
  const [gpxXml, setGpxXml] = useState('');
  const [outline, setOutline] = useState('');
  const [guide, setGuide] = useState('');
  const [poiGeoJson, setPoiGeoJson] = useState<PoiGeoJson | null>(null);
  const [claims, setClaims] = useState<any[]>([]);

  const loadFile = useCallback(async (path: string) => {
    if (!slug) return '';
    try {
      const data = await invokeAtlas('get_file', { slug, path }) as { content?: string };
      return data.content ?? '';
    } catch (err) {
      console.warn(`Failed to load project file ${path}:`, err);
      return '';
    }
  }, [slug, invokeAtlas]);

  const fetchWorkspace = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const detailData = await invokeAtlas('get_project', { slug }) as { project: Project };
      const proj = detailData.project;
      setProject(proj);

      const eventData = await invokeAtlas('list_events', { slug }) as { events?: EventLog[] };
      setEvents(eventData.events ?? []);

      const claimsContent = await loadFile('claims.json');
      try {
        setClaims(claimsContent ? JSON.parse(claimsContent) : []);
      } catch {
        setClaims([]);
      }

      // Map status to steps
      if (proj.status === 'created' || proj.status === 'research_needed') {
        setActiveStep('sources');
        const content = await loadFile('notes.md');
        setNotes(content);
      } else if (proj.status === 'paused' || proj.status === 'running') {
        const waitingStage = proj.waitingApprovalStage;
        if (waitingStage === 'gpx_summary_approval') {
          setActiveStep('gpx');
          const content = await loadFile('route.gpx');
          setGpxXml(content);
        } else if (waitingStage === 'guide_outline_approval') {
          setActiveStep('outline');
          const content = await loadFile('guide_outline.md');
          setOutline(content);
        } else if (waitingStage === 'guide_final_approval') {
          setActiveStep('guide');
          const content = await loadFile('guide.md');
          setGuide(content);
        }
      } else if (proj.status === 'draft_generated' || proj.status === 'completed') {
        setActiveStep('media');
        const content = await loadFile('poi.geojson');
        try {
          setPoiGeoJson(JSON.parse(content));
        } catch {
          setPoiGeoJson(null);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Błąd ładowania projektu: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug, invokeAtlas, loadFile]);

  return {
    project,
    loading,
    events,
    activeStep,
    setActiveStep,
    artifacts: {
      notes, setNotes,
      gpxXml, setGpxXml,
      outline, setOutline,
      guide, setGuide,
      poiGeoJson, setPoiGeoJson,
      claims, setClaims
    },
    fetchWorkspace,
    loadFile
  };
}
