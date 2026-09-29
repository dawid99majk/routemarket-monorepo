import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Plug } from 'lucide-react';
import { toast } from 'sonner';
import PlannerHeader from '@/components/PlannerHeader';
import SEO from '@/components/SEO';
import AgentDymek from '@/components/AgentDymek';
import { Button } from '@/components/ui/button';
import { ApiError, apiDelete, apiGet, apiPost } from '@/lib/api';
import { inicjalyUzytkownika } from '@/lib/uzytkownik';

/**
 * Połączenia z agentami AI. RouteMarket jest tu serwerem, a agent (Claude, ChatGPT,
 * Gemini) — klientem: nie da się „wepchnąć” usługi do cudzego konta, więc klik
 * „Połącz” tworzy osobiste połączenie i prowadzi do ustawień agenta, gdzie
 * wystarczy wkleić adres. Docelowo, po wpisie w katalogach agentów, będzie to
 * zwykłe „Połącz” z logowaniem (OAuth).
 */

type AgentId = 'claude' | 'chatgpt' | 'gemini';

interface Polaczenie {
  id: string; agent: AgentId | 'inny'; nazwa: string;
  utworzone: string; ostatnio_uzyte: string | null; uniewaznione: string | null;
}
interface Swiezo { agent: AgentId; id: string; url: string }

const AGENCI: Record<AgentId, { nazwa: string; opis: string; ustawienia: string; etykietaUstawien: string; kroki: string[] }> = {
  claude: {
    nazwa: 'Claude',
    opis: 'Własny konektor w ustawieniach Claude. Zwykle wymaga płatnego planu.',
    ustawienia: 'https://claude.ai/settings/connectors',
    etykietaUstawien: 'Otwórz ustawienia konektorów Claude',
    kroki: [
      'Otwórz ustawienia konektorów w Claude.',
      'Wybierz „Dodaj własny konektor”, nazwij go RouteMarket i wklej adres z pola powyżej.',
      'Napisz w rozmowie np. „Jadę do Lizbony na 3 dni, dodaj Belém na pewno”.',
    ],
  },
  chatgpt: {
    nazwa: 'ChatGPT',
    opis: 'Aplikacja MCP w trybie dewelopera. Dostępne w płatnych planach.',
    ustawienia: 'https://chatgpt.com/',
    etykietaUstawien: 'Otwórz ChatGPT',
    kroki: [
      'W ustawieniach ChatGPT włącz tryb dewelopera (Aplikacje i konektory → Zaawansowane).',
      'Utwórz nową aplikację MCP, wklej adres z pola powyżej, uwierzytelnianie: brak.',
      'W rozmowie włącz aplikację RouteMarket i poproś o tablicę wyjazdu.',
    ],
  },
  gemini: {
    nazwa: 'Gemini',
    opis: 'Własna aplikacja w Gemini (Spark). Obsługa MCP jest wdrażana stopniowo.',
    ustawienia: 'https://gemini.google.com/apps',
    etykietaUstawien: 'Otwórz aplikacje Gemini',
    kroki: [
      'Otwórz gemini.google.com/apps.',
      'Na dole wklej adres z pola powyżej w polu własnej aplikacji.',
      'Poproś Gemini o założenie tablicy i dodanie miejsc.',
    ],
  },
};

const data = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const kiedy = (iso: string | null) => {
  if (!iso) return 'jeszcze nie używane';
  const d = new Date(iso);
  const dzis = new Date().toDateString() === d.toDateString();
  return dzis ? `dziś ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : data(iso);
};

export default function Polaczenia() {
  const [lista, setLista] = useState<Polaczenie[] | null>(null);
  const [laczeDla, setLaczeDla] = useState<AgentId | null>(null);
  const [swiezo, setSwiezo] = useState<Swiezo | null>(null);
  const [skopiowano, setSkopiowano] = useState(false);
  const [odlaczam, setOdlaczam] = useState<string | null>(null);
  const [inicjaly, setInicjaly] = useState<string | null>(null);

  const odswiez = useCallback(async () => {
    try {
      const r = await apiGet<{ polaczenia: Polaczenie[] }>('/polaczenia');
      setLista(r.polaczenia.filter((p) => !p.uniewaznione));
    } catch (e) {
      setLista([]);
      toast.error(e instanceof ApiError ? e.message : 'Nie udało się wczytać połączeń.');
    }
  }, []);

  useEffect(() => { void odswiez(); inicjalyUzytkownika().then(setInicjaly).catch(() => {}); }, [odswiez]);

  const polacz = async (agent: AgentId) => {
    setLaczeDla(agent);
    try {
      const r = await apiPost<{ id: string; url: string }>('/polaczenia', { agent, nazwa: AGENCI[agent].nazwa });
      setSwiezo({ agent, id: r.id, url: r.url });
      setSkopiowano(false);
      await odswiez();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Nie udało się utworzyć połączenia.');
    } finally {
      setLaczeDla(null);
    }
  };

  const kopiuj = async () => {
    if (!swiezo) return;
    try {
      await navigator.clipboard.writeText(swiezo.url);
      setSkopiowano(true);
    } catch {
      toast.error('Nie udało się skopiować — zaznacz adres i skopiuj ręcznie.');
    }
  };

  const odlacz = async (id: string) => {
    try {
      await apiDelete(`/polaczenia/${id}`);
      if (swiezo?.id === id) setSwiezo(null);
      setOdlaczam(null);
      await odswiez();
      toast.success('Agent odłączony. Jego adres przestał działać.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Nie udało się odłączyć.');
    }
  };

  const wybrany = swiezo ? AGENCI[swiezo.agent] : null;

  return (
    <div className="min-h-screen bg-background pb-[calc(var(--dolny-pasek,0px)+24px)]">
      <SEO title="Połącz agenta AI" url="/polaczenia" />
      <PlannerHeader initials={inicjaly} />
      <main className="max-w-[880px] mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-10">
        <section>
          <h1 className="font-display text-[32px] sm:text-[40px] leading-[1.05]">Połącz agenta AI</h1>
          <p className="mt-3 text-[16px] leading-[1.55] text-foreground/85 max-w-[60ch] text-pretty">
            Rozmawiaj z Claude, ChatGPT albo Gemini, a tablice, miejsca i terminy zapisują się tutaj — w Twoim koncie,
            tak jak gdybyś dodawał je sam.
          </p>
          <AgentDymek className="mt-5 max-w-[560px]">
            Nie korzystasz z żadnego z nich? Nic nie musisz łączyć: mam własne okno rozmowy w aplikacji.{' '}
            <button onClick={() => window.dispatchEvent(new Event('rm:agent'))}
              className="underline underline-offset-2 font-semibold">Porozmawiaj ze mną</button>.
          </AgentDymek>
        </section>

        <section aria-label="Wybierz agenta" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(AGENCI) as AgentId[]).map((id) => {
            const a = AGENCI[id];
            const aktywne = lista?.filter((p) => p.agent === id).length ?? 0;
            return (
              <div key={id} className="rounded-2xl bg-card p-5 shadow-token-md flex flex-col">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <Plug className="w-5 h-5" />
                  </span>
                  <h2 className="font-display text-[20px]">{a.nazwa}</h2>
                </div>
                <p className="mt-3 text-[14px] leading-[1.5] text-muted-foreground flex-1 text-pretty">{a.opis}</p>
                {aktywne > 0 && <p className="mt-3 text-[12.5px] font-semibold">Połączone: {aktywne}</p>}
                <Button onClick={() => polacz(id)} disabled={laczeDla !== null} className="mt-4 w-full">
                  {laczeDla === id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {aktywne > 0 ? 'Dodaj kolejne połączenie' : 'Połącz'}
                </Button>
              </div>
            );
          })}
        </section>

        {swiezo && wybrany && (
          <section aria-live="polite" className="rounded-2xl bg-card p-5 sm:p-6 shadow-token-md space-y-4">
            <h2 className="font-display text-[22px]">Połączenie z {wybrany.nazwa} gotowe — dokończ w agencie</h2>
            <div>
              <label htmlFor="adres-mcp" className="text-[12.5px] font-semibold text-muted-foreground">
                Adres do wklejenia
              </label>
              <div className="mt-1.5 flex gap-2">
                <input id="adres-mcp" readOnly value={swiezo.url} onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-11 rounded-md bg-secondary px-3 text-[13px] font-mono outline-none
                             focus-visible:ring-2 focus-visible:ring-ring" />
                <Button onClick={kopiuj} variant="outline" className="h-11 shrink-0">
                  {skopiowano ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {skopiowano ? 'Skopiowano' : 'Skopiuj'}
                </Button>
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground text-pretty">
                Ten adres widzisz tylko teraz i działa jak hasło do Twoich tablic — nie wysyłaj go nikomu.
                Możesz go w każdej chwili odłączyć poniżej.
              </p>
            </div>
            <ol className="space-y-2 text-[14.5px] leading-[1.5]">
              {wybrany.kroki.map((k, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-secondary text-[12.5px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-pretty">{k}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={wybrany.ustawienia} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" /> {wybrany.etykietaUstawien}
                </a>
              </Button>
              <Button variant="ghost" onClick={() => setSwiezo(null)}>Gotowe</Button>
            </div>
            <p className="text-[12.5px] text-muted-foreground text-pretty">
              Ekrany agentów zmieniają się często. Jeśli nie widzisz opisanej opcji, szukaj „własny konektor”,
              „aplikacja MCP” albo „dodaj własną aplikację”.
            </p>
          </section>
        )}

        <section>
          <h2 className="font-display text-[24px]">Twoje połączenia</h2>
          {lista === null ? (
            <p className="mt-4 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Wczytuję…</p>
          ) : lista.length === 0 ? (
            <p className="mt-3 text-[14.5px] text-muted-foreground">Nie masz jeszcze żadnych połączeń.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {lista.map((p) => (
                <li key={p.id} className="rounded-2xl bg-card px-4 py-3 shadow-token-sm flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <p className="font-semibold text-[15px] truncate">{p.nazwa}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      Połączono {data(p.utworzone)} · Ostatnio: {kiedy(p.ostatnio_uzyte)}
                    </p>
                  </div>
                  {odlaczam === p.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-muted-foreground hidden sm:inline">Agent straci dostęp.</span>
                      <Button size="sm" variant="destructive" onClick={() => odlacz(p.id)}>Tak, odłącz</Button>
                      <Button size="sm" variant="ghost" onClick={() => setOdlaczam(null)}>Anuluj</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setOdlaczam(p.id)}>Odłącz</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card p-5 shadow-token-sm">
            <h2 className="font-display text-[18px]">Agent może</h2>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-[1.45] list-disc pl-5">
              <li>szukać miejsc w katalogu RouteMarket,</li>
              <li>zakładać tablice wyjazdów,</li>
              <li>dodawać miejsca i zmieniać decyzję: na pewno, być może, odrzucone,</li>
              <li>ustawiać termin wyjazdu i sprawdzać saldo tokenów.</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-token-sm">
            <h2 className="font-display text-[18px]">Agent nie może</h2>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-[1.45] list-disc pl-5">
              <li>usuwać tablic ani miejsc,</li>
              <li>układać planów ani wydawać tokenów — to robisz w aplikacji,</li>
              <li>widzieć cudzych tablic ani danych konta,</li>
              <li>działać po odłączeniu — adres przestaje działać od razu.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
