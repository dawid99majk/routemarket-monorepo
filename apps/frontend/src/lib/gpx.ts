/**
 * Plik GPX z przebiegu dnia: ślad po chodnikach i przystanki z nazwami.
 *
 * Kreator trasy ma własny generator, ale pisze sam ślad i nie ucieka znaków w
 * nazwie — „Kraków & okolice" dawało plik, którego zegarek nie otwierał. Tu
 * nazwy idą przez escape XML, a przystanki jako `wpt`, żeby w nawigacji było
 * widać, gdzie się zatrzymać, a nie tylko którędy iść.
 */

const xml = (s: string): string => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const wspolrzedna = (n: number): string => (Number.isFinite(n) ? n.toFixed(6) : '0');

export interface PunktGpx { name: string; lat: number; lng: number }

export function gpxDnia(nazwa: string, slad: [number, number][], punkty: PunktGpx[]): string {
  const wpt = punkty.map((p) =>
    `  <wpt lat="${wspolrzedna(p.lat)}" lon="${wspolrzedna(p.lng)}"><name>${xml(p.name)}</name></wpt>`).join('\n');
  // Ślad przychodzi jako [lat, lng] — zamiana kolejności przeniosłaby trasę na inny kontynent.
  const trkpt = slad.map(([lat, lng]) =>
    `      <trkpt lat="${wspolrzedna(lat)}" lon="${wspolrzedna(lng)}"></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(nazwa)}</name></metadata>
${wpt}
  <trk>
    <name>${xml(nazwa)}</name>
    <trkseg>
${trkpt}
    </trkseg>
  </trk>
</gpx>
`;
}

export function nazwaPliku(s: string): string {
  const slug = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'trasa';
}

export function pobierzPlik(nazwa: string, tresc: string, typ = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([tresc], { type: typ }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
