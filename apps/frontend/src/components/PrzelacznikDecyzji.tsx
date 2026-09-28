export type Kubelek = 'must' | 'nice' | 'rejected';

const WYSOKOSC = { sm: 'h-9 text-[13px]', md: 'h-10 text-[13.5px]', lg: 'h-11 text-[15px]' } as const;
const KOLKO = { sm: 'w-8 h-9', md: 'w-9 h-10', lg: 'w-11 h-11' } as const;

/**
 * Decyzja o miejscu — jedna pigułka w Odkrywaj, na tablicy i w oknie miejsca.
 *
 * Kolejność stoi w miejscu („Na pewno”, „Być może”, ×), więc nic nie zamienia
 * się pod kursorem. Aktywny kubełek jest klikalny: drugi klik zdejmuje decyzję
 * (tam, gdzie ekran to obsługuje). Stan niesie i kolor, i `aria-pressed`,
 * więc da się go odczytać bez rozróżniania barw.
 */
export default function PrzelacznikDecyzji({
  stan, onDecyzja, rozmiar = 'md', zOdrzuceniem = true, className = '',
}: {
  stan?: Kubelek | string | null;
  onDecyzja: (k: Kubelek) => void;
  rozmiar?: 'sm' | 'md' | 'lg';
  zOdrzuceniem?: boolean;
  className?: string;
}) {
  const klik = (k: Kubelek) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); onDecyzja(k); };
  const przycisk = `flex-1 min-w-0 whitespace-nowrap rounded-full px-2 transition-colors ${WYSOKOSC[rozmiar]}`;
  return (
    <div className={`flex items-center rounded-full bg-secondary p-1 ${className}`}>
      <button type="button" onClick={klik('must')} aria-pressed={stan === 'must'}
        className={`${przycisk} ${stan === 'must'
          ? 'bg-primary text-primary-foreground font-bold'
          : 'text-foreground font-semibold hover:bg-card'}`}>
        Na pewno
      </button>
      <button type="button" onClick={klik('nice')} aria-pressed={stan === 'nice'}
        className={`${przycisk} ${stan === 'nice'
          ? 'bg-accent text-accent-foreground font-bold'
          : 'text-foreground font-semibold hover:bg-card'}`}>
        Być może
      </button>
      {zOdrzuceniem && (
        <button type="button" onClick={klik('rejected')} aria-pressed={stan === 'rejected'}
          aria-label="Nie tym razem" title="Nie tym razem"
          className={`${KOLKO[rozmiar]} shrink-0 rounded-full text-[18px] leading-none transition-colors ${
            stan === 'rejected'
              ? 'bg-clay text-foreground'
              : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
          ×
        </button>
      )}
    </div>
  );
}
