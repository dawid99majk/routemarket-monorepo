/**
 * Autor i licencja zdjęć z Wikimedia Commons — do podpisów w serwisie.
 *
 * Wszystkie zdjęcia miejsc to pliki z Commons. Licencje CC BY i CC BY-SA
 * wymagają podania autora, licencji i źródła przy każdym użyciu, a serwis
 * pokazywał je bez słowa. Dane siedzą w tabeli `zdjecia_licencje` (jeden wiersz
 * na plik), uzupełnianej z crona przez marketing/fabryka/zdjecia_licencje.mjs.
 *
 * Podpis jest pobierany tylko dla zdjęcia, które faktycznie stoi na ekranie,
 * i tylko raz: wyniki (także "brak wpisu") trzymamy w pamięci sesji, a zapytania
 * z jednego renderu zbieramy w jedną paczkę, żeby galeria z ośmioma zdjęciami
 * nie robiła ośmiu zapytań.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LicencjaZdjecia {
  plik: string;
  autor: string | null;
  licencja: string | null;
  licencja_url: string | null;
  strona: string | null;
  dozwolona: boolean;
}

/** Nazwa pliku Commons z adresu upload.wikimedia.org — ta sama reguła co w skrypcie na VPS. */
export function plikZAdresu(url: string | null | undefined): string | null {
  const m = String(url ?? '').match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** Strona pliku w Commons — źródło, które pokazuje pełny autor i licencję także bez wpisu w bazie. */
export const stronaPliku = (plik: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(plik)}`;

const pamiec = new Map<string, LicencjaZdjecia | null>();
const oczekujace = new Set<string>();
const sluchacze = new Set<() => void>();
let planowane = false;

async function pobierzPaczke() {
  planowane = false;
  const pliki = [...oczekujace];
  oczekujace.clear();
  if (!pliki.length) return;
  try {
    const { data } = await supabase.from('zdjecia_licencje')
      .select('plik, autor, licencja, licencja_url, strona, dozwolona').in('plik', pliki);
    for (const w of (data ?? []) as LicencjaZdjecia[]) pamiec.set(w.plik, w);
  } catch {
    /* podpis nie może zepsuć zdjęcia; bez wpisu pokaże się samo źródło */
  }
  for (const p of pliki) if (!pamiec.has(p)) pamiec.set(p, null);
  sluchacze.forEach((f) => f());
}

function zamow(pliki: string[]) {
  let nowe = false;
  for (const p of pliki) {
    if (!pamiec.has(p) && !oczekujace.has(p)) { oczekujace.add(p); nowe = true; }
  }
  if (nowe && !planowane) { planowane = true; setTimeout(pobierzPaczke, 30); }
}

/**
 * Licencje dla listy adresów zdjęć. Wynik: mapa plik → wpis albo null, gdy
 * bazy nie ma (wtedy pokazujemy samo źródło). Klucz jest nieobecny, dopóki
 * zapytanie trwa — komponent może odróżnić "jeszcze nie wiem" od "nie ma".
 */
export function useLicencje(adresy: (string | null | undefined)[]): Map<string, LicencjaZdjecia | null> {
  const [, odswiez] = useState(0);
  const klucz = adresy.map(plikZAdresu).filter(Boolean).join('|');

  useEffect(() => {
    const f = () => odswiez((n) => n + 1);
    sluchacze.add(f);
    zamow(klucz ? klucz.split('|') : []);
    return () => { sluchacze.delete(f); };
  }, [klucz]);

  const wynik = new Map<string, LicencjaZdjecia | null>();
  for (const p of klucz ? klucz.split('|') : []) if (pamiec.has(p)) wynik.set(p, pamiec.get(p)!);
  return wynik;
}
