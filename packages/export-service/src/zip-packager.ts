import JSZip from 'jszip';

export interface RoutePackageData {
  guideMd: string;
  gpxXml: string;
  poiGeoJson: string;
  sourcesJson: string;
  licenseReportMd: string;
  title: string;
}

export async function createRouteZip(data: RoutePackageData): Promise<Uint8Array> {
  const zip = new JSZip();
  
  const rootFolder = zip.folder(data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase());
  
  if (rootFolder) {
    rootFolder.file('guide.md', data.guideMd);
    rootFolder.file('route.gpx', data.gpxXml);
    rootFolder.file('poi.geojson', data.poiGeoJson);
    rootFolder.file('sources_internal.json', data.sourcesJson);
    rootFolder.file('license_report.md', data.licenseReportMd);
  }

  return await zip.generateAsync({ type: 'uint8array' });
}
