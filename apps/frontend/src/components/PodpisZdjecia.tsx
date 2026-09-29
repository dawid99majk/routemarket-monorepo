import { useTranslation } from 'react-i18next';
import { plikZAdresu, stronaPliku, useLicencje, type LicencjaZdjecia } from '@/lib/licencjeZdjec';

/** Jedna linia podpisu: „Fot. autor · CC BY-SA 4.0 · Wikimedia Commons”. */
function LiniaPodpisu({ plik, wpis }: { plik: string; wpis: LicencjaZdjecia | null | undefined }) {
  const { t } = useTranslation();
  const zrodlo = wpis?.strona || stronaPliku(plik);
  return (
    <>
      {wpis && <>{t('zdjecia.fot')} {wpis.autor || t('zdjecia.autor_nieznany')}{wpis.licencja ? ' · ' : ''}</>}
      {wpis?.licencja && (wpis.licencja_url
        ? <a href={wpis.licencja_url} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2 hover:no-underline">{wpis.licencja}</a>
        : wpis.licencja)}
      {wpis && ' · '}
      <a href={zrodlo} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">
        {wpis ? 'Wikimedia Commons' : t('zdjecia.zrodlo_commons')}
      </a>
    </>
  );
}

/**
 * Podpis pod jednym dużym zdjęciem (galeria, powiększenie). Zawsze osiągalny:
 * nawet bez wpisu w bazie prowadzi do strony pliku, na której Commons pokazuje
 * autora i licencję. Zdjęcie spoza Commons nie dostaje nic — nie ma czego podpisać.
 */
export default function PodpisZdjecia({ src, className = '' }: { src: string | null | undefined; className?: string }) {
  const plik = plikZAdresu(src);
  const licencje = useLicencje([src]);
  if (!plik) return null;
  return (
    <p className={`text-[11.5px] leading-snug ${className}`}>
      <LiniaPodpisu plik={plik} wpis={licencje.get(plik)} />
    </p>
  );
}

/**
 * Lista autorów dla strony z wieloma zdjęciami (miasto, tablica), w której
 * podpis pod każdym kafelkiem zasłaniałby treść, a kafelek jest odnośnikiem
 * (link w linku jest niepoprawny). Zwinięta, ale w DOM — także dla robotów.
 */
export function AutorzyZdjec({ zdjecia, className = '' }: { zdjecia: (string | null | undefined)[]; className?: string }) {
  const { t } = useTranslation();
  const unikalne = [...new Set(zdjecia.filter(Boolean) as string[])].filter((z) => plikZAdresu(z));
  const licencje = useLicencje(unikalne);
  if (!unikalne.length) return null;
  const pliki = [...new Set(unikalne.map((z) => plikZAdresu(z)!))];
  return (
    <details className={`text-[13px] text-muted-foreground ${className}`}>
      <summary className="cursor-pointer select-none font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none rounded-sm w-fit">
        {t('zdjecia.autorzy_tytul', { count: pliki.length })}
      </summary>
      <ul className="mt-3 space-y-1.5 max-w-[90ch]">
        {pliki.map((p) => (
          <li key={p} className="break-words">
            <span className="font-medium text-foreground/80">{p.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')}</span>
            {' — '}
            <LiniaPodpisu plik={p} wpis={licencje.get(p)} />
          </li>
        ))}
      </ul>
    </details>
  );
}
