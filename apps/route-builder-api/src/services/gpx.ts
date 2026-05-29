import { RouteResult } from './routing.js';

export class GpxService {
  buildGpx(route: RouteResult, title: string): string {
    console.log('[GPX] Building GPX XML...');
    const trkpts = route.trackPoints.map(pt => 
      `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket Builder v2" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${title}</name></metadata>
  <trk>
    <name>${title}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  }
}

export const gpxService = new GpxService();
