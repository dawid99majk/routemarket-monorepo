import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRouteById } from '@/hooks/use-routes';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Map as MapIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from 'react-i18next';
import { validatePublish } from '@/lib/wizard-validation';
import { normalizePreviewTrack } from '@/lib/track-utils';

import WizardLayout from '@/components/wizard/WizardLayout';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';
import StepGpxBasics from '@/components/wizard/StepGpxBasics';
import StepParameters from '@/components/wizard/StepParameters';
import StepDescriptionPhotos from '@/components/wizard/StepDescriptionPhotos';
import StepPOI from '@/components/wizard/StepPOI';
import StepTipsRecommendations from '@/components/wizard/StepTipsRecommendations';
import StepSafety from '@/components/wizard/StepSafety';
import StepPreviewPublish from '@/components/wizard/StepPreviewPublish';
import { useWizardState } from '@/hooks/use-wizard-state';

const TOTAL_STEPS = 7;

export default function EditRoute() {
  const { id } = useParams<{ id: string }>();
  const routeId = id ? parseInt(id) : undefined;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isCreator } = useAuth();
  const queryClient = useQueryClient();
  const { data: existingRoute, isLoading } = useRouteById(routeId);
  const [initialized, setInitialized] = useState(false);

  const { state, dispatch, setField, setStep, saveDraft } = useWizardState(user?.id);

  // Pre-fill wizard from existing route
  useEffect(() => {
    if (!existingRoute || initialized) return;
    try {
    dispatch({ type: 'SET_ROUTE_ID', id: existingRoute.id });
    setField('title', existingRoute.title || '');
    setField('description', existingRoute.description || '');
    setField('price', String(existingRoute.price || 0));
    setField('isFree', Number(existingRoute.price) === 0);
    setField('currency', (existingRoute as any).currency || 'PLN');
    setField('categoryId', existingRoute.category_id ? String(existingRoute.category_id) : '');
    setField('locationString', existingRoute.location_string || '');
    setField('latitude', existingRoute.latitude || 0);
    setField('longitude', existingRoute.longitude || 0);
    setField('distanceKm', existingRoute.distance_km ? String(existingRoute.distance_km) : '');
    setField('elevationGain', existingRoute.elevation_gain_m ? String(existingRoute.elevation_gain_m) : '');
    setField('estimatedTime', existingRoute.estimated_time_h ? String(existingRoute.estimated_time_h) : '');
    setField('difficulty', existingRoute.difficulty || '');
    setField('surfaceType', existingRoute.surface_type || '');
    setField('season', existingRoute.season ? existingRoute.season.split(',') : []);
    setField('loopType', existingRoute.loop_type || '');
    setField('startPoint', existingRoute.start_point || '');
    setField('endPoint', existingRoute.end_point || '');
    setField('subCategory', (existingRoute as any).subcategory ? (existingRoute as any).subcategory.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    setField('duration', (existingRoute as any).duration || '');
    setField('routeType', (existingRoute as any).route_type || '');
    setField('budget', (existingRoute as any).budget || '');
    setField('audience', Array.isArray((existingRoute as any).audience) ? (existingRoute as any).audience : []);
    setField('tags', Array.isArray((existingRoute as any).tags) ? (existingRoute as any).tags.join(', ') : '');
    setField('petsFriendly', (existingRoute as any).pets_friendly ?? false);
    setField('aiAssisted', (existingRoute as any).ai_assisted ?? false);
    setField('riskLevel', (existingRoute as any).risk_level || '');
    setField('knownHazards', Array.isArray((existingRoute as any).known_hazards) ? (existingRoute as any).known_hazards.join('\n') : '');
    setField('requiredEquipment', Array.isArray((existingRoute as any).required_equipment) ? (existingRoute as any).required_equipment.join('\n') : '');
    setField('lastVerifiedAt', (existingRoute as any).last_verified_at ? (existingRoute as any).last_verified_at.split('T')[0] : '');
    setField('dataConfidence', (existingRoute as any).data_confidence || '');
    setField('instagramUrl', (existingRoute as any).instagram_url || '');
    setField('youtubeUrl', (existingRoute as any).youtube_url || '');
    setField('gpxFileKey', (existingRoute as any).gpx_file_key || null);

    // Reconstruct gpxParsed from saved preview_track + metrics so the GPX step shows "loaded".
    const previewTrack = normalizePreviewTrack((existingRoute as any).preview_track);
    if ((existingRoute as any).gpx_file_key && previewTrack.length >= 2) {
      const lats = previewTrack.map((p) => p[0]);
      const lngs = previewTrack.map((p) => p[1]);
      const first = previewTrack[0];
      const last = previewTrack[previewTrack.length - 1];
      setField('gpxParsed', {
        distance_km: existingRoute.distance_km ?? 0,
        elevation_gain_m: existingRoute.elevation_gain_m ?? 0,
        estimated_time_h: existingRoute.estimated_time_h ?? 0,
        latitude: existingRoute.latitude ?? first[0],
        longitude: existingRoute.longitude ?? first[1],
        start_point: existingRoute.start_point || `${first[0].toFixed(5)}, ${first[1].toFixed(5)}`,
        end_point: existingRoute.end_point || `${last[0].toFixed(5)}, ${last[1].toFixed(5)}`,
        bounds: {
          minLat: Math.min(...lats), maxLat: Math.max(...lats),
          minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
        },
        trackPoints: previewTrack,
      });
    }

    // Load full (post-purchase) description from protected table.
    supabase
      .from('route_private_details')
      .select('full_description')
      .eq('route_id', existingRoute.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_description) setField('fullDescription', data.full_description);
      })
      .then(undefined, (err) => console.warn('private details load failed', err));

    // Load POIs, tips, recommendations
    const loadRelated = async () => {
      try {
      const [poisRes, tipsRes, recsRes] = await Promise.all([
        supabase.from('route_pois').select('*').eq('route_id', existingRoute.id).order('sort_order'),
        supabase.from('route_tips').select('*').eq('route_id', existingRoute.id).order('sort_order'),
        supabase.from('route_recommendations').select('*').eq('route_id', existingRoute.id).order('sort_order'),
      ]);
      if (poisRes.data?.length) {
        dispatch({ type: 'SET_POIS', pois: poisRes.data.map((p: any) => ({
          id: p.id, name: p.name, type: p.type, lat: p.lat, lng: p.lng,
          description: p.description, fun_fact: p.fun_fact || '', photo_keys: p.photo_keys || [], sort_order: p.sort_order,
        }))});
      }
      if (tipsRes.data?.length) {
        dispatch({ type: 'SET_TIPS', tips: tipsRes.data.map((t: any) => ({
          id: t.id, category: t.category, content: t.content, sort_order: t.sort_order,
        }))});
      }
      if (recsRes.data?.length) {
        dispatch({ type: 'SET_RECOMMENDATIONS', recs: recsRes.data.map((r: any) => ({
          id: r.id, name: r.name, description: r.description || '', what_to_order: r.what_to_order || '',
          price_range: r.price_range || 'mid-range', photo_key: r.photo_key || '', sort_order: r.sort_order,
        }))});
      }
      } catch (err) { console.warn('related load failed', err); }
    };
    loadRelated();

    // Load existing images as previews
    const loadImages = async () => {
      try {
      const { data: images } = await supabase
        .from('route_images').select('image_key, sort_order')
        .eq('route_id', existingRoute.id).order('sort_order');
      if (images?.length) {
        const previews = images.map((img: any) => {
          const { data } = supabase.storage.from('route-covers').getPublicUrl(img.image_key);
          return data.publicUrl;
        });
        setField('imagePreviews', previews);
        setField('imageKeys', images.map((img: any) => img.image_key));
      }
      } catch (err) { console.warn('images load failed', err); }
    };
    loadImages();

    setInitialized(true);
    } catch (err) {
      console.error('[EditRoute] init failed', err);
      setInitialized(true);
    }
  }, [existingRoute, initialized, dispatch, setField]);

  const canAdvance = true;

  const handleNext = useCallback(async () => {
    if (state.currentStep < TOTAL_STEPS) {
      await saveDraft(true);
      setStep(state.currentStep + 1);
    } else {
      await handlePublish();
    }
  }, [state.currentStep, saveDraft, setStep]);

  const handleBack = useCallback(() => {
    if (state.currentStep > 1) setStep(state.currentStep - 1);
  }, [state.currentStep, setStep]);

  const handleStepClick = useCallback((step: number) => {
    if (step < state.currentStep) setStep(step);
  }, [state.currentStep, setStep]);

  const handlePublish = async () => {
    if (!user || !routeId) return;
    // Guard against double-submission (auto-save + click, double click, etc.)
    if (state.saving) return;
    const missing = validatePublish(state);
    if (missing.length > 0) {
      toast.error('Aby opublikować trasę, uzupełnij:', {
        description: missing.map((m) => `• ${m.label}`).join('\n'),
        duration: 8000,
      });
      return;
    }

    dispatch({ type: 'SET_SAVING', saving: true });
    try {
      // First persist all draft data (GPX upload, image upload, image order, fields).
      dispatch({ type: 'SET_SAVING', saving: false });
      await saveDraft(true);
      dispatch({ type: 'SET_SAVING', saving: true });

      // Then flip status to published.
      const { error } = await supabase
        .from('routes')
        .update({ status: 'published' })
        .eq('id', routeId);
      if (error) throw error;

      // Rebuild POIs
      await supabase.from('route_pois').delete().eq('route_id', routeId);
      if (state.pois.length > 0) {
        await supabase.from('route_pois').insert(
          state.pois.map((poi, i) => ({
            route_id: routeId, name: poi.name, type: poi.type,
            lat: poi.lat, lng: poi.lng, description: poi.description,
            fun_fact: poi.fun_fact || null, photo_keys: poi.photo_keys, sort_order: i,
          }))
        );
      }

      // Rebuild tips
      await supabase.from('route_tips').delete().eq('route_id', routeId);
      if (state.tips.length > 0) {
        await supabase.from('route_tips').insert(
          state.tips.filter(t => t.content.trim()).map((tip, i) => ({
            route_id: routeId, category: tip.category, content: tip.content, sort_order: i,
          }))
        );
      }

      // Rebuild recommendations
      await supabase.from('route_recommendations').delete().eq('route_id', routeId);
      if (state.recommendations.length > 0) {
        await supabase.from('route_recommendations').insert(
          state.recommendations.filter(r => r.name.trim()).map((rec, i) => ({
            route_id: routeId, name: rec.name, description: rec.description,
            what_to_order: rec.what_to_order, price_range: rec.price_range,
            photo_key: rec.photo_key || null, sort_order: i,
          }))
        );
      }

      // Generate PDF
      try {
        await supabase.functions.invoke('generate-pdf', { body: { route_id: routeId, language_code: 'pl' } });
      } catch { /* non-blocking */ }

      // Re-translate: drop existing auto-translations and regenerate for all 8 languages
      try {
        await supabase
          .from('route_translations')
          .delete()
          .eq('route_id', routeId)
          .eq('is_auto_translated', true);
      } catch { /* non-blocking */ }
      supabase.functions.invoke('auto-translate-route', {
        body: { route_id: routeId, source_language: 'pl' },
      }).catch((err) => console.warn('auto-translate-route failed:', err));

      queryClient.invalidateQueries({ queryKey: ['routes'] });
      queryClient.invalidateQueries({ queryKey: ['route', routeId] });
      trackEvent({ event: 'route_updated', routeId, userId: user.id });
      toast.success('Trasa zaktualizowana! 🎉');
      navigate(`/route/${routeId}`);
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się zaktualizować trasy');
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!existingRoute || existingRoute.user_id !== user?.id) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <MapIcon className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">Nie masz dostępu do edycji tej trasy</h2>
        <Button variant="outline" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4 mr-2" /> Strona główna</Button>
      </div>
    );
  }

  const renderStep = () => {
    switch (state.currentStep) {
      case 1: return <StepGpxBasics state={state} setField={setField} />;
      case 2: return <StepParameters state={state} setField={setField} />;
      case 3: return <StepDescriptionPhotos state={state} setField={setField} />;
      case 4: return <StepPOI state={state} dispatch={dispatch} />;
      case 5: return <StepTipsRecommendations state={state} dispatch={dispatch} setField={setField} />;
      case 6: return <StepSafety state={state} setField={setField} />;
      case 7: return <StepPreviewPublish state={state} setField={setField} />;
      default: return null;
    }
  };

  return (
    <RouteErrorBoundary>
    <WizardLayout
      currentStep={state.currentStep}
      totalSteps={TOTAL_STEPS}
      saving={state.saving}
      lastSavedAt={state.lastSavedAt}
      onBack={handleBack}
      onNext={handleNext}
      onSaveDraft={() => saveDraft(false)}
      onStepClick={handleStepClick}
      canAdvance={canAdvance}
    >
      {renderStep()}
    </WizardLayout>
    </RouteErrorBoundary>
  );
}
