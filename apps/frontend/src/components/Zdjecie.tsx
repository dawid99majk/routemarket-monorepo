import { miniatura, SZEROKOSC } from '@/lib/zdjecia';

type Miejsce = keyof typeof SZEROKOSC | number;

interface ZdjecieProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Adres z bazy — oryginał albo miniatura, obojętne. Puste nie renderuje nic. */
  src?: string | null;
  /** Gdzie to zdjęcie stoi. Nazwa z `SZEROKOSC` albo szerokość w pikselach. */
  gdzie?: Miejsce;
}

/**
 * Zdjęcie miejsca, którego nie da się użyć źle.
 *
 * `miniatura()` istnieje od dawna i jest dobrze napisana, ale trzeba było o niej
 * PAMIĘTAĆ przy każdym `<img>`. Dwa razy ktoś nie pamiętał: raz przy pierwszym
 * pisaniu galerii (146 MB na wejście), raz przy przepisywaniu `Tablice.tsx`
 * w redesignie, gdy własny znacznik zastąpił wspólny kafelek i zgubił wywołanie
 * (40 MB). Za trzecim razem lepiej odebrać możliwość pomyłki, niż liczyć na pamięć.
 *
 * Komponent sam dobiera szerokość do miejsca wyświetlenia, więc wywołujący podaje
 * `gdzie`, a nie adres. `loading="lazy"` jest domyślne — zdjęcie miejsca nigdy nie
 * jest tym, na co czeka pierwsze malowanie strony.
 */
export default function Zdjecie({ src, gdzie = 'kafelek', alt = '', ...reszta }: ZdjecieProps) {
  if (!src) return null;
  const szerokosc = typeof gdzie === 'number' ? gdzie : SZEROKOSC[gdzie];
  return <img src={miniatura(src, szerokosc)} alt={alt} loading="lazy" {...reszta} />;
}
