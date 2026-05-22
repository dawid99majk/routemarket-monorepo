import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/drawer';
import { SlidersHorizontal } from 'lucide-react';
import type { FilterState, AiFilter, SortOption } from '@/hooks/use-route-filters';
import { type CategoryFilterConfig } from '@/lib/categories';

const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'hard', 'expert'];
const SEASON_OPTIONS = ['spring', 'summer', 'autumn', 'winter', 'year-round'];

interface FilterBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClearAll: () => void;
  activeFilterCount: number;
  uniqueRegions: string[];
  resultsCount: number;
  categoryFilterConfig: CategoryFilterConfig;
}

export default function FilterBottomSheet({
  open, onOpenChange, filters, onUpdate, onClearAll, activeFilterCount, uniqueRegions, resultsCount, categoryFilterConfig: cfg,
}: FilterBottomSheetProps) {
  const { t } = useTranslation();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              {t('common.filters')}
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </DrawerTitle>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs text-muted-foreground">
                {t('common.clear')}
              </Button>
            )}
          </div>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto space-y-4 -webkit-overflow-scrolling-touch">
          {/* Sort */}
          <FilterField label="Sort by">
            <Select value={filters.sortBy} onValueChange={(v) => onUpdate('sortBy', v as SortOption)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t('index.sort_newest')}</SelectItem>
                <SelectItem value="best_rated">{t('index.sort_best_rated')}</SelectItem>
                <SelectItem value="most_purchased">{t('index.sort_most_purchased')}</SelectItem>
                <SelectItem value="price_low">{t('index.sort_price_low')}</SelectItem>
                <SelectItem value="price_high">{t('index.sort_price_high')}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <div className="grid grid-cols-2 gap-3">
            <FilterField label={t('filters.region')}>
              <Select value={filters.region || '__all__'} onValueChange={(v) => onUpdate('region', v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('filters.any_region')}</SelectItem>
                  {uniqueRegions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label={t('filters.difficulty')}>
              <Select value={filters.difficulty || '__all__'} onValueChange={(v) => onUpdate('difficulty', v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('filters.any_difficulty')}</SelectItem>
                  {DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label={t('filters.season')}>
              <div className="space-y-2">
                {SEASON_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
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
            </FilterField>

            <FilterField label="AI">
              <Select value={filters.ai} onValueChange={(v) => onUpdate('ai', v as AiFilter)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="human">Human-made</SelectItem>
                  <SelectItem value="ai">AI-assisted</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </div>

          {/* Category-specific filters */}
          <div className="grid grid-cols-2 gap-3">
            {cfg.showDuration && cfg.durationOptions && (
              <FilterField label="Duration">
                <Select value={filters.duration || '__all__'} onValueChange={(v) => onUpdate('duration', v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {cfg.durationOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {cfg.showRoadType && cfg.roadTypeOptions && (
              <FilterField label="Road / Route Type">
                <Select value={filters.routeType || '__all__'} onValueChange={(v) => onUpdate('routeType', v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {cfg.roadTypeOptions.map((rt) => <SelectItem key={rt} value={rt}>{rt.charAt(0).toUpperCase() + rt.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {cfg.showSurface && cfg.surfaceOptions && (
              <FilterField label="Surface">
                <Select value={filters.surface || '__all__'} onValueChange={(v) => onUpdate('surface', v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {cfg.surfaceOptions.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
            )}

            {cfg.showBudget && cfg.budgetOptions && (
              <FilterField label="Budget">
                <Select value={filters.budget || '__all__'} onValueChange={(v) => onUpdate('budget', v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {cfg.budgetOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
          </div>

          {cfg.showAudience && cfg.audienceOptions && (
            <FilterField label="Audience">
              <div className="flex flex-wrap gap-2">
                {cfg.audienceOptions.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
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
            </FilterField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FilterField label={t('filters.price')}>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <Checkbox
                  checked={filters.freeOnly}
                  onCheckedChange={(checked) => onUpdate('freeOnly', !!checked)}
                />
                <span className="font-semibold text-emerald-600">🆓 Tylko darmowe</span>
              </label>
              <div className={`flex gap-1.5 ${filters.freeOnly ? 'opacity-40 pointer-events-none' : ''}`}>
                <Input type="number" placeholder={t('common.min')} value={filters.priceMin} onChange={(e) => onUpdate('priceMin', e.target.value)} className="h-9 text-sm" disabled={filters.freeOnly} />
                <Input type="number" placeholder={t('common.max')} value={filters.priceMax} onChange={(e) => onUpdate('priceMax', e.target.value)} className="h-9 text-sm" disabled={filters.freeOnly} />
              </div>
            </FilterField>
            {cfg.showDistance !== false && (
              <FilterField label={t('filters.distance')}>
                <div className="flex gap-1.5">
                  <Input type="number" placeholder={t('common.min')} value={filters.distanceMin} onChange={(e) => onUpdate('distanceMin', e.target.value)} className="h-9 text-sm" />
                  <Input type="number" placeholder={t('common.max')} value={filters.distanceMax} onChange={(e) => onUpdate('distanceMax', e.target.value)} className="h-9 text-sm" />
                </div>
              </FilterField>
            )}
          </div>

          {cfg.showElevation !== false && (
            <FilterField label={t('filters.elevation')}>
              <div className="flex gap-1.5">
                <Input type="number" placeholder={t('common.min')} value={filters.elevationMin} onChange={(e) => onUpdate('elevationMin', e.target.value)} className="h-9 text-sm" />
                <Input type="number" placeholder={t('common.max')} value={filters.elevationMax} onChange={(e) => onUpdate('elevationMax', e.target.value)} className="h-9 text-sm" />
              </div>
            </FilterField>
          )}
        </div>

        <DrawerFooter className="pt-2 pb-safe">
          <Button onClick={() => onOpenChange(false)} className="w-full min-h-[48px] text-base">
            Show {resultsCount} {resultsCount === 1 ? 'route' : 'routes'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">{label}</Label>
      {children}
    </div>
  );
}
