import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUp, Check, Loader2, Plug, RotateCcw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ApiError, apiPost } from '@/lib/api';
import AgentDymek from '@/components/AgentDymek';

/**
 * Agent w aplikacji: okno rozmowy, w którym można założyć tablicę, znaleźć miejsca
 * i dodać je z decyzją — bez łączenia czegokolwiek z zewnątrz. Ma te same narzędzia
 * co zewnętrzni agenci (Claude, ChatGPT, Gemini) i przechodzi przez ten sam kod
 * po stronie serwera, więc nie może więcej niż oni: nie usuwa i nie układa planu.
 *
 * Otwiera go zdarzenie `rm:agent` (przycisk w nagłówku), tak jak pomoc `rm:pomoc`.
 */

interface Akcja { narzedzie: string; zapis: boolean; ok: boolean; opis: string; tablica_id?: string }
interface Wpis { rola: 'user' | 'assistant'; tekst: string; akcje?: Akcja[]; blad?: boolean }

const KLUCZ = 'rm_agent_rozmowa';
const UUID_W_ADRESIE = /\/plany\/([0-9a-f]{8}-[0-9a-f-]{27})/i;

function wczytaj(): { wpisy: Wpis[]; tablica: string | null } {
  try {
    const z = JSON.parse(sessionStorage.getItem(KLUCZ) || 'null');
    if (z && Array.isArray(z.wpisy)) return { wpisy: z.wpisy.slice(-30), tablica: typeof z.tablica === 'string' ? z.tablica : null };
  } catch { /* brak pamięci przeglądarki */ }
  return { wpisy: [], tablica: null };
}

/** Bezpieczny mini-format odpowiedzi: listy, pogrubienie i linki — bez wstrzykiwania HTML. */
function Tekst({ t }: { t: string }) {
  const wiersz = (s: string, k: number): ReactNode => {
    const czesci = s.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).filter(Boolean);
    return czesci.map((c, i) => {
      if (c.startsWith('**')) return <strong key={`${k}-${i}`}>{c.slice(2, -2)}</strong>;
      if (/^https?:\/\//.test(c)) {
        const wlasny = c.startsWith(window.location.origin);
        return (
          <a key={`${k}-${i}`} href={c} {...(wlasny ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            className="underline underline-offset-2 break-all">
            {wlasny ? 'Otwórz tablicę' : c}
          </a>
        );
      }
      return c;
    });
  };
  const bloki: ReactNode[] = [];
  let lista: string[] = [];
  const zamknijListe = () => {
    if (lista.length) {
      bloki.push(<ul key={`l${bloki.length}`} className="list-disc pl-5 space-y-1 my-1.5">
        {lista.map((p, i) => <li key={i}>{wiersz(p, i)}</li>)}</ul>);
      lista = [];
    }
  };
  t.split('\n').forEach((linia, i) => {
    const punkt = linia.match(/^\s*[*-]\s+(.*)$/);
    if (punkt) { lista.push(punkt[1]); return; }
    zamknijListe();
    if (linia.trim()) bloki.push(<p key={`p${i}`} className="[&:not(:first-child)]:mt-1.5">{wiersz(linia, i)}</p>);
  });
  zamknijListe();
  return <>{bloki}</>;
}

export default function RozmowaZAgentem() {
  const [otwarte, setOtwarte] = useState(false);
  const [wpisy, setWpisy] = useState<Wpis[]>(() => wczytaj().wpisy);
  const [tablica, setTablica] = useState<string | null>(() => wczytaj().tablica);
  const [nazwaTablicy, setNazwaTablicy] = useState<string | null>(null);
  const [tekst, setTekst] = useState('');
  const [czeka, setCzeka] = useState(false);
  const koniec = useRef<HTMLDivElement>(null);
  const pole = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const lokalizacja = useLocation();

  // Aktywna tablica: ta z adresu, potem ta z rozmowy, na końcu ostatnio otwarta.
  const zAdresu = useMemo(() => {
    const m = lokalizacja.pathname.match(UUID_W_ADRESIE);
    return m?.[1] ?? new URLSearchParams(lokalizacja.search).get('wyjazd');
  }, [lokalizacja.pathname, lokalizacja.search]);

  useEffect(() => {
    const otworz = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate('/auth'); return; }
      setOtwarte(true);
    };
    window.addEventListener('rm:agent', otworz);
    return () => window.removeEventListener('rm:agent', otworz);
  }, [navigate]);

  useEffect(() => {
    if (!otwarte) return;
    let ostatnia: string | null = null;
    try { ostatnia = localStorage.getItem('rm_ostatnia_tablica'); } catch { /* bez pamięci */ }
    if (zAdresu) setTablica(zAdresu);
    else if (!tablica && ostatnia) setTablica(ostatnia);
  }, [otwarte, zAdresu]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!otwarte || !tablica) { setNazwaTablicy(null); return; }
    supabase.from('trip_projects').select('name').eq('id', tablica).maybeSingle()
      .then(({ data }) => setNazwaTablicy(data?.name ?? null));
  }, [otwarte, tablica]);

  useEffect(() => {
    try { sessionStorage.setItem(KLUCZ, JSON.stringify({ wpisy: wpisy.slice(-30), tablica })); } catch { /* bez pamięci */ }
    koniec.current?.scrollIntoView({ block: 'end' });
  }, [wpisy, tablica, czeka]);

  const wyslij = useCallback(async (tresc: string) => {
    const t = tresc.trim();
    if (!t || czeka) return;
    const nowe: Wpis[] = [...wpisy, { rola: 'user', tekst: t }];
    setWpisy(nowe);
    setTekst('');
    setCzeka(true);
    try {
      const odp = await apiPost<{ odpowiedz: string; akcje: Akcja[]; tablica_id: string | null }>('/agent/rozmowa', {
        messages: nowe.filter((w) => !w.blad).slice(-20).map((w) => ({ role: w.rola, content: w.tekst })),
        tablica_id: tablica,
      }, { timeoutMs: 60_000 });
      setWpisy([...nowe, { rola: 'assistant', tekst: odp.odpowiedz, akcje: odp.akcje }]);
      if (odp.tablica_id) setTablica(odp.tablica_id);
    } catch (e) {
      setWpisy([...nowe, { rola: 'assistant', blad: true, tekst: e instanceof ApiError ? e.message : 'Nie udało się połączyć z agentem.' }]);
    } finally {
      setCzeka(false);
      pole.current?.focus();
    }
  }, [wpisy, czeka, tablica]);

  const nowaRozmowa = () => { setWpisy([]); setTablica(zAdresu); };
  const podpowiedzi = tablica
    ? ['Co jeszcze warto zobaczyć?', 'Dodaj dwa najważniejsze miejsca jako „być może”', 'Gdzie warto zjeść?']
    : ['Weekend we dwoje w Krakowie', 'Jadę do Lizbony na 3 dni', 'Trzy dni w Rzymie z dziećmi'];

  return (
    <Dialog.Root open={otwarte} onOpenChange={setOtwarte}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[2400] bg-foreground/30" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => { e.preventDefault(); pole.current?.focus(); }}
          className="fixed z-[2500] inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] bg-background
                     sm:rounded-l-[28px] shadow-token-lg flex flex-col outline-none">
          <header className="flex items-center gap-3 px-5 pt-5 pb-3">
            <span aria-hidden className="w-9 h-9 shrink-0 rounded-full bg-agent-strong text-white font-display font-bold
                                         flex items-center justify-center text-[15px]">A</span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-[18px] leading-tight">Agent RouteMarket</Dialog.Title>
              <p className="text-[12.5px] text-muted-foreground truncate">
                {nazwaTablicy ? `Tablica: ${nazwaTablicy}` : 'Bez wybranej tablicy — zapytaj, dokąd jedziesz'}
              </p>
            </div>
            {wpisy.length > 0 && (
              <button onClick={nowaRozmowa} title="Nowa rozmowa" aria-label="Nowa rozmowa"
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <Dialog.Close aria-label="Zamknij"
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4" aria-live="polite">
            {wpisy.length === 0 && (
              <div className="space-y-4 pt-2">
                <AgentDymek>
                  Powiedz, dokąd jedziesz, a założę tablicę, znajdę miejsca i dodam te, które wybierzesz.
                  Planu dni nie układam — to robi się przyciskiem „Ułóż plan”, kiedy tablica jest gotowa.
                </AgentDymek>
                <div className="flex flex-col items-start gap-2 pl-[42px]">
                  {podpowiedzi.map((p) => (
                    <button key={p} onClick={() => wyslij(p)}
                      className="rounded-full bg-card px-4 py-2 text-[14px] text-left shadow-token-sm hover:shadow-token-md
                                 transition-shadow min-h-10">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wpisy.map((w, i) => w.rola === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] bg-foreground text-background rounded-[18px_4px_18px_18px] px-4 py-2.5
                              text-[14.5px] leading-[1.45] text-pretty whitespace-pre-wrap break-words">{w.tekst}</p>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {w.blad ? (
                  <p className="pl-[42px] text-[13.5px] text-destructive">{w.tekst}</p>
                ) : (
                  <AgentDymek><Tekst t={w.tekst} /></AgentDymek>
                )}
                <Zmiany akcje={w.akcje} tablica={tablica} zAdresu={zAdresu}
                  otworz={(id) => { setOtwarte(false); navigate(`/plany/${id}`); }} />
              </div>
            ))}

            {czeka && (
              <AgentDymek>
                <span className="inline-flex items-center gap-2 text-agent-foreground/80">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sprawdzam w katalogu…
                </span>
              </AgentDymek>
            )}
            <div ref={koniec} />
          </div>

          <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
            <form onSubmit={(e) => { e.preventDefault(); wyslij(tekst); }}
              className="flex items-end gap-2 rounded-[22px] bg-card shadow-token-sm pl-4 pr-2 py-2">
              <textarea ref={pole} value={tekst} rows={1} maxLength={2000} disabled={czeka}
                aria-label="Wiadomość do agenta" placeholder="Napisz do agenta…"
                onChange={(e) => { setTekst(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wyslij(tekst); } }}
                className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-[1.4] py-2 max-h-[120px]
                           placeholder:text-muted-foreground disabled:opacity-60" />
              <button type="submit" disabled={czeka || !tekst.trim()} aria-label="Wyślij"
                className="w-11 h-11 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center
                           disabled:opacity-30 transition-opacity">
                <ArrowUp className="w-5 h-5" />
              </button>
            </form>
            <button onClick={() => { setOtwarte(false); navigate('/polaczenia'); }}
              className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mx-auto min-h-8">
              <Plug className="w-3.5 h-3.5" /> Wolisz rozmawiać w Claude, ChatGPT albo Gemini? Połącz je z RouteMarket
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Co agent faktycznie zmienił — widać to pod jego odpowiedzią, nie tylko w jego słowach. */
function Zmiany({ akcje, tablica, zAdresu, otworz }: {
  akcje?: Akcja[]; tablica: string | null; zAdresu: string | null; otworz: (id: string) => void;
}) {
  const zapisy = (akcje ?? []).filter((a) => a.zapis);
  const nieudane = (akcje ?? []).filter((a) => !a.ok);
  if (!zapisy.length && !nieudane.length) return null;
  const udane = zapisy.filter((a) => a.ok);
  const id = udane.find((a) => a.tablica_id)?.tablica_id ?? tablica;
  return (
    <div className="pl-[42px] space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {udane.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12.5px] shadow-token-sm">
            <Check className="w-3.5 h-3.5 shrink-0" /> {a.opis}
          </span>
        ))}
        {nieudane.map((a, i) => (
          <span key={`n${i}`} className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[12.5px] text-muted-foreground">
            Nie udało się: {a.opis}
          </span>
        ))}
      </div>
      {udane.length > 0 && id && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => otworz(id)}
            className="rounded-full bg-foreground text-background px-4 min-h-9 text-[13px] font-semibold">
            Otwórz tablicę
          </button>
          {zAdresu === id && (
            <button onClick={() => window.location.reload()}
              className="rounded-full bg-card px-4 min-h-9 text-[13px] font-semibold shadow-token-sm">
              Odśwież widok
            </button>
          )}
        </div>
      )}
    </div>
  );
}
