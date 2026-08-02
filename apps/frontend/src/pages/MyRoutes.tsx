import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, MapPin, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';

interface BuilderProject {
  id: string;
  created_at: string;
  updated_at: string | null;
  requirements: {
    title?: string;
    gpxData?: string;
    waypoints?: unknown[];
    vehicleType?: string;
  } | null;
}

const VEHICLE_LABEL: Record<string, string> = {
  motorcycle: 'Motocykl', bicycle: 'Rower', hiking: 'Pieszo', city: 'Miasto', car: 'Samochód'
};

/**
 * Własne trasy użytkownika. Wcześniej strona łączyła je z trasami kupionymi
 * w marketplace — po odejściu od sprzedaży został sam kreator.
 */
export default function MyRoutes() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate('/auth');
        return;
      }
      const { data } = await (supabase as any)
        .from('route_builder_projects')
        .select('id, created_at, updated_at, requirements')
        .order('updated_at', { ascending: false, nullsFirst: false });
      setProjects(data || []);
      setLoading(false);
    })();
  }, [navigate]);

  const remove = async (id: string) => {
    await (supabase as any).from('route_builder_projects').delete().eq('id', id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast.success('Trasa usunięta');
  };

  const downloadGpx = (project: BuilderProject) => {
    const gpx = project.requirements?.gpxData;
    if (!gpx) return toast.error('Ta trasa nie ma jeszcze wygenerowanego pliku GPX');
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.requirements?.title || 'trasa').replace(/[^\w-]+/g, '_')}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Logo />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/plany')} className="mr-2">Plany</Button>
          <Button size="sm" onClick={() => navigate('/route-builder-v2')} className="bg-emerald-600 hover:bg-emerald-500">
            <Plus className="w-4 h-4 mr-1.5" /> Nowa trasa
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold">Moje trasy</h1>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Wczytuję…
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <Wand2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">Nie masz jeszcze żadnej trasy.</p>
            <Button onClick={() => navigate('/route-builder-v2')} className="bg-emerald-600 hover:bg-emerald-500">
              Zaplanuj pierwszą
            </Button>
          </div>
        )}

        {projects.map((project) => {
          const reqs = project.requirements || {};
          const points = Array.isArray(reqs.waypoints) ? reqs.waypoints.length : 0;
          return (
            <div key={project.id} className="rounded-xl border p-4 flex items-center gap-4">
              <MapPin className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => navigate(`/route-builder-v2?projectId=${project.id}`)}
                  className="font-medium hover:underline truncate block text-left"
                >
                  {reqs.title || 'Trasa bez nazwy'}
                </button>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {reqs.vehicleType ? `${VEHICLE_LABEL[reqs.vehicleType] || reqs.vehicleType} · ` : ''}
                  {points > 0 ? `${points} punktów · ` : ''}
                  {new Date(project.updated_at || project.created_at).toLocaleDateString('pl-PL')}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => downloadGpx(project)} disabled={!reqs.gpxData}>
                <Download className="w-4 h-4 mr-1.5" /> GPX
              </Button>
              <button onClick={() => remove(project.id)} className="text-muted-foreground hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </main>
    </div>
  );
}
