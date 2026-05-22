import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/use-routes';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from 'react-i18next';
import { validatePublish } from '@/lib/wizard-validation';

import WizardLayout from '@/components/wizard/WizardLayout';
import StepGpxBasics from '@/components/wizard/StepGpxBasics';
import StepParameters from '@/components/wizard/StepParameters';
import StepDescriptionPhotos from '@/components/wizard/StepDescriptionPhotos';
import StepPOI from '@/components/wizard/StepPOI';
import StepTipsRecommendations from '@/components/wizard/StepTipsRecommendations';
import StepSafety from '@/components/wizard/StepSafety';
import StepPreviewPublish from '@/components/wizard/StepPreviewPublish';
import { useWizardState } from '@/hooks/use-wizard-state';

const TOTAL_STEPS = 7;

export default function CreateRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isCreator } = useAuth();
  const queryClient = useQueryClient();

  const { state, dispatch, setField, setStep, saveDraft } = useWizardState(user?.id);

  // Drafts can advance freely; publish-time validation enforces required fields.
  const canAdvance = true;

  const handleNext = useCallback(async () => {
    if (state.currentStep < TOTAL_STEPS) {
      await saveDraft(true);
      setStep(state.currentStep + 1);
    } else {
      // Publish
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
    if (!user) return;
    const missing = validatePublish(state);
    if (missing.length > 0) {
      toast.error('Aby opublikować trasę, uzupełnij:', {
        description: missing.map((m) => `• ${m.label}`).join('\n'),
        duration: 8000,
      });
      return;
    }

    trackEvent({ event: 'publish_attempted', userId: user.id });
    try {
      // Persist GPX, images, all fields and route_images via shared saveDraft.
      await saveDraft(true);
      const routeId = state.routeId;
      if (!routeId) throw new Error('Nie udało się utworzyć szkicu trasy');

      dispatch({ type: 'SET_SAVING', saving: true });

      // Flip to published.
      const { error } = await supabase
        .from('routes')
        .update({ status: 'published' })
        .eq('id', routeId);
      if (error) throw error;

      // Insert POIs
      if (routeId && state.pois.length > 0) {
        await supabase.from('route_pois').insert(
          state.pois.map((poi, i) => ({
            route_id: routeId!,
            name: poi.name,
            type: poi.type,
            lat: poi.lat,
            lng: poi.lng,
            description: poi.description,
            fun_fact: poi.fun_fact || null,
            photo_keys: poi.photo_keys,
            sort_order: i,
          }))
        );
      }

      // Insert tips
      if (routeId && state.tips.length > 0) {
        await supabase.from('route_tips').insert(
          state.tips.filter(t => t.content.trim()).map((tip, i) => ({
            route_id: routeId!,
            category: tip.category,
            content: tip.content,
            sort_order: i,
          }))
        );
      }

      // Insert recommendations
      if (routeId && state.recommendations.length > 0) {
        await supabase.from('route_recommendations').insert(
          state.recommendations.filter(r => r.name.trim()).map((rec, i) => ({
            route_id: routeId!,
            name: rec.name,
            description: rec.description,
            what_to_order: rec.what_to_order,
            price_range: rec.price_range,
            photo_key: rec.photo_key || null,
            sort_order: i,
          }))
        );
      }

      // Creator declarations
      const DECLARATION_KEYS = [
        'creator_declarations.copyright',
        'creator_declarations.no_infringement',
        'creator_declarations.accuracy',
        'creator_declarations.terrain_changes',
        'creator_declarations.terms_accept',
      ];
      await supabase.from('creator_declarations').insert({
        user_id: user.id,
        route_id: routeId!,
        terms_version: '1.0',
        declarations: DECLARATION_KEYS.map((key, i) => ({
          index: i,
          text: t(key),
          accepted: state.declarations[i],
        })),
      });

      queryClient.invalidateQueries({ queryKey: ['routes'] });
      trackEvent({ event: 'route_published', routeId: routeId!, userId: user.id });

      // Fire-and-forget auto-translation to all 8 supported languages
      supabase.functions.invoke('auto-translate-route', {
        body: { route_id: routeId, source_language: 'pl' },
      }).catch((err) => console.warn('auto-translate-route failed:', err));

      toast.success('Trasa opublikowana! 🎉');
      navigate('/creator-dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się opublikować trasy');
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  };

  if (!user || !isCreator) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <MapIcon className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">
          {!user ? 'Zaloguj się, aby tworzyć trasy' : 'Musisz być twórcą, aby dodać trasę'}
        </h2>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Strona główna
        </Button>
      </div>
    );
  }

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <StepGpxBasics state={state} setField={setField} />;
      case 2:
        return <StepParameters state={state} setField={setField} />;
      case 3:
        return <StepDescriptionPhotos state={state} setField={setField} />;
      case 4:
        return <StepPOI state={state} dispatch={dispatch} />;
      case 5:
        return <StepTipsRecommendations state={state} dispatch={dispatch} setField={setField} />;
      case 6:
        return <StepSafety state={state} setField={setField} />;
      case 7:
        return <StepPreviewPublish state={state} setField={setField} />;
      default:
        return null;
    }
  };

  return (
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
  );
}
