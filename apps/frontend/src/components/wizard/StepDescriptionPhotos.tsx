import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Image as ImageIcon, Upload, X, GripVertical, Instagram, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import AiSuggestButton from './AiSuggestButton';
import type { WizardState } from '@/hooks/use-wizard-state';

interface Props {
  state: WizardState;
  setField: (field: string, value: any) => void;
}

export default function StepDescriptionPhotos({ state, setField }: Props) {
  const { t } = useTranslation();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleImagesUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 6 - state.imagePreviews.length;
    if (remaining <= 0) { toast.error(t('wizard.step3.photos_max')); return; }
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) { toast.error(t('wizard.step3.photo_not_image', { name: file.name })); return; }
      if (file.size > 10 * 1024 * 1024) { toast.error(t('wizard.step3.photo_too_large', { name: file.name })); return; }
    }
    setField('imageFiles', [...state.imageFiles, ...toAdd]);
    setField('imagePreviews', [...state.imagePreviews, ...toAdd.map((f) => URL.createObjectURL(f))]);
    setField('imageKeys', [...state.imageKeys, ...toAdd.map(() => null)]);
  }, [state.imageFiles, state.imagePreviews, state.imageKeys, setField, t]);

  const removeImage = (index: number) => {
    // imageFiles are aligned to null slots only; recompute mapping by null cursor.
    let nullCursor = -1;
    let fileIdxToRemove = -1;
    for (let i = 0; i <= index; i++) {
      if (state.imageKeys[i] === null) {
        nullCursor++;
        if (i === index) fileIdxToRemove = nullCursor;
      }
    }
    if (fileIdxToRemove >= 0) {
      setField('imageFiles', state.imageFiles.filter((_, i) => i !== fileIdxToRemove));
    }
    setField('imagePreviews', state.imagePreviews.filter((_, i) => i !== index));
    setField('imageKeys', state.imageKeys.filter((_, i) => i !== index));
  };

  const handleDragStart = (index: number) => { dragIndexRef.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
  const handleDrop = (targetIndex: number) => {
    const src = dragIndexRef.current;
    if (src === null || src === targetIndex) { dragIndexRef.current = null; setDragOverIndex(null); return; }
    const nextPreviews = [...state.imagePreviews];
    const nextKeys = [...state.imageKeys];
    const [mp] = nextPreviews.splice(src, 1);
    const [mk] = nextKeys.splice(src, 1);
    nextPreviews.splice(targetIndex, 0, mp);
    nextKeys.splice(targetIndex, 0, mk);
    setField('imagePreviews', nextPreviews);
    setField('imageKeys', nextKeys);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const aiRouteData = {
    title: state.title,
    location_string: state.locationString,
    distance_km: state.distanceKm,
    elevation_gain_m: state.elevationGain,
    difficulty: state.difficulty,
    surface_type: state.surfaceType,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step3.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('wizard.step3.subtitle')}</p>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="description">Skrót trasy (publiczny) <span className="text-destructive">*</span></Label>
            <AiSuggestButton
              field="description"
              routeData={aiRouteData}
              onAccept={(data) => setField('description', data.suggestion)}
              label={t('wizard.ai.description')}
            />
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Krótki opis widoczny na karcie trasy i przed zakupem. Maks. 3000 znaków.
          </p>
          <Textarea
            id="description"
            value={state.description}
            onChange={(e) => setField('description', e.target.value.slice(0, 3000))}
            placeholder="Krótki, zachęcający opis trasy widoczny przed zakupem..."
            rows={5}
            maxLength={3000}
          />
          <div className="flex justify-between mt-1">
            {state.description.length < 50 && state.description.length > 0 && (
              <p className="text-xs text-amber-600">{t('wizard.step3.min_chars', { count: state.description.length })}</p>
            )}
            <p className="text-xs text-muted-foreground ml-auto">{state.description.length}/3000</p>
          </div>
        </div>

        <div>
          <Label htmlFor="fullDescription">Pełny opis trasy (po zakupie)</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Szczegółowy opis dostępny dla osób po zakupie i w pliku PDF. Maks. 30 000 znaków.
          </p>
          <Textarea
            id="fullDescription"
            value={state.fullDescription}
            onChange={(e) => setField('fullDescription', e.target.value.slice(0, 30000))}
            placeholder="Opisz dokładnie trasę: punkty kontrolne, charakterystykę odcinków, atrakcje, wskazówki..."
            rows={14}
            maxLength={30000}
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{state.fullDescription.length}/30000</p>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <Label className="flex items-center gap-1"><ImageIcon className="w-4 h-4" /> {t('wizard.step3.photos')} <span className="text-destructive">*</span></Label>
        <p className="text-xs text-muted-foreground">{t('wizard.step3.photos_hint')}</p>

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesUpload} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {state.imagePreviews.map((src, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
              className={`relative group aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all cursor-grab ${
                dragOverIndex === i ? 'border-accent scale-105' : i === 0 ? 'border-accent' : 'border-border'
              }`}
            >
              <img src={src} alt={t('wizard.step3.photo_alt', { n: i + 1 })} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-white drop-shadow" />
              </div>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-medium">{t('wizard.step3.cover')}</span>
              )}
            </div>
          ))}

          {state.imagePreviews.length < 6 && (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="aspect-[4/3] rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-xs">{t('wizard.step3.add_photo')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">{t('wizard.step3.social_title')}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t('wizard.step3.social_subtitle')}</p>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="instagramUrl" className="flex items-center gap-1.5 mb-1">
              <Instagram className="w-4 h-4" /> Instagram
            </Label>
            <Input
              id="instagramUrl"
              type="url"
              value={state.instagramUrl}
              onChange={(e) => setField('instagramUrl', e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
            />
            {state.instagramUrl && !state.instagramUrl.startsWith('https://') && (
              <p className="text-xs text-destructive mt-1">{t('wizard.step3.must_https')}</p>
            )}
          </div>
          <div>
            <Label htmlFor="youtubeUrl" className="flex items-center gap-1.5 mb-1">
              <Youtube className="w-4 h-4" /> YouTube
            </Label>
            <Input
              id="youtubeUrl"
              type="url"
              value={state.youtubeUrl}
              onChange={(e) => setField('youtubeUrl', e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {state.youtubeUrl && !state.youtubeUrl.startsWith('https://') && (
              <p className="text-xs text-destructive mt-1">{t('wizard.step3.must_https')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
