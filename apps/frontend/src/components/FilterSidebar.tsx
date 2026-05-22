import { useTranslation } from 'react-i18next';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { FilterState, AiFilter, SortOption } from '@/hooks/use-route-filters';
import { type CategoryFilterConfig } from '@/lib/categories';

const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'hard', 'expert'];
const SEASON_OPTIONS = ['spring', 'summer', 'autumn', 'winter', 'year-round'];

interface FilterSidebarProps {
  filters: FilterState;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClearAll: () => void;
  activeFilterCount: number;
  uniqueRegions: string[];
  categoryFilterConfig: CategoryFilterConfig;
}

export default function FilterSidebar({ filters, onUpdate, onClearAll, activeFilterCount, uniqueRegions, categoryFilterConfig: cfg }: FilterSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="w-[240px] shrink-0 border-r border-border bg-card overflow-y-auto">
      <div className="sticky top-0 bg-card z-10 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{t('common.filters')}</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAll} className="h-7 px-2 text-xs gap-1 text-muted-foreground">
              <RotateCcw className="w-3 h-3 text-primary" /> {t('common.clear')}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Sort */}
        <FilterSection label={t('index.sort_newest', 'Sort by')}>
          <Select value={filters.sortBy} onValueChange={(v) => onUpdate('sortBy', v as SortOption)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('index.sort_newest')}</SelectItem>
              <SelectItem value="best_rated">{t('index.sort_best_rated')}</SelectItem>
              <SelectItem value="most_purchased">{t('index.sort_most_purchased')}</SelectItem>
              <SelectItem value="price_low">{t('index.sort_price_low')}</SelectItem>
              <SelectItem value="price_high">{t('index.sort_price_high')}</SelectItem>
            </SelectContent>
          </Select>
        </FilterSection>

        {/* Region */}
        <FilterSection label={t('filters.region')}>
          <Select value={filters.region || '__all__'} onValueChange={(v) => onUpdate('region', v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('filters.any_region')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('filters.any_region')}</SelectItem>
              {uniqueRegions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterSection>

        {/* Difficulty */}
        <FilterSection label={t('filters.difficulty')}>
          <Select value={filters.difficulty || '__all__'} onValueChange={(v) => onUpdate('difficulty', v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('filters.any_difficulty')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('filters.any_difficulty')}</SelectItem>
              {DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterSection>

        {/* Season */}
        <FilterSection label={t('filters.season')}>
          <div className="space-y-2">
            {SEASON_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={filters.season.includes(s)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...filters.season, s]
                      : filters.season.filter((x) => x !== s);
                    onUpdate('season', next);
                  }}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Duration – category-specific */}
        {cfg.showDuration && cfg.durationOptions && (
          <FilterSection label="Duration">
            <Select value={filters.duration || '__all__'} onValueChange={(v) => onUpdate('duration', v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any</SelectItem>
                {cfg.durationOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>
        )}

        {/* Road Type / Route Type */}
        {cfg.showRoadType && cfg.roadTypeOptions && (
          <FilterSection label="Road / Route Type">
            <Select value={filters.routeType || '__all__'} onValueChange={(v) => onUpdate('routeType', v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any</SelectItem>
                {cfg.roadTypeOptions.map((rt) => <SelectItem key={rt} value={rt}>{rt.charAt(0).toUpperCase() + rt.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>
        )}

        {/* Surface */}
        {cfg.showSurface && cfg.surfaceOptions && (
          <FilterSection label="Surface">
            <Select value={filters.surface || '__all__'} onValueChange={(v) => onUpdate('surface', v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any</SelectItem>
                {cfg.surfaceOptions.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>
        )}

        {/* Budget */}
        {cfg.showBudget && cfg.budgetOptions && (
          <FilterSection label="Budget">
            <Select value={filters.budget || '__all__'} onValueChange={(v) => onUpdate('budget', v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any</SelectItem>
                {cfg.budgetOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>
        )}

        {/* Audience */}
        {cfg.showAudience && cfg.audienceOptions && (
          <FilterSection label="Audience">
            <div className="space-y-2">
              {cfg.audienceOptions.map((a) => (
                <label key={a} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={filters.audience.includes(a)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...filters.audience, a]
                        : filters.audience.filter((x) => x !== a);
                      onUpdate('audience', next);
                    }}
                  />
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Price */}
        <FilterSection label={t('filters.price')}>
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-2">
            <Checkbox
              checked={filters.freeOnly}
              onCheckedChange={(checked) => onUpdate('freeOnly', !!checked)}
            />
            <span className="font-semibold text-emerald-600">🆓 Tylko darmowe</span>
          </label>
          <div className={`flex gap-1.5 ${filters.freeOnly ? 'opacity-40 pointer-events-none' : ''}`}>
            <Input type="number" placeholder={t('common.min')} value={filters.priceMin} onChange={(e) => onUpdate('priceMin', e.target.value)} className="h-8 text-xs" disabled={filters.freeOnly} />
            <Input type="number" placeholder={t('common.max')} value={filters.priceMax} onChange={(e) => onUpdate('priceMax', e.target.value)} className="h-8 text-xs" disabled={filters.freeOnly} />
          </div>
        </FilterSection>

        {/* Distance */}
        {cfg.showDistance !== false && (
          <FilterSection label={t('filters.distance')}>
            <div className="flex gap-1.5">
              <Input type="number" placeholder={t('common.min')} value={filters.distanceMin} onChange={(e) => onUpdate('distanceMin', e.target.value)} className="h-8 text-xs" />
              <Input type="number" placeholder={t('common.max')} value={filters.distanceMax} onChange={(e) => onUpdate('distanceMax', e.target.value)} className="h-8 text-xs" />
            </div>
          </FilterSection>
        )}

        {/* Elevation */}
        {cfg.showElevation !== false && (
          <FilterSection label={t('filters.elevation')}>
            <div className="flex gap-1.5">
              <Input type="number" placeholder={t('common.min')} value={filters.elevationMin} onChange={(e) => onUpdate('elevationMin', e.target.value)} className="h-8 text-xs" />
              <Input type="number" placeholder={t('common.max')} value={filters.elevationMax} onChange={(e) => onUpdate('elevationMax', e.target.value)} className="h-8 text-xs" />
            </div>
          </FilterSection>
        )}

        {/* AI filter */}
        {isFeatureEnabled('ff_ai_assisted_filter') && (
          <FilterSection label="AI">
            <Select value={filters.ai} onValueChange={(v) => onUpdate('ai', v as AiFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="human">Human-made only</SelectItem>
                <SelectItem value="ai">AI-assisted</SelectItem>
              </SelectContent>
            </Select>
          </FilterSection>
        )}
      </div>
    </aside>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">{label}</Label>
      {children}
    </div>
  );
}
