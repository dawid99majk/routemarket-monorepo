import { lazy, Suspense, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategories } from '@/hooks/use-routes';
import { parseGpx, type GpxParseResult } from '@/lib/gpx-parser';
import { SUB_CATEGORIES } from '@/lib/categories';
import { CURRENCIES } from '@/hooks/use-currency';
import LocationPicker from '@/components/LocationPicker';
import LocationSearch from '@/components/LocationSearch';
import AiSuggestButton from './AiSuggestButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Upload, MapPin, DollarSign, CheckCircle2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import type { WizardState } from '@/hooks/use-wizard-state';

const RouteGlobe3D = lazy(() => import('@/components/RouteGlobe3D'));

interface Props {
  state: WizardState;
  setField: (field: string, value: any) => void;
}

export default function StepGpxBasics({ state, setField }: Props) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const gpxInputRef = useRef<HTMLInputElement>(null);

  const handleGpxUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      toast.error(t('wizard.step1.gpx_invalid'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t('wizard.step1.gpx_too_large'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parseGpx(ev.target?.result as string);
        setField('gpxParsed', result);
        setField('gpxFile', file);
        setField('latitude', result.latitude);
        setField('longitude', result.longitude);
        setField('distanceKm', String(result.distance_km));
        setField('elevationGain', String(result.elevation_gain_m));
        setField('estimatedTime', String(result.estimated_time_h));
        setField('startPoint', result.start_point);
        setField('endPoint', result.end_point);
        toast.success(t('wizard.step1.gpx_success', { distance: result.distance_km, elevation: result.elevation_gain_m }));
      } catch (err: any) {
        toast.error(err.message || t('wizard.step1.gpx_parse_failed'));
      }
    };
    reader.readAsText(file);
  }, [setField, t]);

  const catName = categories.find(c => String(c.id) === state.categoryId)?.name;
  const subs = catName ? (SUB_CATEGORIES[catName] ?? []) : [];

  const aiRouteData = {
    title: state.title,
    location_string: state.locationString,
    category: catName || '',
    distance_km: state.distanceKm,
    elevation_gain_m: state.elevationGain,
    latitude: state.latitude,
    longitude: state.longitude,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step1.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('wizard.step1.subtitle')}</p>
      </div>

      {/* GPX Upload */}
      <div className="bg-card rounded-xl p-6 border border-dashed border-border">
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx"
          className="hidden"
          onChange={handleGpxUpload}
        />
        {state.gpxParsed ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">
                {t('wizard.step1.gpx_loaded', { distance: state.gpxParsed.distance_km, elevation: state.gpxParsed.elevation_gain_m })}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${state.gpxFile ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {state.gpxFile ? 'Nowo wgrany' : 'Zapisany w chmurze'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => gpxInputRef.current?.click()}>
                {t('wizard.step1.gpx_change')}
              </Button>
            </div>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <Globe className="h-3.5 w-3.5" /> Globe preview
              </div>
              <div className="h-[280px] rounded-lg overflow-hidden border border-border">
                <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                  <RouteGlobe3D track={state.gpxParsed.trackPoints} />
                </Suspense>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => gpxInputRef.current?.click()}
            className="w-full py-12 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Upload className="w-10 h-10" />
            <span className="font-medium text-lg">{t('wizard.step1.gpx_drop')}</span>
            <span className="text-sm">{t('wizard.step1.gpx_formats')}</span>
          </button>
        )}
      </div>

      {/* Basic fields */}
      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="title">{t('wizard.step1.title_label')} <span className="text-destructive">*</span></Label>
            <AiSuggestButton
              field="title"
              routeData={aiRouteData}
              onAccept={(data) => setField('title', data.suggestion)}
              label={t('wizard.ai.title')}
            />
          </div>
          <Input
            id="title"
            value={state.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder={t('wizard.step1.title_placeholder')}
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('wizard.step1.category')} <span className="text-destructive">*</span></Label>
            <Select value={state.categoryId} onValueChange={(v) => { setField('categoryId', v); setField('subCategory', []); }}>
              <SelectTrigger><SelectValue placeholder={t('wizard.step1.category_placeholder')} /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('wizard.step1.subcategories')}</Label>
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">{t('wizard.step1.subcategories_select_first')}</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {subs.map((s) => {
                  const isActive = state.subCategory.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const next = isActive
                          ? state.subCategory.filter((x: string) => x !== s)
                          : [...state.subCategory, s];
                        setField('subCategory', next);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground border-accent'
                          : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> {t('wizard.step1.price')} {!state.isFree && <span className="text-destructive">*</span>}
              </Label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <Switch
                  checked={!!state.isFree}
                  onCheckedChange={(checked) => {
                    setField('isFree', checked);
                    if (checked) setField('price', '0');
                  }}
                />
                <span className={state.isFree ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>{t('wizard.step1.free')}</span>
              </label>
            </div>
            <Input
              type="number"
              min="0"
              max="9999"
              step="0.01"
              value={state.isFree ? '0' : state.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder={state.isFree ? t('wizard.step1.free') : '0.00'}
              disabled={!!state.isFree}
            />
          </div>
          <div>
            <Label>{t('wizard.step1.currency')}</Label>
            <Select value={state.currency} onValueChange={(v) => setField('currency', v)} disabled={!!state.isFree}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Location */}
        <div>
          <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {t('wizard.step1.location')} <span className="text-destructive">*</span></Label>
          <LocationSearch
            value={state.locationString}
            onChange={(v) => setField('locationString', v)}
            onSelect={(place) => {
              setField('latitude', place.lat);
              setField('longitude', place.lon);
              setField('locationString', place.display_name);
            }}
          />
          {(state.latitude !== 0 || state.longitude !== 0) && !state.gpxParsed && (
            <div className="mt-2 h-[200px] rounded-lg overflow-hidden border border-border">
              <LocationPicker
                latitude={state.latitude}
                longitude={state.longitude}
                onLocationChange={(lat, lng) => {
                  setField('latitude', lat);
                  setField('longitude', lng);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
