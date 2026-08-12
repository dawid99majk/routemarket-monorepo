import { useEffect, useState } from 'react';

interface SzukanieMiejscProps {
  miasto: string;
  /** Sekundy od startu — licznik jest prawdziwy, w przeciwieństwie do pasków postępu. */
  sekundy: number;
}

/**
 * Czego szukamy. To nie są wymyślone nazwy miejsc, tylko kategorie, o które
 * naprawdę pytamy OpenStreetMap — dlatego wolno je pokazać, zanim cokolwiek wróci.
 */
const CZEGO_SZUKAMY = [
  'zabytków i starówek',
  'muzeów i galerii',
  'parków i punktów widokowych',
  'kościołów i klasztorów',
  'placów zabaw i miejsc dla dzieci',
  'kawiarni i miejsc na przerwę',
  'godzin otwarcia',
  'zdjęć z Wikimedia Commons',
];

/** Wysokości kafelków powtarzają rytm prawdziwego feedu mozaikowego. */
const WYSOKOSCI = [172, 224, 196, 248, 184, 212, 236, 168];

export default function SzukanieMiejsc({ miasto, sekundy }: SzukanieMiejscProps) {
  const [krok, setKrok] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setKrok((n) => (n + 1) % CZEGO_SZUKAMY.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="py-10">
      <div className="text-center max-w-lg mx-auto">
        <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
          Zbieram miejsca
        </p>
        <h2 className="font-display font-light text-[30px] leading-tight mt-2.5">{miasto}</h2>

        {/* Jedna linijka, która się zmienia. Wysokość ustalona, żeby tekst nie
            przesuwał kafelków przy każdej zmianie. */}
        <div className="h-6 mt-3 relative overflow-hidden">
          {CZEGO_SZUKAMY.map((tekst, i) => (
            <p
              key={tekst}
              className={`absolute inset-x-0 text-[15px] text-muted-foreground transition-all duration-500 ${
                i === krok ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              Szukam {tekst}…
            </p>
          ))}
        </div>

        <p className="font-mono text-[12px] tabular-nums text-muted-foreground mt-3">
          {sekundy} s · zwykle 10–40 s
        </p>
      </div>

      {/* Kafelki w układzie docelowego feedu, z przesuwającym się rozjaśnieniem.
          Każdy startuje z własnym opóźnieniem, więc fala idzie przez siatkę
          zamiast pulsować wszystkim naraz. */}
      <div className="mt-10 [column-gap:20px] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
        {WYSOKOSCI.map((h, i) => (
          <div key={i} className="mb-5 break-inside-avoid rounded-md border border-border bg-card overflow-hidden">
            <div className="rm-shimmer bg-muted" style={{ height: h, animationDelay: `${i * 160}ms` }} />
            <div className="p-3.5 space-y-2">
              <div className="rm-shimmer h-3.5 rounded bg-muted" style={{ animationDelay: `${i * 160 + 80}ms` }} />
              <div className="rm-shimmer h-3 rounded bg-muted w-3/5" style={{ animationDelay: `${i * 160 + 160}ms` }} />
              <div className="flex gap-1.5 pt-1.5">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="rm-shimmer h-6 flex-1 rounded-full bg-muted"
                    style={{ animationDelay: `${i * 160 + 240 + k * 60}ms` }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
