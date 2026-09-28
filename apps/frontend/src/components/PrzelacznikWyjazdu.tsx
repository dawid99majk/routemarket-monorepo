import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Check, ChevronDown, Compass, MapPin, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Zdjecie from '@/components/Zdjecie';
import { zakresDat } from '@/lib/daty';

export interface WyjazdDoPrzelaczenia {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  start_date?: string | null;
  end_date?: string | null;
  trip_type?: string | null;
  /** Dociągnięte osobnym zapytaniem po id tablicy -- sam trip_projects tego nie ma. */
  liczba_miejsc?: number;
  miniatura?: string | null;
}

interface PrzelacznikWyjazduProps {
  aktywny?: WyjazdDoPrzelaczenia | null;
  wszystkie: WyjazdDoPrzelaczenia[];
  onZmien: (id: string | null) => void;
  onNowy: () => void;
  wariant?: 'pelny' | 'kompaktowy';
}

const KLUCZ_PODPOWIEDZI = 'rm_widzial_przelacznik_wyjazdow';

export default function PrzelacznikWyjazdu({ aktywny, wszystkie, onZmien, onNowy, wariant = 'kompaktowy' }: PrzelacznikWyjazduProps) {
  const { t } = useTranslation();
  const [otwarty, setOtwarty] = useState(false);
  const [podpowiedz, setPodpowiedz] = useState(false);
  const [szukajFraza, setSzukajFraza] = useState('');
  const zamknietaRecznie = useRef(false);

  useEffect(() => {
    if (wszystkie.length < 2 || zamknietaRecznie.current) return;
    let widziane = false;
    try { widziane = localStorage.getItem(KLUCZ_PODPOWIEDZI) === '1'; } catch { /* tryb prywatny */ }
    if (!widziane) setPodpowiedz(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wszystkie.length >= 2]);

  const zamknijPodpowiedz = () => {
    setPodpowiedz(false);
    zamknietaRecznie.current = true;
    try { localStorage.setItem(KLUCZ_PODPOWIEDZI, '1'); } catch { /* tryb prywatny */ }
  };

  const meta = aktywny ? [
    aktywny.destination,
    aktywny.days ? t('odkrywaj.dni', { count: aktywny.days }) : null,
    zakresDat(aktywny.start_date, aktywny.end_date) || null,
    aktywny.liczba_miejsc != null ? t('odkrywaj.miejsc_na_tablicy', { count: aktywny.liczba_miejsc }) : null,
  ].filter(Boolean).join(' · ') : null;

  const przefiltrowane = useMemo(() => {
    const q = szukajFraza.trim().toLowerCase();
    if (!q) return wszystkie;
    return wszystkie.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      (w.destination ?? '').toLowerCase().includes(q)
    );
  }, [wszystkie, szukajFraza]);

  const popoverZawartosc = (
    <PopoverContent
      align={wariant === 'kompaktowy' ? 'start' : 'end'}
      className="w-88 sm:w-96 p-0 max-h-[80vh] overflow-hidden rounded-2xl border border-border/90 bg-card shadow-2xl z-[2600] flex flex-col"
    >
      {/* Nagłówek popovera */}
      <div className="px-4 py-3 border-b border-border/70 bg-muted/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-display font-medium text-sm text-foreground">
              {t('odkrywaj.twoje_wyjazdy')}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
              {wszystkie.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { onNowy(); setOtwarty(false); }}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nowy</span>
          </button>
        </div>

        {/* Wyszukiwarka wyjazdów (jeśli jest więcej niż 3) */}
        {wszystkie.length >= 4 && (
          <div className="relative mt-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={szukajFraza}
              onChange={(e) => setSzukajFraza(e.target.value)}
              placeholder="Szukaj wyjazdu lub miasta…"
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        )}
      </div>

      {/* Lista wyjazdów */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-1.5 max-h-[360px]">
        {przefiltrowane.map((w) => {
          const jestAktywny = w.id === aktywny?.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => { onZmien(w.id); setOtwarty(false); }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                jestAktywny
                  ? 'bg-muted/80 ring-1 ring-border/80'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted/70 shrink-0 border border-border/60 flex items-center justify-center">
                  {w.miniatura ? (
                    <Zdjecie src={w.miniatura} gdzie={120} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MapPin className="w-5 h-5 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-[13.5px] truncate ${jestAktywny ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}>
                    {w.name}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                    {[
                      w.destination,
                      w.days ? t('odkrywaj.dni', { count: w.days }) : null,
                      w.liczba_miejsc != null ? t('odkrywaj.miejsc_na_tablicy', { count: w.liczba_miejsc }) : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              {jestAktywny && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0 border border-emerald-500/25">
                  <Check className="w-3 h-3" />
                  <span>Aktywny</span>
                </span>
              )}
            </button>
          );
        })}

        {przefiltrowane.length === 0 && (
          <p className="text-center py-6 text-xs text-muted-foreground">
            Brak wyjazdów pasujących do frazy „{szukajFraza}”
          </p>
        )}
      </div>

      {/* Dolny pasek akcji */}
      <div className="p-2 border-t border-border/70 bg-muted/20 shrink-0 flex flex-col gap-1 text-xs">
        {aktywny && (
          <button
            type="button"
            onClick={() => { onZmien(null); setOtwarty(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer text-left"
          >
            <Compass className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Przeglądaj ogólnie (bez wyjazdu)</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => { onNowy(); setOtwarty(false); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer text-left font-medium"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{t('odkrywaj.nowy_wyjazd_lista')}</span>
        </button>
      </div>
    </PopoverContent>
  );

  const formatujTytul = (txt: string) => {
    if (txt.includes(',')) {
      const idx = txt.indexOf(',');
      return (
        <>
          <span>{txt.slice(0, idx + 1)} </span>
          <em className="italic font-normal">{txt.slice(idx + 1).trim()}</em>
        </>
      );
    }
    return txt;
  };

  if (wariant === 'kompaktowy') {
    return (
      <div className="flex flex-col gap-1.5 select-none">
        {/* Górny pasek kontekstu */}
        <div className="flex items-center gap-2">
          <span className="font-narrow uppercase tracking-[0.22em] text-[10px] font-semibold text-muted-foreground bg-card px-2.5 py-0.5 rounded-full border border-border/80 shadow-2xs shrink-0">
            {aktywny ? 'Aktywny wyjazd' : 'Eksploracja ogólna'}
          </span>
          {meta && (
            <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
              · {meta}
            </span>
          )}
        </div>

        {/* Wiersz z tytułem i wyrazistym przyciskiem zmiany */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
          <h1 className="font-display font-light text-2xl sm:text-3xl tracking-[-0.01em] text-foreground min-w-0">
            {aktywny ? formatujTytul(aktywny.name) : 'Odkrywaj miejsca'}
          </h1>

          <Popover open={otwarty} onOpenChange={(o) => { setOtwarty(o); if (o) zamknijPodpowiedz(); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="group relative shrink-0 inline-flex items-center gap-2 h-8 sm:h-8.5 rounded-full border border-border/90
                           bg-card px-3.5 text-xs sm:text-[12.5px] font-medium text-foreground hover:border-foreground/40 hover:bg-muted/60
                           transition-all shadow-2xs hover:shadow-xs cursor-pointer select-none"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span>{aktywny ? t('odkrywaj.zmien_wyjazd') : 'Wybierz wyjazd'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 ${otwarty ? 'rotate-180' : ''}`} />
              </button>
            </PopoverTrigger>
            {popoverZawartosc}
          </Popover>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card shadow-token-md p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-narrow uppercase tracking-[0.24em] text-[10px] font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/60">
          {t('odkrywaj.pracujesz_nad_wyjazdem')}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display font-light text-3xl sm:text-[38px] leading-[1.1] tracking-[-0.02em] min-w-0 truncate">
          {aktywny?.name ?? 'Odkrywaj miejsca'}
        </h1>

        <Popover open={otwarty} onOpenChange={(o) => { setOtwarty(o); if (o) zamknijPodpowiedz(); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative shrink-0 inline-flex items-center gap-2 h-9 rounded-full border border-border/90
                         bg-background px-4 text-[13px] font-medium text-foreground hover:border-foreground/50 transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('odkrywaj.zmien_wyjazd')}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${otwarty ? 'rotate-180' : ''}`} />
            </button>
          </PopoverTrigger>
          {popoverZawartosc}
        </Popover>
      </div>

      {meta && (
        <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-2">
          {meta}
        </p>
      )}
    </div>
  );
}
