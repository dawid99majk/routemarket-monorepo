import type { WizardTip } from '@/hooks/use-wizard-state';

export interface DraftCoordinate {
  lat: number;
  lng: number;
}

export interface RouteDescriptionDraft {
  title: string;
  locationString: string;
  description: string;
  fullDescription: string;
  distanceKm: string;
  elevationGain: string;
  estimatedTime: string;
  difficulty: string;
  loopType: string;
  surfaceType: string;
  season: string[];
  startPoint: string;
  endPoint: string;
  riskLevel: string;
  knownHazards: string;
  requiredEquipment: string;
  dataConfidence: string;
  tags: string;
  tips: WizardTip[];
  categoryHint: string;
  coordinates: DraftCoordinate[];
}

const SURFACE_KEYWORDS: Array<[string, string[]]> = [
  ['asphalt', ['asfalt', 'asphalt', 'szosa', 'road']],
  ['gravel', ['gravel', 'szuter', 'szutrow', 'gravelowa']],
  ['dirt', ['teren', 'grunt', 'lesna', 'polna', 'dirt']],
  ['rocky', ['kamien', 'skala', 'rocky', 'piargi']],
  ['sand', ['piach', 'piasek', 'sand']],
  ['mixed', ['mieszana', 'mixed', 'rozna nawierzchnia']],
];

const SEASON_KEYWORDS: Array<[string, string[]]> = [
  ['spring', ['wiosna', 'spring']],
  ['summer', ['lato', 'summer']],
  ['autumn', ['jesien', 'autumn', 'fall']],
  ['winter', ['zima', 'winter']],
  ['year-round', ['caly rok', 'year-round', 'year round', 'all year']],
];

const STOP_WORDS = new Set([
  'trasa',
  'route',
  'przez',
  'oraz',
  'from',
  'with',
  'dla',
  'the',
  'and',
  'km',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanLine(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim();
}

function firstUsefulLine(lines: string[]): string {
  return lines.find((line) => {
    const normalized = normalizeText(line);
    return line.length >= 8 && !normalized.startsWith('opis') && !normalized.startsWith('description');
  }) ?? '';
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function matchNumber(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(',', '.');
  }
  return '';
}

function extractCoordinates(text: string): DraftCoordinate[] {
  const coordinates: DraftCoordinate[] = [];
  const pairPattern = /(-?\d{1,2}[.,]\d{3,})\s*[,;| ]\s*(-?\d{1,3}[.,]\d{3,})/g;
  let match: RegExpExecArray | null;

  while ((match = pairPattern.exec(text)) !== null) {
    const lat = Number(match[1].replace(',', '.'));
    const lng = Number(match[2].replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const previous = coordinates[coordinates.length - 1];
    const previousKey = previous ? `${previous.lat.toFixed(6)},${previous.lng.toFixed(6)}` : '';
    if (previousKey === key) continue;
    coordinates.push({ lat, lng });
  }

  return coordinates;
}

function inferDifficulty(normalized: string): string {
  if (/(ekspert|expert|bardzo trud|extreme|ekstrem)/.test(normalized)) return 'expert';
  if (/(sred|moderate|umiark|normaln)/.test(normalized)) return 'moderate';
  if (/(trud|hard|wymagaj|strom|technicz)/.test(normalized)) return 'hard';
  if (/(latw|easy|lekka|rodzinn)/.test(normalized)) return 'easy';
  return '';
}

function inferLoopType(normalized: string): string {
  if (/\b(petla|loop|okrezna|circular)\b/.test(normalized)) return 'loop';
  if (/\b(tam i z powrotem|out and back|out-and-back|powrot ta sama)\b/.test(normalized)) return 'out-and-back';
  if (/\b(liniowa|point to point|point-to-point|od .* do )\b/.test(normalized)) return 'point-to-point';
  return '';
}

function inferRisk(normalized: string): string {
  if (/\b(ekstrem|lawin|przepasc|exposed|high risk|wysokie ryzyko)\b/.test(normalized)) return 'high';
  if (/\b(uwaga|strome|ruchliw|technicz|brak zasiegu|slaby zasieg|medium risk)\b/.test(normalized)) return 'medium';
  if (/\b(bezpiecz|rodzinn|latwa|low risk)\b/.test(normalized)) return 'low';
  return 'medium';
}

function inferCategoryHint(normalized: string): string {
  if (/\b(rower|bike|bicycle|mtb|gravel|cycling)\b/.test(normalized)) return 'cycling';
  if (/\b(motor|motocykl|motorcycle|adv)\b/.test(normalized)) return 'motorcycle';
  if (/\b(bieg|running|trail run)\b/.test(normalized)) return 'running';
  if (/\b(narty|ski|skitour|snowboard)\b/.test(normalized)) return 'winter';
  if (/\b(auto|car|roadtrip|samochod)\b/.test(normalized)) return 'driving';
  return 'hiking';
}

function inferSurface(normalized: string): string {
  const selected = SURFACE_KEYWORDS
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([surface]) => surface);
  return [...new Set(selected)].join(', ');
}

function inferSeason(normalized: string): string[] {
  const selected = SEASON_KEYWORDS
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([season]) => season);
  return [...new Set(selected)];
}

function inferLocation(lines: string[], title: string): string {
  const explicit = lines.find((line) => /^(region|lokalizacja|miejsce|location)\s*:/i.test(line));
  if (explicit) return explicit.split(':').slice(1).join(':').trim();

  const titleParts = title.split(/\s[-–]\s|\s\|\s/).map((part) => part.trim()).filter(Boolean);
  if (titleParts.length > 1) return titleParts[titleParts.length - 1];

  const throughLine = lines.find((line) => /\b(przez|via|okolice|region)\b/i.test(line));
  return throughLine ? compact(throughLine, 120) : '';
}

function extractListLines(lines: string[], keywords: string[]): string[] {
  return lines
    .filter((line) => {
      const normalized = normalizeText(line);
      return keywords.some((keyword) => normalized.includes(keyword));
    })
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .slice(0, 5);
}

function buildDescription(lines: string[], title: string): string {
  const body = lines.filter((line) => line !== title).join(' ');
  return compact(body || title, 900);
}

function buildFullDescription(input: {
  title: string;
  sourceText: string;
  distanceKm: string;
  elevationGain: string;
  estimatedTime: string;
  surfaceType: string;
  difficulty: string;
  loopType: string;
  knownHazards: string;
  requiredEquipment: string;
  hasCoordinates: boolean;
}): string {
  const metrics = [
    input.distanceKm ? `- Dystans: ${input.distanceKm} km` : undefined,
    input.elevationGain ? `- Przewyzszenie: ${input.elevationGain} m` : undefined,
    input.estimatedTime ? `- Szacowany czas: ${input.estimatedTime} h` : undefined,
    input.difficulty ? `- Trudnosc: ${input.difficulty}` : undefined,
    input.loopType ? `- Typ: ${input.loopType}` : undefined,
    input.surfaceType ? `- Nawierzchnia: ${input.surfaceType}` : undefined,
  ].filter(Boolean);

  return [
    `# ${input.title}`,
    '',
    '## Opis trasy',
    compact(input.sourceText, 6000),
    '',
    '## Parametry',
    metrics.length ? metrics.join('\n') : '- Uzupelnij parametry po sprawdzeniu trasy.',
    '',
    '## Nawigacja i offline',
    input.hasCoordinates
      ? 'Na podstawie wspolrzednych z opisu utworzono roboczy plik GPX. Przed publikacja sprawdz przebieg w mapie i popraw punkty, jesli trzeba.'
      : 'Dodaj plik GPX albo dopisz w opisie kolejne punkty w formacie 49.12345, 22.12345, aby kreator mogl zbudowac roboczy slad.',
    '',
    '## Bezpieczenstwo',
    input.knownHazards || 'Sprawdz pogode, przejezdnosc/przejscie, zasieg telefonu i lokalne ograniczenia przed startem.',
    '',
    '## Wyposazenie',
    input.requiredEquipment || 'Mapa offline, naladowany telefon, zapas wody, podstawowy zestaw awaryjny i aplikacja do nawigacji GPX.',
  ].join('\n');
}

function buildTags(normalized: string, title: string, location: string, categoryHint: string): string {
  const candidates = `${title} ${location} ${categoryHint} ${normalized}`
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .slice(0, 14);
  return [...new Set(candidates)].join(', ');
}

function buildTips(categoryHint: string): WizardTip[] {
  const base = [
    {
      category: 'before_start_network',
      content: 'Pobierz GPX i mapy offline przed startem. Sprawdz, czy aplikacja nawigacyjna otwiera slad bez internetu.',
    },
    {
      category: 'before_start_weather',
      content: 'Zweryfikuj pogode i warunki na trasie w dniu wyjazdu. Opis moze nie uwzgledniac naglych zmian.',
    },
    {
      category: 'good_tip',
      content: 'Zapisz punkt startu i awaryjny punkt powrotu w osobnej aplikacji mapowej.',
    },
  ];

  if (categoryHint === 'motorcycle' || categoryHint === 'driving') {
    base.unshift({
      category: 'before_start_fuel',
      content: 'Sprawdz paliwo, zasieg pojazdu i miejsca tankowania na dluzszych odcinkach.',
    });
  }

  return base.map((tip, index) => ({ ...tip, sort_order: index }));
}

export function buildRouteDraftFromDescription(sourceText: string): RouteDescriptionDraft {
  const lines = sourceText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  const normalized = normalizeText(sourceText);
  const title = compact(firstUsefulLine(lines) || 'Nowa trasa z opisu', 96);
  const locationString = inferLocation(lines, title);
  const coordinates = extractCoordinates(sourceText);
  const distanceKm = matchNumber(sourceText, [
    /(?:dystans|distance|dlugosc|length)\D{0,20}(\d+(?:[.,]\d+)?)\s*km/i,
    /(\d+(?:[.,]\d+)?)\s*km/i,
  ]);
  const elevationGain = matchNumber(sourceText, [
    /(?:przewyzszenie|przewyższenie|elevation|ascent|suma podejsc)\D{0,30}(\d{2,5})\s*m/i,
    /(\d{2,5})\s*m\D{0,24}(?:przewyzszenia|przewyższenia|ascent|elevation|w gore|up)/i,
  ]);
  const estimatedTime = matchNumber(sourceText, [
    /(?:czas|time|duration)\D{0,20}(\d+(?:[.,]\d+)?)\s*(?:h|godz|hour)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:h|godz|hour)/i,
  ]);
  const categoryHint = inferCategoryHint(normalized);
  const difficulty = inferDifficulty(normalized);
  const loopType = inferLoopType(normalized);
  const surfaceType = inferSurface(normalized);
  const season = inferSeason(normalized);
  const riskLevel = inferRisk(normalized);
  const knownHazards = extractListLines(lines, ['uwaga', 'hazard', 'niebezp', 'ryzyko', 'trudny odcinek']).join('\n');
  const requiredEquipment = extractListLines(lines, ['wez', 'zabierz', 'sprzet', 'wyposaz', 'equipment']).join('\n');
  const description = buildDescription(lines, title);
  const lastCoordinate = coordinates.length ? coordinates[coordinates.length - 1] : undefined;

  return {
    title,
    locationString,
    description,
    fullDescription: buildFullDescription({
      title,
      sourceText,
      distanceKm,
      elevationGain,
      estimatedTime,
      surfaceType,
      difficulty,
      loopType,
      knownHazards,
      requiredEquipment,
      hasCoordinates: coordinates.length >= 2,
    }),
    distanceKm,
    elevationGain,
    estimatedTime,
    difficulty,
    loopType,
    surfaceType,
    season,
    startPoint: coordinates[0] ? `${coordinates[0].lat.toFixed(5)}, ${coordinates[0].lng.toFixed(5)}` : '',
    endPoint: lastCoordinate ? `${lastCoordinate.lat.toFixed(5)}, ${lastCoordinate.lng.toFixed(5)}` : '',
    riskLevel,
    knownHazards,
    requiredEquipment,
    dataConfidence: coordinates.length >= 2 ? 'medium' : 'low',
    tags: buildTags(normalized, title, locationString, categoryHint),
    tips: buildTips(categoryHint),
    categoryHint,
    coordinates,
  };
}

export function buildGpxFromCoordinates(title: string, coordinates: DraftCoordinate[]): string {
  const safeTitle = title.replace(/[<>&'"]/g, '');
  const points = coordinates
    .map((point) => `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lng.toFixed(6)}"><ele>0</ele></trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket Creator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeTitle}</name>
  </metadata>
  <trk>
    <name>${safeTitle}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

export function routeTitleToFileName(title: string): string {
  const slug = normalizeText(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'route-draft'}.gpx`;
}
