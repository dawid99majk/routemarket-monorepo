import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
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
  /** Dociągnięte osobnym zapytaniem po id tablicy -- sam trip_projects tego nie ma. */
  liczba_miejsc?: number;
  miniatura?: string | null;
}

interface PrzelacznikWyjazduProps {
  aktywny: WyjazdDoPrzelaczenia;
  wszystkie: WyjazdDoPrzelaczenia[];
  onZmien: (id: string) => void;
  onNowy: () => void;
  wariant?: 'pelny' | 'kompaktowy';
}

const KLUCZ_PODPOWIEDZI = 'rm_widzial_przelacznik_wyjazdow';

export default function PrzelacznikWyjazdu({ aktywny, wszystkie, onZmien, onNowy, wariant = 'kompaktowy' }: PrzelacznikWyjazduProps) {
  const { t } = useTranslation();
  const [otwarty, setOtwarty] = useState(false);
  const [podpowiedz, setPodpowiedz] = useState(false);
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

  const meta = [
    aktywny.destination,
    aktywny.days ? t('odkrywaj.dni', { count: aktywny.days }) : null,
    zakresDat(aktywny.start_date, aktywny.end_date) || null,
    aktywny.liczba_miejsc != null ? t('odkrywaj.miejsc_na_tablicy', { count: aktywny.liczba_miejsc }) : null,
  ].filter(Boolean).join(' · ');

  const popoverZawartosc = (
    <PopoverContent align={wariant === 'kompaktowy' ? 'start' : 'end'} className="w-80 p-0 max-h-[70vh] overflow-y-auto z-[2600]">
      <p className="font-narrow uppercase tracking-[0.24em] text-[10px] text-muted-foreground px-3.5 pt-3 pb-1.5">
        {t('odkrywaj.twoje_wyjazdy')}
      </p>
      {wszystkie.map((w) => (
        <button
          key={w.id}
          onClick={() => { onZmien(w.id); setOtwarty(false); }}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
            w.id === aktywny.id ? 'bg-muted' : 'hover:bg-muted/60'
          }`}
        >
          <div className="w-11 h-11 rounded-sm overflow-hidden bg-muted shrink-0">
            {w.miniatura && <Zdjecie src={w.miniatura} gdzie={120} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium truncate">{w.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground truncate">
              {[w.destination, w.liczba_miejsc != null ? t('odkrywaj.miejsc_na_tablicy', { count: w.liczba_miejsc }) : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </button>
      ))}
      <button
        onClick={() => { onNowy(); setOtwarty(false); }}
        className="w-full flex items-center gap-2 px-3.5 py-3 text-[13px] text-muted-foreground
                   hover:text-foreground border-t border-border transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> {t('odkrywaj.nowy_wyjazd_lista')}
      </button>
    </PopoverContent>
  );

  if (wariant === 'kompaktowy') {
    return (
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-narrow uppercase tracking-[0.24em] text-[10px] text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-full border border-border/60 shrink-0">
          Wyjazd
        </span>
        <h1 className="font-display font-light text-2xl sm:text-3xl tracking-[-0.01em] min-w-0 truncate">
          {aktywny.name}
        </h1>

        <Popover open={otwarty} onOpenChange={(o) => { setOtwarty(o); if (o) zamknijPodpowiedz(); }}>
          <PopoverTrigger asChild>
            <button
              className="relative shrink-0 inline-flex items-center gap-1.5 h-7 rounded-full border border-border/80
                         bg-card px-2.5 text-[12px] hover:border-foreground/40 transition-colors shadow-2xs"
            >
              <span>{t('odkrywaj.zmien_wyjazd')}</span>
              <span className="text-muted-foreground text-[10px]">▾</span>
            </button>
          </PopoverTrigger>
          {popoverZawartosc}
        </Popover>

        {meta && (
          <span className="font-mono text-xs text-muted-foreground hidden lg:inline ml-1">
            · {meta}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-5 py-4">
      <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
        {t('odkrywaj.pracujesz_nad_wyjazdem')}
      </p>

      <div className="flex flex-wrap items-baseline justify-between gap-3 mt-2">
        <h1 className="font-display font-light text-[40px] leading-[1.1] tracking-[-0.02em] min-w-0 truncate">
          {aktywny.name}
        </h1>

        <Popover open={otwarty} onOpenChange={(o) => { setOtwarty(o); if (o) zamknijPodpowiedz(); }}>
          <PopoverTrigger asChild>
            <button
              className="relative shrink-0 inline-flex items-center gap-1.5 h-9 rounded-full border border-border
                         bg-background px-3.5 text-[13px] hover:border-foreground/40 transition-colors"
            >
              {t('odkrywaj.zmien_wyjazd')}
              <span className="text-muted-foreground">▾</span>
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
