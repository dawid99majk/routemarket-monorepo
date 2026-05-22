import { useState, useMemo, useCallback } from 'react';

export type SortOption = 'newest' | 'best_rated' | 'most_purchased' | 'price_low' | 'price_high';
export type AiFilter = 'all' | 'human' | 'ai';

export interface FilterState {
  difficulty: string;
  season: string[];
  priceMin: string;
  priceMax: string;
  distanceMin: string;
  distanceMax: string;
  elevationMin: string;
  elevationMax: string;
  region: string;
  ai: AiFilter;
  petsFriendly: boolean;
  freeOnly: boolean;
  sortBy: SortOption;
  // Dynamic category filters
  duration: string;
  routeType: string; // also used for roadType
  surface: string;
  audience: string[];
  budget: string;
}

export interface ActiveChip {
  key: keyof FilterState;
  label: string;
}

const DEFAULT_FILTERS: FilterState = {
  difficulty: '',
  season: [],
  priceMin: '',
  priceMax: '',
  distanceMin: '',
  distanceMax: '',
  elevationMin: '',
  elevationMax: '',
  region: '',
  ai: 'all',
  petsFriendly: false,
  freeOnly: false,
  sortBy: 'newest',
  duration: '',
  routeType: '',
  surface: '',
  audience: [],
  budget: '',
};

export type FilterPreset = {
  id: string;
  label: string;
  icon: string;
  filters: Partial<FilterState>;
};

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'best_rated', label: 'Najlepiej oceniane', icon: '⭐', filters: { sortBy: 'best_rated' } },
  { id: 'ai_assisted', label: 'Wspomagane AI', icon: '🤖', filters: { ai: 'ai' } },
  { id: 'pets_friendly', label: 'Przyjazne zwierzętom', icon: '🐕', filters: { petsFriendly: true } },
];

export function useRouteFilters() {
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }, []);

  const clearFilter = useCallback((key: keyof FilterState) => {
    setFilters((prev) => ({ ...prev, [key]: DEFAULT_FILTERS[key] }));
    setActivePreset(null);
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters({ ...DEFAULT_FILTERS, ...preset.filters });
    setActivePreset(preset.id);
  }, []);

  const activeChips = useMemo((): ActiveChip[] => {
    const chips: ActiveChip[] = [];
    if (filters.difficulty) chips.push({ key: 'difficulty', label: `Difficulty: ${filters.difficulty}` });
    if (filters.season.length > 0) chips.push({ key: 'season', label: `Season: ${filters.season.join(', ')}` });
    if (filters.priceMin || filters.priceMax) chips.push({ key: 'priceMin', label: `Price: ${filters.priceMin || '0'}–${filters.priceMax || '∞'}` });
    if (filters.distanceMin || filters.distanceMax) chips.push({ key: 'distanceMin', label: `Distance: ${filters.distanceMin || '0'}–${filters.distanceMax || '∞'} km` });
    if (filters.elevationMin || filters.elevationMax) chips.push({ key: 'elevationMin', label: `Elevation: ${filters.elevationMin || '0'}–${filters.elevationMax || '∞'} m` });
    if (filters.region) chips.push({ key: 'region', label: `Region: ${filters.region}` });
    if (filters.ai !== 'all') chips.push({ key: 'ai', label: filters.ai === 'human' ? 'Human-made only' : 'AI-assisted' });
    if (filters.petsFriendly) chips.push({ key: 'petsFriendly', label: '🐕 Pets Friendly' });
    if (filters.freeOnly) chips.push({ key: 'freeOnly', label: '🆓 Tylko darmowe' });
    if (filters.duration) chips.push({ key: 'duration', label: `Duration: ${filters.duration}` });
    if (filters.routeType) chips.push({ key: 'routeType', label: `Type: ${filters.routeType}` });
    if (filters.surface) chips.push({ key: 'surface', label: `Surface: ${filters.surface}` });
    if (filters.audience.length > 0) chips.push({ key: 'audience', label: `Audience: ${filters.audience.join(', ')}` });
    if (filters.budget) chips.push({ key: 'budget', label: `Budget: ${filters.budget}` });
    return chips;
  }, [filters]);

  const activeFilterCount = activeChips.length;

  return {
    filters,
    updateFilter,
    clearFilter,
    clearAll,
    applyPreset,
    activePreset,
    activeChips,
    activeFilterCount,
  };
}
