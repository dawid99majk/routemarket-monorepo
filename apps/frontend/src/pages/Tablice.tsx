import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import PlannerHeader from '@/components/PlannerHeader';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';
import { useTranslation } from 'react-i18next';

interface Publiczna {
  id: string; name: string; destination: string | null; days: number | null;
  author_display: string | null; copy_count: number | null; like_count: number | null;
  is_example: boolean | null;
  published_at: string | null;
  place_count: number; photos: string[];
}

const PORZADKI = [
  { id: 'popularne', klucz: 'galeria.porzadek.popularne' },
  { id: 'nowe', klucz: 'galeria.porzadek.nowe' },
  { id: 'najwieksze', klucz: 'galeria.porzadek.najwieksze' },
] as const;
type Porzadek = typeof PORZADKI[number]['id'];

/** Wysokość kafelka 144–230 px, liczona z identyfikatora — stała między
 *  przerysowaniami, a jednocześnie różna dla sąsiadów, co daje rytm potoku. */
function wysokoscKafelka(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 144 + (h % 87);
}

/**
 * Publiczne tablice do przeglądania.
 *
 * Publikowanie istniało od dawna — polityki wpuszczały zalogowanych, licznik kopii
 * dyndał na tablicy — ale nie było ani jednej trasy, która by tu prowadziła.
 * Funkcja bez odbiorcy: dawało się opublikować, nie dawało się znaleźć.
 *
 * Galeria działa bez konta — polityki odczytu obejmują rolę anon, więc opublikowana
 * tablica może zaprosić kogoś z zewnątrz. Konto potrzebne jest dopiero, żeby coś
 * z nią zrobić: polubić albo skopiować do siebie.
 *
 * Popularność liczymy jako polubienia plus kopie. Kopia jest mocniejszym sygnałem
 * niż polubienie, bo kosztuje decyzję o własnym wyjeździe — stąd podwójna waga.
 */
export default function Tablice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [parametry] = useSearchParams();
  const [tablice, setTablice] = useState<Publiczna[]>([]);
  // Zapytanie wpisane na stronie głównej przyjeżdża adresem, żeby wejście
  // z landingu od razu pokazywało wynik, a nie pustą wyszukiwarkę.
  const [szukaj, setSzukaj] = useState(parametry.get('q') ?? '');
  const [porzadek, setPorzadek] = useState<Porzadek>('popularne');
  const [ladowanie, setLadowanie] = useState(true);
  const [inicjaly, setInicjaly] = useState<string | null>(null);
  const [moje, setMoje] = useState<Set<string>>(new Set());

  useEffect(() => { (async () => setInicjaly(await inicjalyUzytkownika()))(); }, []);

  const wczytaj = useCallback(async () => {
    setLadowanie(true);
    const { data } = await (supabase as any).from('trip_projects')
      .select('id, name, destination, days, author_display, copy_count, like_count, published_at, is_example')
      .eq('is_public', true)
      .limit(200);

    const lista = (data ?? []) as any[];
    if (lista.length) {
      const { data: miejsca } = await (supabase as any).from('trip_project_places')
        .select('project_id, image_url').in('project_id', lista.map((b) => b.id));
      const wg: Record<string, { ile: number; zdjecia: string[] }> = {};
      for (const m of miejsca ?? []) {
        const w = (wg[m.project_id] ??= { ile: 0, zdjecia: [] });
        w.ile++;
        if (m.image_url && w.zdjecia.length < 3) w.zdjecia.push(m.image_url);
      }
      setTablice(lista.map((b) => ({
        ...b, place_count: wg[b.id]?.ile ?? 0, photos: wg[b.id]?.zdjecia ?? [],
      })));
    } else {
      setTablice([]);
    }

    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      const { data: lk } = await (supabase as any).from('board_likes')
        .select('project_id').eq('user_id', u.user.id);
      setMoje(new Set((lk ?? []).map((x: any) => x.project_id)));
    }
    setLadowanie(false);
  }, []);

  useEffect(() => { wczytaj(); }, [wczytaj]);

  const popularnosc = (t: Publiczna) => (t.like_count ?? 0) + (t.copy_count ?? 0) * 2;

  const widoczne = useMemo(() => {
    const q = szukaj.trim().toLowerCase();
    const pasuje = q
      ? tablice.filter((t) =>
          t.name.toLowerCase().includes(q) ||
          (t.destination ?? '').toLowerCase().includes(q) ||
          (t.author_display ?? '').toLowerCase().includes(q))
      : tablice;
    return [...pasuje].sort((a, b) => {
      if (porzadek === 'nowe') return (b.published_at ?? '').localeCompare(a.published_at ?? '');
      if (porzadek === 'najwieksze') return b.place_count - a.place_count;
      return popularnosc(b) - popularnosc(a);
    });
  }, [tablice, szukaj, porzadek]);

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader initials={inicjaly} />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="max-w-[620px]">
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
            {t('galeria.nadtytul')}
          </p>
          <h1 className="font-display font-light text-[40px] leading-[1.05] tracking-[-0.02em] mt-2">
            {t('galeria.tytul')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-pretty">
            {t('galeria.podtytul')}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={szukaj} onChange={(e) => setSzukaj(e.target.value)}
              placeholder={t('galeria.szukaj')} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PORZADKI.map((p) => (
              <button key={p.id} onClick={() => setPorzadek(p.id)}
                aria-pressed={porzadek === p.id}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  porzadek === p.id
                    ? 'bg-foreground border-foreground text-background'
                    : 'bg-background border-border hover:bg-muted text-muted-foreground'}`}>
                {t(p.klucz)}
              </button>
            ))}
          </div>
        </div>

        {ladowanie ? (
          <p className="flex items-center gap-2 text-muted-foreground py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję tablice…
          </p>
        ) : widoczne.length === 0 ? (
          <div className="rounded-md border border-border bg-card px-6 py-16 text-center mt-8">
            <h2 className="font-display font-light text-[24px]">
              {szukaj ? t('galeria.brak_wynikow') : t('galeria.brak_tablic')}
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-[46ch] mx-auto text-pretty">
              {szukaj ? t('galeria.brak_wynikow_opis') : t('galeria.brak_tablic_opis')}
            </p>
          </div>
        ) : (
          <div className="mt-6 [column-gap:18px] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
            {(() => {
              // „Tablica tygodnia" to najczęściej kopiowana pozycja — kopia kosztuje
              // decyzję o własnym wyjeździe, więc jest mocniejszym sygnałem niż
              // polubienie. Wchodzi do potoku jako kafelek bez zdjęcia.
              const ranga = (x: Publiczna) => (x.like_count ?? 0) + (x.copy_count ?? 0) * 2;
              const tygodnia = [...widoczne].sort((a, b) => ranga(b) - ranga(a))[0];
              const pokazTygodnia = !!tygodnia && widoczne.length >= 4;
              const elementy: JSX.Element[] = [];

              widoczne.forEach((tab, i) => {
                if (pokazTygodnia && i === 2) {
                  elementy.push(
                    <button key="tygodnia" onClick={() => navigate(`/tablica/${tygodnia.id}`)}
                      className="w-full text-left break-inside-avoid mb-[18px] rounded-[10px]
                                 bg-foreground text-background p-5 shadow-token-md
                                 hover:shadow-token-lg transition-shadow">
                      <p className="font-narrow uppercase tracking-[0.26em] text-[10px] text-background/55">
                        Tablica tygodnia
                      </p>
                      <div className="font-display font-light text-[24px] leading-[1.15] mt-3 text-balance">
                        {tygodnia.name}
                      </div>
                      <p className="font-mono text-[11px] tabular-nums text-background/55 mt-3">
                        {[tygodnia.destination, `${tygodnia.place_count} ${t('galeria.miejsc')}`]
                          .filter(Boolean).join(' · ')}
                      </p>
                      <p className="font-mono text-[12px] tabular-nums text-accent mt-4">
                        {(tygodnia.copy_count ?? 0) > 0
                          ? `skopiowana ${tygodnia.copy_count} razy`
                          : (tygodnia.like_count ?? 0) > 0
                            ? `${tygodnia.like_count} polubień`
                            : 'zobacz, co ktoś już zebrał'}
                      </p>
                    </button>
                  );
                }

                const autor = tab.is_example ? null : (tab.author_display || t('galeria.autor'));
                elementy.push(
                  <button key={tab.id} onClick={() => navigate(`/tablica/${tab.id}`)}
                    className="w-full text-left break-inside-avoid mb-[18px] rounded-[10px] bg-card
                               border border-border overflow-hidden shadow-token-sm
                               hover:shadow-token-md transition-shadow">
                    <div className="relative bg-placeholder-photo"
                         style={{ height: wysokoscKafelka(tab.id) }}>
                      {tab.photos?.[0] && (
                        <img src={tab.photos[0]} alt="" loading="lazy"
                             className="w-full h-full object-cover" />
                      )}
                      {/* Etykieta w lewym górnym rogu zdjęcia, na półprzezroczystym kremie. */}
                      {(tab.is_example || tab.destination) && (
                        <span className="absolute left-2.5 top-2.5 rounded-sm bg-card/85 backdrop-blur-sm
                                         px-2 py-1 font-narrow uppercase tracking-[0.18em] text-[10px]">
                          {tab.is_example ? 'Przykład' : tab.destination}
                        </span>
                      )}
                      <span className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1
                                        rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums
                                        backdrop-blur-sm ${
                        moje.has(tab.id) ? 'bg-accent/15 text-accent' : 'bg-card/85 text-muted-foreground'}`}>
                        <Heart className={`w-3 h-3 ${moje.has(tab.id) ? 'fill-accent' : ''}`} />
                        {tab.like_count ?? 0}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <div className="font-display text-[16px] leading-snug">{tab.name}</div>
                      {/* Autor POD tytułem, nie w rogu zdjęcia — w rogu ginął na
                          jasnych fotografiach i konkurował z etykietą. */}
                      <div className="flex items-center gap-2 mt-2.5">
                        {autor ? (
                          <>
                            <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center
                                             text-[10px] font-medium text-muted-foreground shrink-0">
                              {autor.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="text-[12px] text-muted-foreground truncate">{autor}</span>
                          </>
                        ) : (
                          <span className="font-narrow uppercase tracking-[0.18em] text-[10px] text-accent">
                            RouteMarket
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
                          {tab.place_count}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              });

              return elementy;
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
