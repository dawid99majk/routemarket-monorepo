import type { WizardState } from '@/hooks/use-wizard-state';

export interface MissingField { step: number; label: string }

export function validatePublish(state: WizardState): MissingField[] {
  const m: MissingField[] = [];
  if (!state.title.trim() || state.title.trim() === 'Szkic trasy') m.push({ step: 1, label: 'Tytuł trasy' });
  if (!state.categoryId) m.push({ step: 1, label: 'Kategoria' });
  if (!state.isFree && !state.price) m.push({ step: 1, label: 'Cena (lub oznaczenie jako darmowa)' });
  if (!state.locationString.trim()) m.push({ step: 1, label: 'Lokalizacja' });
  if (!state.gpxFile && !state.gpxFileKey) m.push({ step: 1, label: 'Plik GPX' });
  if (!state.distanceKm) m.push({ step: 2, label: 'Dystans (km)' });
  if (!state.difficulty) m.push({ step: 2, label: 'Poziom trudności' });
  if (!state.loopType) m.push({ step: 2, label: 'Typ trasy (pętla / liniowa)' });
  if (state.description.trim().length < 50) m.push({ step: 3, label: 'Skrót trasy (min. 50 znaków)' });
  if (state.fullDescription.trim().length < 100) m.push({ step: 3, label: 'Pełny opis trasy (min. 100 znaków)' });
  if (state.imagePreviews.length < 1) m.push({ step: 3, label: 'Co najmniej 1 zdjęcie' });
  if (!state.riskLevel) m.push({ step: 6, label: 'Poziom ryzyka' });
  if (!state.lastVerifiedAt) m.push({ step: 6, label: 'Data ostatniej weryfikacji trasy' });
  if (!state.declarations.every(Boolean)) m.push({ step: 7, label: 'Zaakceptowanie wszystkich oświadczeń twórcy' });
  return m;
}
