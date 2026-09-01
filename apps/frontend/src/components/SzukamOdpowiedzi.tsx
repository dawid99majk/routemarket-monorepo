import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

interface SzukamOdpowiedziProps {
  fraza: string;
  /** Sekundy od startu — licznik jest prawdziwy, w przeciwieństwie do pasków postępu. */
  sekundy: number;
}

/**
 * Trzy zdania, trzy prawdziwe kroki — nie wymyślona animacja.
 *
 * `/discover-places` robi dokładnie to, co tu piszemy: najpierw sprawdza znane
 * miejsca z OpenStreetMap (żeby móc podpowiedzieć modelowi dokładne nazwy),
 * potem szuka w internecie przez wyszukiwanie osadzone w Gemini, na końcu
 * odsiewa wszystko, czego nie da się potwierdzić jako istniejące miejsce —
 * prompt wprost zabrania wymyślania. Zmyślona sekwencja kroków byłaby tu
 * nie na miejscu w produkcie, który nigdzie indziej nie fabrykuje aktywności.
 */
const KROKI = [
  'Sprawdzam, co już wiemy o okolicy…',
  'Szukam w internecie odpowiedzi na Twoje pytanie…',
  'Sprawdzam, czy te miejsca naprawdę istnieją…',
];

export default function SzukamOdpowiedzi({ fraza, sekundy }: SzukamOdpowiedziProps) {
  const [krok, setKrok] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setKrok((n) => (n + 1) % KROKI.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="py-20 text-center max-w-md mx-auto">
      <Search className="w-8 h-8 text-muted-foreground/40 mx-auto animate-pulse" />

      <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground mt-4">
        Szukam dla Ciebie
      </p>
      <p className="font-display text-[20px] leading-snug mt-2 text-pretty">„{fraza}"</p>

      {/* Jedna linijka, która się zmienia. Wysokość ustalona, żeby tekst nie
          przesuwał niczego pod spodem przy każdej zmianie — ten sam zabieg,
          co w SzukanieMiejsc, dla tego samego powodu. */}
      <div className="h-6 mt-4 relative overflow-hidden">
        {KROKI.map((tekst, i) => (
          <p
            key={tekst}
            className={`absolute inset-x-0 text-[14px] text-muted-foreground transition-all duration-500 ${
              i === krok ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            {tekst}
          </p>
        ))}
      </div>

      <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-3">
        {sekundy} s · zwykle 15–40 s
      </p>
    </div>
  );
}
