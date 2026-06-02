import { RouteResult } from './routing.js';
import { RouteRequirements } from '../types/index.js';

export interface ReportOutput {
  text: string;
  sources: { title: string; url: string }[];
}

export class ReportService {
  async extractStartPointAndRegion(userNotes: string, sourceLinks: string[] = [], sourceFiles: string[] = []): Promise<{ 
    start_point: string | null; 
    region: string | null;
    distance_target_km?: number | null;
    difficulty?: 'easy' | 'moderate' | 'hard' | 'expert' | null;
    duration_pref?: 'short' | 'long' | null;
  }> {
    console.log(`[ReportService] extractStartPointAndRegion: Extracting requirements from user notes and sources...`);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const hasContent = (userNotes && userNotes.trim().length > 5) || sourceLinks.length > 0 || sourceFiles.length > 0;

    if (GEMINI_API_KEY && hasContent) {
      try {
        const prompt = `Przeanalizuj poniższe notatki/opis trasy, a także wylistowane pliki i linki źródłowe. Wyodrębnij z nich szczegóły planowanej wycieczki:
1. Konkretne miasto lub miejsce startowe. Jeśli nie ma wyraźnie podanego miejsca, MUSISZ zwrócić null.
2. Ogólny region geograficzny. Jeśli nie podano, zwróć null.
3. Oczekiwany dystans w kilometrach (sama liczba, np. 30). Jeśli nie podano, zwróć null.
4. Poziom trudności (jeden z: "easy", "moderate", "hard", "expert"). Jeśli nie da się określić, zwróć "moderate".
5. Preferencję czasu trwania ("short" dla wycieczek rekreacyjnych do 3h, "long" dla wycieczek całodniowych lub powyżej 3h).

Opis trasy / Notatki użytkownika: "${userNotes || 'brak'}"
Linki do stron / filmów: ${sourceLinks.join(', ') || 'brak'}
Wgrane pliki: ${sourceFiles.join(', ') || 'brak'}

Odpowiedz WYŁĄCZNIE prawidłowym obiektem JSON, bez żadnego formatowania markdown ani dodatkowych słów.
Przykład, gdy nie podano lokalizacji:
{
  "start_point": null,
  "region": null,
  "distance_target_km": 30,
  "difficulty": "moderate",
  "duration_pref": "short"
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generatedText) {
            const cleanText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText);
            if (parsed.start_point && parsed.region) {
              return {
                start_point: parsed.start_point,
                region: parsed.region,
                distance_target_km: parsed.distance_target_km || null,
                difficulty: parsed.difficulty || null,
                duration_pref: parsed.duration_pref || null
              };
            }
          }
        } else {
          console.warn(`[ReportService] Gemini API extraction failed with status: ${response.status}`);
        }
      } catch (error) {
        console.error('[ReportService] Error extracting locations via Gemini, falling back:', error);
      }
    }

    // Default Fallback
    return {
      start_point: null,
      region: null,
      distance_target_km: null,
      difficulty: null,
      duration_pref: null
    };
  }

  async generateShortReport(route: RouteResult, requirements: RouteRequirements): Promise<ReportOutput> {
    const { distance_km, duration_h, trackPoints } = route;
    const { region, route_type, start_point, end_point, loop } = requirements;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (GEMINI_API_KEY) {
      try {
        const prompt = `Generuj po polsku krótki, atrakcyjny i profesjonalny przewodnik po trasie.
Region: ${region}
Dystans: ${distance_km} km
Czas: ${duration_h} h
Typ trasy: ${route_type}
Start: ${start_point}
Koniec: ${end_point || (loop ? 'Pętla do startu' : 'Nieokreślony')}

Użyj narzędzia wyszukiwarki Google (Google Search), aby zweryfikować bieżące informacje o tym regionie (np. upewnij się czy są jakieś utrudnienia na szlakach, podaj ciekawe fakty krajoznawcze oraz schroniska). Dodaj automatyczne przypisy i odnośniki w tekście do znalezionych źródeł, jeśli to możliwe. Opisz krótko specyfikę trasy, poziom trudności, punkty POI i wskazówki logistyczne. Formatuj w Markdown.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            tools: [{
              googleSearch: {}
            }]
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as any;
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Parse Grounding Metadata
        const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
        const sources = groundingMetadata?.groundingChunks?.map((chunk: any) => ({
          title: chunk.web?.title || 'Źródło internetowe',
          url: chunk.web?.uri
        })).filter((s: any) => s.url) || [];

        if (generatedText) {
          return {
            text: generatedText,
            sources
          };
        }
      } catch (error) {
        console.error('Error calling Gemini API, falling back to template:', error);
      }
    }

    // Fallback template
    return {
      text: `# Raport Trasy v2: ${region}
    
## Podsumowanie Techniczne
- **Typ**: ${route_type}
- **Dystans**: ${distance_km} km
- **Szacowany czas**: ${duration_h} h
- **Liczba punktów GPS**: ${trackPoints ? trackPoints.length : 0}

## Plan Przebiegu
1. **Start**: ${start_point}
2. **Koniec**: ${end_point || (loop ? 'Pętla do startu' : 'Nieokreślony')}

## Ostrzeżenia
- Wygenerowano przez silnik MVP v2 (Mock Routing).
- Trasa wymaga weryfikacji w terenie.
`,
      sources: []
    };
  }
}

export const reportService = new ReportService();
