import { repo } from '../db/repository.js';
import { RouteRequirements } from '../types/index.js';

export interface Claim {
  id: string;
  fact: string;
  source?: string;
  verified: boolean;
  type: 'location' | 'logistics' | 'difficulty' | 'attraction' | 'other';
}

export interface ExtractedClaims {
  region?: string;
  start_point?: string;
  end_point?: string;
  activity_type?: string;
  distance_km?: number;
  difficulty?: string;
  pois: string[];
  conflicts: string[];
  missing_critical_data: string[];
  claims: Claim[];
}

export class AnalysisService {
  async analyzeMaterials(projectId: string): Promise<ExtractedClaims> {
    const project = await repo.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const sourceArtifact = await repo.getArtifactByType(projectId, 'source_materials');
    const notes = project.requirements.input_notes || '';
    const materialsNotes = sourceArtifact?.content?.notes || '';
    const links = sourceArtifact?.content?.links || [];
    const combinedText = `
Notatki projektu: ${notes}
Materiały dodatkowe: ${materialsNotes}
Linki źródłowe: ${links.join(', ')}
`.trim();

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        pois: [],
        conflicts: [],
        missing_critical_data: ['start_point', 'region'],
        claims: []
      };
    }

    try {
      const prompt = `Jesteś analitykiem tras RouteMarket. Przeanalizuj poniższe materiały źródłowe i wyodrębnij konkretne fakty.
Materiały:
"""
${combinedText}
"""

Zwróć JSON z polami:
- region: (np. Tatry, Beskid Niski)
- start_point: (konkretna miejscowość/parking)
- end_point: (jeśli podano)
- activity_type: (hiking, cycling, motorcycle, city_walk)
- distance_km: (liczba, jeśli podano)
- difficulty: (easy, moderate, hard)
- pois: [lista nazw miejsc wspomnianych w tekście]
- conflicts: [lista sprzeczności, np. tytuł mówi o Karpatach, tekst o Sudetach, albo sprzeczne punkty startu]
- missing_critical_data: [lista brakujących pól z: start_point, activity_type, region - jeśli nie da się ich jednoznacznie określić]
- claims: [lista obiektów {id: string, fact: string, type: string} gdzie fact to krótkie, atomowe twierdzenie o trasie, np. "Start pod kościołem w Witowie", "Trasa omija schronisko na Hali Gąsienicowej", "Nawierzchnia szutrowa na 5km"]

Bądź bardzo krytyczny i precyzyjny. Nie zmyślaj danych.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (!response.ok) throw new Error(`Gemini Analysis Error: ${response.status}`);
      const data = await response.json() as any;
      const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text) as ExtractedClaims;

      // Add IDs and verification status to claims
      if (result.claims) {
        result.claims = result.claims.map((c, i) => ({
          ...c,
          id: c.id || `claim_${i}`,
          verified: false
        }));
      }

      // Save analysis as artifact
      await repo.upsertArtifact(projectId, 'analysis_result', { content: result });

      return result;
    } catch (err: any) {
      console.error('Analysis failed:', err);
      return {
        pois: [],
        conflicts: ['Błąd analizy AI'],
        missing_critical_data: ['start_point'],
        claims: []
      };
    }
  }
}


export const analysisService = new AnalysisService();
