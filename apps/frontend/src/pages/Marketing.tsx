import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import PlannerHeader from '@/components/PlannerHeader';

/**
 * Warsztat materiałów promocyjnych.
 *
 * Promowanie platformy rozbijało się o pustą stronę: żeby napisać post, trzeba
 * było najpierw wybrać tablicę, otworzyć ją, spisać z niej miasto, liczbę miejsc
 * i kilka nazw, a dopiero potem zacząć układać zdania. Narzędzie zbija te kroki
 * w jeden ekran — wybór tablicy, wybór kanału, gotowe warianty do skopiowania.
 *
 * Treść powstaje wyłącznie z danych opublikowanej tablicy. Model dostaje je
 * wpisane wprost w zapytanie i ma zakaz dopowiadania liczb, opinii i nazwisk,
 * bo post chwalący się nieistniejącą statystyką kosztuje więcej niż brak postu.
 *
 * Grafika jest typograficzna, bez zdjęcia. Nie z lenistwa: zdjęcia miejsc
 * pochodzą z zewnętrznych serwerów, których nagłówki CORS bywają różne, a obraz
 * bez nich zatruwa kanwę i uniemożliwia zapis pliku. Karta zbudowana z samego
 * tekstu zawsze się wyeksportuje i przy okazji wygląda jak reszta serwisu.
 */

interface Tablica {
  id: string;
  name: string;
  destination: string | null;
  days: number | null;
  like_count: number | null;
  copy_count: number | null;
}

interface Wariant {
  tytul: string;
  tekst: string;
  hashtagi: string[];
}

interface Fakty {
  nazwa: string;
  kierunek: string | null;
  dni: number | null;
  ileMiejsc: number;
  adres: string;
}

const KANALY = [
  { id: 'instagram', label: 'Instagram', opis: 'Podpis pod post, zaczepienie w pierwszej linii, hashtagi' },
  { id: 'facebook', label: 'Facebook', opis: 'Dłuższy post z odnośnikiem w treści' },
  { id: 'seo', label: 'Wyszukiwarki', opis: 'Znacznik title, opis meta i frazy kluczowe' },
] as const;
type KanalId = typeof KANALY[number]['id'];

const FORMATY = [
  { id: 'kwadrat', label: 'Kwadrat 1080 × 1080', w: 1080, h: 1080 },
  { id: 'poziom', label: 'Poziom 1200 × 630', w: 1200, h: 630 },
] as const;
type FormatId = typeof FORMATY[number]['id'];

/** Zmienne motywu trzymamy w HSL bez owijki, więc na kanwę trzeba je złożyć. */
function barwa(nazwa: string, alfa = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
  return alfa === 1 ? `hsl(${v})` : `hsl(${v} / ${alfa})`;
}

/** Łamanie tekstu po słowach — kanwa nie umie tego sama. */
function zawin(ctx: CanvasRenderingContext2D, tekst: string, maks: number): string[] {
  const slowa = tekst.split(/\s+/);
  const linie: string[] = [];
  let biezaca = '';
  for (const s of slowa) {
    const proba = biezaca ? `${biezaca} ${s}` : s;
    if (ctx.measureText(proba).width > maks && biezaca) {
      linie.push(biezaca);
      biezaca = s;
    } else {
      biezaca = proba;
    }
  }
  if (biezaca) linie.push(biezaca);
  return linie;
}

/** Licznik znaków dla znaczników o twardym limicie. */
function Licznik({ ile, limit, co }: { ile: number; limit: number; co: string }) {
  const zaDlugi = ile > limit;
  return (
    <p className={`font-mono text-[11px] tabular-nums mt-1.5 ${
      zaDlugi ? 'text-clay' : 'text-muted-foreground'
    }`}>
      {co} {ile}/{limit}{zaDlugi ? ` · o ${ile - limit} za dużo, wyszukiwarka utnie` : ''}
    </p>
  );
}

export default function Marketing() {
  const [tablice, setTablice] = useState<Tablica[]>([]);
  const [wybrana, setWybrana] = useState<string | null>(null);
  const [kanal, setKanal] = useState<KanalId>('instagram');
  const [format, setFormat] = useState<FormatId>('kwadrat');
  const [warianty, setWarianty] = useState<Wariant[]>([]);
  const [fakty, setFakty] = useState<Fakty | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [ladowanie, setLadowanie] = useState(true);
  const [skopiowany, setSkopiowany] = useState<number | null>(null);
  const kanwa = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('trip_projects')
        .select('id, name, destination, days, like_count, copy_count')
        .eq('is_public', true)
        .limit(200);
      const lista = (data ?? []) as Tablica[];
      // Najpierw te, które już się komuś spodobały — od nich zaczyna się promocja.
      lista.sort((a, b) =>
        ((b.like_count ?? 0) + (b.copy_count ?? 0) * 2) - ((a.like_count ?? 0) + (a.copy_count ?? 0) * 2));
      setTablice(lista);
      if (lista.length) setWybrana(lista[0].id);
      setLadowanie(false);
    })();
  }, []);

  const aktywna = useMemo(() => tablice.find((t) => t.id === wybrana) ?? null, [tablice, wybrana]);

  const generuj = async () => {
    if (!wybrana) return;
    setPracuje(true);
    setWarianty([]);
    try {
      const odp = await apiPost<{ fakty: Fakty; warianty: Wariant[] }>(
        '/marketing/tresci', { tablicaId: wybrana, kanal });
      setFakty(odp.fakty);
      setWarianty(odp.warianty);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się wygenerować treści');
    } finally {
      setPracuje(false);
    }
  };

  const kopiuj = async (w: Wariant, i: number) => {
    const znaki = kanal === 'seo'
      ? `${w.tytul}\n\n${w.tekst}\n\n${w.hashtagi.join(', ')}`
      : `${w.tekst}${w.hashtagi.length ? `\n\n${w.hashtagi.map((h) => `#${h}`).join(' ')}` : ''}`;
    try {
      await navigator.clipboard.writeText(znaki);
      setSkopiowany(i);
      setTimeout(() => setSkopiowany(null), 1600);
    } catch {
      toast.error('Przeglądarka nie pozwoliła na dostęp do schowka');
    }
  };

  /** Karta rysowana od zera przy każdej zmianie — jest tania, a stan zawsze świeży. */
  const rysuj = useCallback(async () => {
    const c = kanwa.current;
    if (!c || !aktywna) return;
    const f = FORMATY.find((x) => x.id === format)!;
    c.width = f.w;
    c.height = f.h;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    await document.fonts.ready;
    const marginy = Math.round(f.w * 0.075);
    const szerTekstu = f.w - marginy * 2;

    ctx.fillStyle = barwa('--primary');
    ctx.fillRect(0, 0, f.w, f.h);

    // Nadruk: delikatna krata, żeby jednolity kolor nie wyglądał jak pusty plik.
    ctx.strokeStyle = barwa('--background', 0.07);
    ctx.lineWidth = 1;
    for (let x = marginy; x < f.w; x += Math.round(f.w / 14)) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, f.h); ctx.stroke();
    }

    const jasny = barwa('--background');
    ctx.textBaseline = 'top';

    // Nadtytuł
    const mały = Math.round(f.w * 0.019);
    ctx.font = `500 ${mały}px "Archivo Narrow", Inter, sans-serif`;
    ctx.fillStyle = barwa('--background', 0.72);
    ctx.letterSpacing = `${Math.round(mały * 0.32)}px`;
    ctx.fillText('PLANNER WYJAZDÓW', marginy, marginy);
    ctx.letterSpacing = '0px';

    // Nazwa tablicy
    const duzy = Math.round(f.w * (f.id === 'kwadrat' ? 0.082 : 0.062));
    ctx.font = `300 ${duzy}px Fraunces, Georgia, serif`;
    ctx.fillStyle = jasny;
    const linie = zawin(ctx, aktywna.name, szerTekstu).slice(0, 4);
    let y = marginy + Math.round(f.h * (f.id === 'kwadrat' ? 0.22 : 0.16));
    for (const l of linie) {
      ctx.fillText(l, marginy, y);
      y += Math.round(duzy * 1.12);
    }

    // Metryka
    const dane = [
      aktywna.destination,
      `${fakty?.ileMiejsc ?? '—'} miejsc`,
      aktywna.days ? `${aktywna.days} dni` : null,
    ].filter(Boolean).join('  ·  ');
    const sredni = Math.round(f.w * 0.024);
    ctx.font = `400 ${sredni}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = barwa('--background', 0.82);
    ctx.fillText(dane, marginy, y + Math.round(f.h * 0.03));

    // Stopka
    ctx.font = `500 ${Math.round(f.w * 0.026)}px Fraunces, Georgia, serif`;
    ctx.fillStyle = jasny;
    const stopka = 'routemarket.io';
    const wys = Math.round(f.w * 0.026);
    ctx.fillText(stopka, marginy, f.h - marginy - wys);

    ctx.strokeStyle = barwa('--background', 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginy, f.h - marginy - wys - Math.round(f.h * 0.035));
    ctx.lineTo(f.w - marginy, f.h - marginy - wys - Math.round(f.h * 0.035));
    ctx.stroke();
  }, [aktywna, format, fakty]);

  useEffect(() => { rysuj(); }, [rysuj]);

  const pobierz = () => {
    const c = kanwa.current;
    if (!c || !aktywna) return;
    const nazwa = aktywna.name.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-').replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.download = `routemarket-${nazwa}-${format}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader />

      <main className="w-full max-w-[1180px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-primary">Warsztat</p>
        <h1 className="font-display font-light mt-3 text-[clamp(28px,3vw,38px)] leading-tight">
          Materiały promocyjne
        </h1>
        <p className="text-[15px] text-muted-foreground mt-3 max-w-[62ch] text-pretty">
          Treść powstaje z danych wybranej publicznej tablicy — nazwy, miasta, liczby
          miejsc. Nic poza tym nie trafia do zapytania, więc w wyniku nie pojawią się
          liczby ani opinie, których nie ma w bazie.
        </p>

        {ladowanie ? (
          <div className="flex items-center gap-2 text-muted-foreground mt-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Wczytuję tablice…
          </div>
        ) : !tablice.length ? (
          <p className="mt-10 text-muted-foreground">
            Nie ma jeszcze żadnej publicznej tablicy. Opublikuj którąś, żeby było z czego pisać.
          </p>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
            <div className="min-w-0">
              {/* Wybór tablicy */}
              <label className="font-narrow uppercase tracking-[0.2em] text-[11px] text-muted-foreground">
                Tablica
              </label>
              <select
                value={wybrana ?? ''}
                onChange={(e) => { setWybrana(e.target.value); setWarianty([]); }}
                className="mt-2 w-full h-11 rounded-md border border-border bg-card px-3 text-sm
                           outline-none focus:border-primary transition-colors"
              >
                {tablice.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.destination ? ` — ${t.destination}` : ''}
                  </option>
                ))}
              </select>

              {/* Wybór kanału */}
              <label className="font-narrow uppercase tracking-[0.2em] text-[11px] text-muted-foreground
                                block mt-7">
                Kanał
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {KANALY.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => { setKanal(k.id); setWarianty([]); }}
                    className={`text-left rounded-md border px-3 py-3 transition-colors ${
                      kanal === k.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <span className="text-sm font-medium">{k.label}</span>
                    <span className="block text-[12px] text-muted-foreground mt-1 leading-snug">
                      {k.opis}
                    </span>
                  </button>
                ))}
              </div>

              <Button onClick={generuj} disabled={pracuje} className="mt-6 h-10">
                {pracuje
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Piszę…</>
                  : 'Wygeneruj warianty'}
              </Button>

              {/* Warianty */}
              <div className="mt-8 space-y-4">
                {warianty.map((w, i) => (
                  <article key={i} className="rounded-md border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      {kanal === 'seo' ? (
                        <p className="font-display text-[17px] leading-snug min-w-0">{w.tytul}</p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground leading-snug min-w-0">{w.tytul}</p>
                      )}
                      <Button
                        variant="ghost" size="sm"
                        className="shrink-0 h-8"
                        onClick={() => kopiuj(w, i)}
                      >
                        {skopiowany === i
                          ? <><Check className="w-3.5 h-3.5 mr-1.5" /> Skopiowano</>
                          : <><Copy className="w-3.5 h-3.5 mr-1.5" /> Kopiuj</>}
                      </Button>
                    </div>
                    {/* Znaczniki pod wyszukiwarki mają twarde limity, po których Google
                        ucina zdanie w pół słowa. Model bywa o kilka znaków za długi,
                        więc licznik jest tu po to, żeby dało się to zauważyć przed
                        wklejeniem, a nie dopiero w wynikach wyszukiwania. */}
                    {kanal === 'seo' && <Licznik ile={w.tytul.length} limit={60} co="title" />}
                    <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{w.tekst}</p>
                    {kanal === 'seo' && <Licznik ile={w.tekst.length} limit={155} co="opis" />}
                    {w.hashtagi.length > 0 && (
                      <p className="mt-3 font-mono text-[12px] text-dusty-blue break-words">
                        {w.hashtagi.map((h) => (kanal === 'seo' ? h : `#${h}`)).join(kanal === 'seo' ? ' · ' : ' ')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>

            {/* Karta graficzna */}
            <aside className="min-w-0">
              <label className="font-narrow uppercase tracking-[0.2em] text-[11px] text-muted-foreground">
                Grafika
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {FORMATY.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`rounded-full border px-3 h-8 text-[12px] transition-colors ${
                      format === f.id
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <canvas
                ref={kanwa}
                className="mt-4 w-full h-auto rounded-md border border-border"
              />

              <Button variant="outline" onClick={pobierz} className="mt-3 h-10 w-full">
                <Download className="w-4 h-4 mr-2" /> Pobierz PNG
              </Button>
              <p className="text-[12px] text-muted-foreground mt-2 leading-snug">
                Karta rysuje się z nazwy tablicy i jej metryki. Liczba miejsc pojawi się
                po wygenerowaniu treści — dopiero wtedy serwer ją odsyła.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
