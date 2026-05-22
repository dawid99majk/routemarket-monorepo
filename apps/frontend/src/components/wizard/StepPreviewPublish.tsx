import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileText, Loader2, Globe, Download } from 'lucide-react';
import RouteQualityMeter from '@/components/RouteQualityMeter';
import { calculateRouteQuality } from '@/lib/categories';
import { supabase } from '@/integrations/supabase/client';
import { openSignedPdf } from '@/lib/open-signed-pdf';
import { toast } from 'sonner';
import type { WizardState } from '@/hooks/use-wizard-state';

const DECLARATION_KEYS = [
  'creator_declarations.copyright',
  'creator_declarations.no_infringement',
  'creator_declarations.accuracy',
  'creator_declarations.terrain_changes',
  'creator_declarations.terms_accept',
] as const;

const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
];

interface Props {
  state: WizardState;
  setField: (field: string, value: any) => void;
}

export default function StepPreviewPublish({ state, setField }: Props) {
  const { t } = useTranslation();
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [pdfFileKey, setPdfFileKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const quality = calculateRouteQuality({
    title: state.title,
    description: state.description,
    cover_image_key: state.imagePreviews.length > 0 ? 'has' : null,
    gpx_file_key: state.gpxFile || state.gpxFileKey ? 'has' : null,
    pdf_file_key: 'auto-generated',
    distance_km: state.distanceKm ? parseFloat(state.distanceKm) : null,
    elevation_gain_m: state.elevationGain ? parseInt(state.elevationGain) : null,
    difficulty: state.difficulty,
    location_string: state.locationString,
    subcategory: state.subCategory.length > 0 ? state.subCategory.join(', ') : null,
    season: state.season.length > 0 ? state.season.join(',') : null,
    surface_type: state.surfaceType,
    start_point: state.startPoint,
    end_point: state.endPoint,
    imageCount: state.imagePreviews.length,
  });

  const allDeclarationsChecked = state.declarations.every(Boolean);
  const toggleAll = (checked: boolean) => {
    setField('declarations', state.declarations.map(() => checked));
  };

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handlePreviewPdf = async () => {
    if (!state.routeId) {
      toast.error('Zapisz szkic przed generowaniem podglądu PDF');
      return;
    }
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { route_id: state.routeId, language_code: 'pl' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPdfFileKey(data?.file_key || null);
      setPdfGenerated(true);
      toast.success('Podgląd PDF wygenerowany');
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się wygenerować PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfFileKey) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('pdf-guides')
        .createSignedUrl(pdfFileKey, 300);
      if (error) throw error;
      if (data?.signedUrl) {
        await openSignedPdf(data.signedUrl, `${state.title || 'podglad-trasy'}.pdf`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się pobrać pliku');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step7.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('wizard.step7.subtitle')}</p>
      </div>

      {/* PDF Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-blue-900">{t('wizard.step7.pdf_notice_title')}</p>
          <p className="text-sm text-blue-700 mt-1">{t('wizard.step7.pdf_notice_body')}</p>
          {state.routeId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handlePreviewPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
              {pdfGenerated ? t('wizard.step7.pdf_regenerate') : t('wizard.step7.pdf_generate')}
            </Button>
          )}
          {pdfGenerated && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {t('wizard.step7.pdf_generated')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloading || !pdfFileKey}
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                {t('wizard.step7.pdf_download')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Language translations */}
      <div className="bg-card rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4" /> {t('wizard.step7.translations_title')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">{t('wizard.step7.translations_body')}</p>
        <div className="flex flex-wrap gap-2">
          {TRANSLATION_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => toggleLanguage(lang.code)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5 ${
                selectedLanguages.includes(lang.code)
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
              }`}
            >
              <span>{lang.flag}</span> {lang.name}
            </button>
          ))}
        </div>
      </div>

      {/* Quality Score */}
      <div className="bg-card rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-3">{t('wizard.step7.quality_title')}</h3>
        <RouteQualityMeter quality={quality} />
      </div>

      {/* Route summary */}
      <div className="bg-card rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-3">{t('wizard.step7.summary_title')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.title')}:</span> <span className="font-medium">{state.title || '—'}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.distance')}:</span> <span className="font-medium">{state.distanceKm ? `${state.distanceKm} km` : '—'}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.elevation')}:</span> <span className="font-medium">{state.elevationGain ? `${state.elevationGain} m` : '—'}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.difficulty')}:</span> <span className="font-medium">{state.difficulty || '—'}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.price')}:</span> <span className="font-medium">{state.price ? `${state.price} ${state.currency}` : '—'}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.photos')}:</span> <span className="font-medium">{state.imagePreviews.length}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.pois')}:</span> <span className="font-medium">{state.pois.length}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.recommendations')}:</span> <span className="font-medium">{state.recommendations.length}</span></div>
          <div><span className="text-muted-foreground">{t('wizard.step7.summary.risk')}:</span> <span className="font-medium">{state.riskLevel || '—'}</span></div>
        </div>
      </div>

      {/* Declarations */}
      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-semibold">{t('wizard.step7.declarations_title')}</h3>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pb-2 border-b border-border">
          <Checkbox checked={allDeclarationsChecked} onCheckedChange={(checked) => toggleAll(!!checked)} />
          {t('wizard.step7.declarations_check_all')}
        </label>
        {DECLARATION_KEYS.map((key, i) => (
          <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={state.declarations[i]}
              onCheckedChange={(checked) => {
                const next = [...state.declarations];
                next[i] = !!checked;
                setField('declarations', next);
              }}
              className="mt-0.5"
            />
            <span>{t(key)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
