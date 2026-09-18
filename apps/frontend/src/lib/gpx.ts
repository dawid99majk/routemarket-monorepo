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

/** Punkt śladu: [lat, lng] albo [lat, lng, wysokość]. */
export type PunktSladu = [number, number] | [number, number, number] | number[];

export interface OdcinekGpx { nazwa: string; slad: PunktSladu[] }

/**
 * GPX z kilku śladów — dla całego wyjazdu każdy dzień jest osobnym `trk`, żeby
 * zegarek pokazał je jako osobne trasy, a nie jedną linię z przeskokiem przez noc.
 */
export function gpxTras(nazwa: string, odcinki: OdcinekGpx[], punkty: PunktGpx[]): string {
  const wpt = punkty.map((p) =>
    `  <wpt lat="${wspolrzedna(p.lat)}" lon="${wspolrzedna(p.lng)}"><name>${xml(p.name)}</name></wpt>`).join('\n');
  const trk = odcinki.map((o) => {
    // Ślad przychodzi jako [lat, lng, ele] — zamiana kolejności przeniosłaby trasę na inny kontynent.
    const trkpt = o.slad.map((p) => {
      const ele = typeof p[2] === 'number' && Number.isFinite(p[2]) && p[2] !== 0
        ? `<ele>${p[2].toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${wspolrzedna(p[0])}" lon="${wspolrzedna(p[1])}">${ele}</trkpt>`;
    }).join('\n');
    return `  <trk>
    <name>${xml(o.nazwa)}</name>
    <trkseg>
${trkpt}
    </trkseg>
  </trk>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(nazwa)}</name></metadata>
${wpt}
${trk}
</gpx>
`;
}

export function gpxDnia(nazwa: string, slad: PunktSladu[], punkty: PunktGpx[]): string {
  return gpxTras(nazwa, [{ nazwa, slad }], punkty);
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
