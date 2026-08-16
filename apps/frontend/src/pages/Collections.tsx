import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Globe, Loader2, Lock, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { Input } from '@/components/ui/input';

interface Collection {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: string;
}

const slugify = (name: string) =>
  `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kolekcja'}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Kolekcje. Tablica wyjazdu wymaga decyzji: dokąd i kiedy. Kolekcja nie wymaga
 * niczego — to zbiór "kawiarnie, do których chcę kiedyś trafić" albo "modernizm
 * w Polsce", budowany latami. Publiczna kolekcja jest przy okazji najlepszym
 * wejściem do serwisu, jakie istnieje: cudzy gust działa lepiej niż wyszukiwarka.
 */
export default function Collections() {
  const [inicjaly, setInicjaly] = useState<string | null>(null);
  useEffect(() => { (async () => setInicjaly(await inicjalyUzytkownika()))(); }, []);
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [current, setCurrent] = useState<Collection | null>(null);
  const [places, setPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { navigate('/auth'); return; }
      if (cancelled) return;
      setUserId(userData.user.id);

      if (slug) {
        const { data: col } = await supabase
          .from('collections').select('*').eq('slug', slug).maybeSingle();
        if (cancelled) return;
        setCurrent(col ?? null);
        if (col) {
          const { data: cp } = await supabase
            .from('collection_places').select('sort_order, place_catalog(*)')
            .eq('collection_id', col.id).order('sort_order', { ascending: true });
          if (!cancelled) setPlaces((cp ?? []).map((r: any) => r.place_catalog).filter(Boolean));
        }
      } else {
        const { data } = await supabase
          .from('collections').select('*').order('created_at', { ascending: false });
        if (!cancelled) setCollections(data ?? []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  const create = async () => {
    if (!newName.trim() || !userId) return;
    const { data, error } = await supabase.from('collections')
      .insert({ user_id: userId, name: newName.trim(), slug: slugify(newName) })
      .select('*').single();
    if (error) return toast.error(error.message);
    setCollections((prev) => [data, ...prev]);
    setNewName('');
    setCreating(false);
    toast.success('Kolekcja utworzona');
  };

  const togglePublic = async () => {
    if (!current) return;
    const next = !current.is_public;
    const { error } = await supabase.from('collections')
      .update({ is_public: next }).eq('id', current.id);
    if (error) return toast.error(error.message);
    setCurrent({ ...current, is_public: next });
    toast.success(next ? 'Kolekcja jest teraz publiczna' : 'Kolekcja jest prywatna');
  };

  const removePlace = async (placeId: string) => {
    if (!current) return;
    await supabase.from('collection_places').delete()
      .eq('collection_id', current.id).eq('place_id', placeId);
    setPlaces((prev) => prev.filter((p) => p.id !== placeId));
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/kolekcja/${current?.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję…
      </div>
    );
  }

  // --- widok pojedynczej kolekcji ---
  if (slug) {
    if (!current) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Nie znaleziono kolekcji albo jest prywatna.</p>
          <Button onClick={() => navigate('/kolekcje')}>Moje kolekcje</Button>
        </div>
      );
    }
    const isOwner = current.user_id === userId;
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/kolekcje')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold truncate">{current.name}</span>
            <div className="ml-auto flex items-center gap-2">
              {isOwner && (
                <Button variant="outline" size="sm" onClick={togglePublic}>
                  {current.is_public ? <><Globe className="w-3.5 h-3.5 mr-1.5" /> Publiczna</> : <><Lock className="w-3.5 h-3.5 mr-1.5" /> Prywatna</>}
                </Button>
              )}
              {current.is_public && (
                <Button variant="ghost" size="sm" onClick={copyLink}>
                  {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied ? 'Skopiowano' : 'Odnośnik'}
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">
          {places.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-muted-foreground">Ta kolekcja jest jeszcze pusta.</p>
              <Button onClick={() => navigate('/odkrywaj')} className="bg-primary hover:bg-primary/90">
                Znajdź miejsca
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {places.map((p) => (
                <div key={p.id} className="rounded-md overflow-hidden border bg-card hover:shadow-token-lg transition-shadow">
                  <button onClick={() => navigate(`/miejsce/${p.slug}`)} className="text-left w-full">
                    <div className="h-36 bg-muted relative">
                      {p.photos?.[0] ? (
                        <img src={p.photos[0]} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <MapPin className="w-7 h-7" />
                        </div>
                      )}
                      {isOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removePlace(p.id); }}
                          aria-label="Usuń z kolekcji"
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur flex items-center justify-center text-white"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-medium text-sm leading-snug line-clamp-2">{p.name}</div>
                      {p.city && <div className="text-xs text-muted-foreground mt-0.5">{p.city}</div>}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- lista kolekcji ---
  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader initials={inicjaly} />

      <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
          <div>
            <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
              Zebrane pomysły
            </p>
            <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
              Moje kolekcje
            </h1>
          </div>
          <Button className="bg-primary hover:bg-primary/90" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Nowa kolekcja
          </Button>
        </div>
        {creating && (
          <div className="flex gap-2 rounded-md border p-3">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Nazwa, np. „Modernizm w Polsce”"
            />
            <Button onClick={create} className="bg-primary hover:bg-primary/90">Utwórz</Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setNewName(''); }}>Anuluj</Button>
          </div>
        )}

        {collections.length === 0 && !creating ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground max-w-md mx-auto">
              Kolekcja nie wymaga decyzji, dokąd i kiedy jedziesz. To zbiór miejsc odkładanych latami —
              „kawiarnie, do których chcę kiedyś trafić”, „modernizm w Polsce”.
            </p>
            <Button onClick={() => setCreating(true)} className="bg-primary hover:bg-primary/90">
              Załóż pierwszą kolekcję
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => navigate(`/kolekcja/${col.slug}`)}
                className="text-left rounded-md border p-4 hover:shadow-token-md transition-shadow bg-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{col.name}</span>
                  {col.is_public
                    ? <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                    : <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(col.created_at).toLocaleDateString('pl-PL')}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
