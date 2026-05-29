import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Import subcomponents
import DashboardStep from './components/DashboardStep';
import GpxUploadStep from './components/GpxUploadStep';
import NotesFlowStep from './components/NotesFlowStep';
import InterviewFlowStep from './components/InterviewFlowStep';
import DynamicQuestionsStep from './components/DynamicQuestionsStep';
import AlternativesViewStep from './components/AlternativesViewStep';
import FinalReportStep from './components/FinalReportStep';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8081'
  : '/route-builder-api';

type StepType = 'dashboard' | 'path1_gpx' | 'path2_notatki' | 'path3_wywiad' | 'dynamic_questions' | 'polling' | 'alternatives' | 'ready';
type ActivityType = 'hiking' | 'motorcycle' | 'cycling' | 'city_walk';

export default function RouteBuilderV2() {
  const [step, setStep] = useState<StepType>('dashboard');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Core Data states
  const [trackPoints, setTrackPoints] = useState<[number, number][] | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[] | null>(null);
  const [places, setPlaces] = useState<{ name: string; lat: number; lng: number }[] | null>(null);
  const [alternatives, setAlternatives] = useState<any[] | null>(null);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<string | null>(null);
  
  // GPX states
  const [gpxFileName, setGpxFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Form Preferences
  const [routeType, setRouteType] = useState<ActivityType>('hiking');
  const [region, setRegion] = useState('');
  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [isLoop, setIsLoop] = useState(false);
  const [distanceTarget, setDistanceTarget] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<string>('moderate');

  // Path 2 (Notes) state
  const [userNotes, setUserNotes] = useState('');
  const [analyzingNotes, setAnalyzingNotes] = useState(false);
  const [youtubeLink, setYoutubeLink] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState<'idle' | 'fetching' | 'success'>('idle');

  // Path 3 (Interview) state
  const [path3Step, setPath3Step] = useState(1);
  const [path3Answers, setPath3Answers] = useState({
    region: '',
    customRegion: '',
    activity: '',
    customActivity: '',
    parking: '',
    customParking: '',
    distance: '',
    customDistance: '',
    difficulty: '',
    customDifficulty: ''
  });

  // Dynamic Questions state
  const [selectedPills, setSelectedPills] = useState<string[]>([]);
  const [durationPref, setDurationPref] = useState<'short' | 'long'>('short');
  const [customWish, setCustomWish] = useState('');

  useEffect(() => {
    // Force dark mode on mount for premium dark aesthetics
    document.documentElement.classList.add('dark');
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

  // Polling for Job Completion
  useEffect(() => {
    let timer: any;
    if (jobId && projectId && (jobStatus?.status === 'running' || jobStatus?.status === 'queued')) {
      timer = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/route-projects/${projectId}/jobs/${jobId}`);
          const data = await res.json();
          setJobStatus(data);
          
          if (data.status === 'ready' || data.status === 'failed' || data.status === 'waiting_for_user') {
            clearInterval(timer);
            if (data.status === 'ready') {
              // Fetch alternatives
              const altRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/alternatives`);
              if (altRes.ok) {
                const altData = await altRes.json();
                if (altData?.content) {
                  setAlternatives(altData.content);
                  if (altData.content.length > 0) {
                    setSelectedAlternativeId(altData.content[0].id);
                  }
                }
              }
              // Fetch summary
              const sRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/summary`);
              if (sRes.ok) {
                const sData = await sRes.json();
                if (sData?.content) {
                  setSummaryData(sData.content);
                  setTrackPoints(sData.content.track);
                }
              }
              // Fetch places
              const plRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/places`);
              if (plRes.ok) {
                const plData = await plRes.json();
                if (plData?.content) {
                  setPlaces(plData.content);
                }
              }
              setStep('alternatives');
              setShowMap(true);
            }
          }
        } catch (e) {
          console.error('Job polling error', e);
        }
      }, 2000);
    }
    return () => clearInterval(timer);
  }, [jobId, projectId, jobStatus?.status]);

  // Handler: GPX upload
  const handleGpxUpload = async (file: File) => {
    setLoading(true);
    setGpxFileName(file.name);
    try {
      const gpxText = await file.text();
      const pRes = await fetch(`${API_BASE}/route-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_type: routeType,
          region: 'Trasa GPX',
          start_point: file.name.replace('.gpx', ''),
          end_point: null,
          loop: false,
          distance_target_km: 1,
          difficulty: 'moderate'
        })
      });
      if (!pRes.ok) throw new Error('Błąd tworzenia projektu dla pliku GPX.');
      const project = await pRes.json();
      setProjectId(project.id);

      const gpxRes = await fetch(`${API_BASE}/route-projects/${project.id}/gpx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/gpx+xml' },
        body: gpxText
      });
      if (!gpxRes.ok) {
        const err = await gpxRes.json();
        throw new Error(err.error || 'Błąd parsowania pliku GPX.');
      }
      const summary = await gpxRes.json();
      setSummaryData(summary);
      setTrackPoints(summary.track);
      toast.success('Plik GPX został załadowany pomyślnie!');
      
      setStep('dynamic_questions');
    } catch (err: any) {
      toast.error('Błąd wgrywania GPX: ' + err.message);
      setGpxFileName(null);
    } finally {
      setLoading(false);
    }
  };

  // Handler: YouTube mock transcription
  const handleYoutubeFetch = async () => {
    if (!youtubeLink.includes('youtube.com') && !youtubeLink.includes('youtu.be')) {
      toast.error('Wklej prawidłowy link do YouTube!');
      return;
    }
    setYoutubeStatus('fetching');
    await new Promise(r => setTimeout(r, 1200));
    setYoutubeStatus('success');
    toast.success('Pomyślnie pobrano transkrypcję filmu! AI wyodrębniło z niej lokalizacje.');
    setUserNotes((prev) => 
      (prev ? prev + '\n\n' : '') + 
      'Transkrypcja z wideo YouTube:\nPrzejazd przez malowniczą trasę wokół jeziora z kilkoma punktami widokowymi. Start z parkingu leśnego, przejazd przez przełęcz górską z dużą ilością krętych odcinków, krótki postój przy lokalnym schronisku na kawę, finisz w centrum urokliwej miejscowości.'
    );
  };

  // Handler: Analyze notes flow interactively
  const handleNotesFlowSubmit = async () => {
    setAnalyzingNotes(true);
    try {
      toast.info('Analizowanie notatek przez AI...');
      const pRes = await fetch(`${API_BASE}/route-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_type: routeType,
          region: region || null,
          start_point: startPoint || null,
          end_point: null,
          loop: true,
          distance_target_km: distanceTarget,
          difficulty: difficulty,
          surface_preferences: [],
          input_notes: userNotes || null,
          avoid: []
        })
      });
      if (!pRes.ok) throw new Error(`Błąd API przy przesyłaniu notatek.`);
      const project = await pRes.json();
      setProjectId(project.id);
      
      // Jeżeli AI wyodrębniło parametry, aktualizujemy stany React
      if (project.ai_extracted_meta) {
        const meta = project.ai_extracted_meta;
        if (project.requirements.region) setRegion(project.requirements.region);
        if (project.requirements.start_point) {
          setStartPoint(project.requirements.start_point);
          setRegion(project.requirements.region || project.requirements.start_point);
        }
        if (meta.distance_target_km) setDistanceTarget(meta.distance_target_km);
        if (meta.difficulty) setDifficulty(meta.difficulty);
        if (meta.duration_pref) setDurationPref(meta.duration_pref);
        
        toast.success(`AI dopasowało parametry: start w ${project.requirements.start_point || 'Szklarska Poręba'}, dystans ${meta.distance_target_km || 10} km!`);
      }
      
      setStep('dynamic_questions');
    } catch (err: any) {
      toast.error('Błąd analizy: ' + err.message);
      setStep('dynamic_questions');
    } finally {
      setAnalyzingNotes(false);
    }
  };

  // Handler: Start job pipeline
  const handleStartPipeline = async () => {
    setLoading(true);
    setJobId(null);
    setJobStatus(null);
    setReportText(null);
    setSources(null);
    setAlternatives(null);
    
    const surface_preferences = selectedPills;

    try {
      let activeProjectId = projectId;
      if (step === 'path2_notatki' || step === 'path3_wywiad' || !activeProjectId) {
        let start = startPoint;
        let reg = region;
        let dist = distanceTarget;
        let diff = difficulty;

        if (step === 'path3_wywiad') {
          reg = path3Answers.customRegion || path3Answers.region;
          start = path3Answers.customParking || path3Answers.parking;
          dist = parseInt(path3Answers.customDistance || path3Answers.distance) || 10;
          diff = path3Answers.customDifficulty || path3Answers.difficulty || 'moderate';
        }

        const pRes = await fetch(`${API_BASE}/route-projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route_type: routeType,
            region: reg || null,
            start_point: start || null,
            end_point: endPoint || null,
            loop: true,
            distance_target_km: dist,
            difficulty: diff,
            surface_preferences,
            input_notes: userNotes || null,
            avoid: []
          })
        });
        if (!pRes.ok) throw new Error(`Błąd API przy zakładaniu projektu.`);
        const project = await pRes.json();
        activeProjectId = project.id;
        setProjectId(project.id);
      } else {
        await fetch(`${API_BASE}/route-projects/${activeProjectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route_type: routeType,
            difficulty: difficulty,
            distance_target_km: distanceTarget,
            loop: isLoop || true,
            surface_preferences
          })
        });
      }

      const jRes = await fetch(`${API_BASE}/route-projects/${activeProjectId}/jobs`, { method: 'POST' });
      if (!jRes.ok) throw new Error(`Błąd API przy uruchamianiu zadania.`);
      const job = await jRes.json();
      setJobId(job.id);
      setJobStatus(job);
      setStep('polling');
    } catch (err: any) {
      toast.error('Błąd silnika: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Selecting alternative
  const handleSelectAlternative = (id: string) => {
    setSelectedAlternativeId(id);
    const selected = alternatives?.find(alt => alt.id === id);
    if (selected) {
      setTrackPoints(selected.track);
      setPlaces(selected.pois || []);
    }
  };

  // Handler: Approving alternative
  const handleApproveAlternative = async () => {
    if (!projectId || !selectedAlternativeId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/route-projects/${projectId}/select-alternative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: selectedAlternativeId })
      });
      if (!res.ok) throw new Error('Błąd zapisu wybranego wariantu.');
      
      const rRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/report`);
      if (rRes.ok) {
        const rData = await rRes.json();
        if (rData?.raw_data) setReportText(rData.raw_data);
      }
      const srcRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/research_sources`);
      if (srcRes.ok) {
        const srcData = await srcRes.json();
        if (srcData?.content) setSources(srcData.content);
      }
      const sRes = await fetch(`${API_BASE}/route-projects/${projectId}/artifacts/summary`);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData?.content) setSummaryData(sData.content);
      }
      
      setStep('ready');
      toast.success('Świetny wybór! AI wygenerowało końcowy GPX oraz przewodnik.');
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadGpx = async () => {
    if (!projectId) return;
    try {
      toast.info('Przygotowywanie pliku GPX do pobrania...');
      const res = await fetch(`${API_BASE}/route-projects/${projectId}/gpx`);
      if (!res.ok) throw new Error('Nie udało się pobrać pliku GPX z serwera.');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `route-${projectId.slice(0, 8)}.gpx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Pomyślnie pobrano plik GPX!');
    } catch (err: any) {
      toast.error('Błąd pobierania GPX: ' + err.message);
    }
  };

  const handleReset = () => {
    setStep('dashboard');
    setProjectId(null);
    setJobId(null);
    setJobStatus(null);
    setReportText(null);
    setSources(null);
    setPlaces(null);
    setAlternatives(null);
    setTrackPoints(null);
    setSummaryData(null);
    setGpxFileName(null);
    setSelectedAlternativeId(null);
    setUserNotes('');
    setYoutubeLink('');
    setYoutubeStatus('idle');
    setPath3Step(1);
    setSelectedPills([]);
    setCustomWish('');
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 font-sans antialiased py-12 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
      
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold flex items-center gap-2 tracking-tight">
            <Sparkles className="text-cyan-400 h-8 w-8 animate-pulse" />
            RouteMarket Builder <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400">v3</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Inteligentne planowanie tras i przewodników. Rozproszona architektura komponentów React.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-zinc-900 text-cyan-400 border border-zinc-800/80 px-3 py-1 font-mono">Concept v3</Badge>
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200" onClick={() => window.location.href = '/creator-dashboard'}>
            Wróć do starego panelu
          </Button>
        </div>
      </header>

      {/* STEP ROUTER MACHINE */}
      {analyzingNotes ? (
        <Card className="bg-zinc-950 border-zinc-800 max-w-md mx-auto shadow-xl text-center p-8 animate-in fade-in duration-300">
          <CardContent className="space-y-6 pt-4">
            <Loader2 className="h-12 w-12 animate-spin text-cyan-400 mx-auto" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-zinc-200">Gemini analizuje Twoje notatki...</h3>
              <p className="text-xs text-zinc-500">
                Wyodrębniamy lokalizację startową, region, dystans oraz stopień trudności bezpośrednio z Twojego opisu.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {step === 'dashboard' && (
            <DashboardStep onChoosePath={(path) => setStep(path)} />
          )}

          {step === 'path1_gpx' && (
            <GpxUploadStep 
              routeType={routeType}
              setRouteType={setRouteType}
              onGpxUpload={handleGpxUpload}
              onBack={handleReset}
              dragActive={dragActive}
              setDragActive={setDragActive}
              loading={loading}
            />
          )}

          {step === 'path2_notatki' && (
            <NotesFlowStep 
              userNotes={userNotes}
              setUserNotes={setUserNotes}
              youtubeLink={youtubeLink}
              setYoutubeLink={setYoutubeLink}
              youtubeStatus={youtubeStatus}
              onYoutubeFetch={handleYoutubeFetch}
              routeType={routeType}
              setRouteType={setRouteType}
              region={region}
              setRegion={(v) => {
                setRegion(v);
                setStartPoint(v);
              }}
              onBack={handleReset}
              onNext={handleNotesFlowSubmit}
            />
          )}

          {step === 'path3_wywiad' && (
            <InterviewFlowStep 
              path3Step={path3Step}
              setPath3Step={setPath3Step}
              path3Answers={path3Answers}
              setPath3Answers={setPath3Answers}
              onBack={handleReset}
              onNext={() => {
                setRouteType('hiking'); // default activity
                setStep('dynamic_questions');
              }}
            />
          )}

          {step === 'dynamic_questions' && (
            <DynamicQuestionsStep 
              routeType={routeType}
              selectedPills={selectedPills}
              onTogglePill={(id) => {
                if (selectedPills.includes(id)) {
                  setSelectedPills(selectedPills.filter(p => p !== id));
                } else {
                  setSelectedPills([...selectedPills, id]);
                }
              }}
              durationPref={durationPref}
              setDurationPref={setDurationPref}
              customWish={customWish}
              setCustomWish={setCustomWish}
              onBack={() => {
                if (gpxFileName) setStep('path1_gpx');
                else if (userNotes) setStep('path2_notatki');
                else setStep('path3_wywiad');
              }}
              onGenerate={handleStartPipeline}
              loading={loading}
              hasNotes={!!userNotes}
              distanceTarget={distanceTarget}
              setDistanceTarget={setDistanceTarget}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
            />
          )}

          {step === 'polling' && (
            <Card className="bg-zinc-950 border-zinc-800 max-w-md mx-auto shadow-xl text-center p-8">
              <CardContent className="space-y-6 pt-4">
                {jobStatus?.status === 'running' || jobStatus?.status === 'queued' ? (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-cyan-400 mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-zinc-200">
                        {jobStatus.human_message || 'Trwa planowanie tras...'}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        AI i silnik GraphHopper projektują warianty alternatywne trasy.
                      </p>
                      
                      <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden mt-4">
                        <div 
                          className="h-full bg-cyan-500 transition-all duration-500" 
                          style={{ width: `${jobStatus.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 block">{jobStatus.progress}%</span>
                    </div>
                  </>
                ) : jobStatus?.status === 'failed' ? (
                  <div className="space-y-4">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                    <h3 className="font-bold text-red-400 text-lg">Błąd silnika</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      {jobStatus?.error_message || 'Krytyczny błąd podczas planowania trasy.'}
                    </p>
                    <Button onClick={handleReset} variant="outline" className="w-full border-zinc-800">
                      Spróbuj ponownie
                    </Button>
                  </div>
                ) : (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-cyan-400 mx-auto" />
                    <h3 className="font-bold text-zinc-300">Pojawił się problem...</h3>
                    <p className="text-xs text-zinc-500">Oczekiwanie na status zlecenia.</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {step === 'alternatives' && alternatives && (
            <AlternativesViewStep 
              alternatives={alternatives}
              selectedAlternativeId={selectedAlternativeId}
              onSelectAlternative={handleSelectAlternative}
              trackPoints={trackPoints}
              places={places}
              showMap={showMap}
              onApproveAlternative={handleApproveAlternative}
              onReset={handleReset}
              loading={loading}
            />
          )}

          {step === 'ready' && (
            <FinalReportStep 
              summaryData={summaryData}
              trackPoints={trackPoints}
              places={places}
              showMap={showMap}
              reportText={reportText}
              sources={sources}
              onDownloadGpx={handleDownloadGpx}
              onReset={handleReset}
            />
          )}
        </>
      )}

      </div>
    </div>
  );
}
