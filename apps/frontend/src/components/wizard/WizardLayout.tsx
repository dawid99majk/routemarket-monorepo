import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import WizardProgress from './WizardProgress';

interface Props {
  currentStep: number;
  totalSteps: number;
  saving: boolean;
  lastSavedAt: string | null;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onStepClick: (step: number) => void;
  canAdvance: boolean;
  children: ReactNode;
}

export default function WizardLayout({
  currentStep,
  totalSteps,
  saving,
  lastSavedAt,
  onBack,
  onNext,
  onSaveDraft,
  onStepClick,
  canAdvance,
  children,
}: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/creator-dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {t('wizard.header.back')}
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            {lastSavedAt && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {t('wizard.header.saved_at', { time: lastSavedAt })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">{t('wizard.header.save_draft')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-card border-b border-border py-3">
        <div className="max-w-5xl mx-auto px-4">
          <WizardProgress currentStep={currentStep} onStepClick={onStepClick} />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {/* Navigation buttons */}
      <div className="sticky bottom-0 bg-card border-t border-border py-3">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('wizard.nav.back')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('wizard.nav.step_of', { current: currentStep, total: totalSteps })}
          </span>
          <Button onClick={onNext} disabled={saving}>
            {currentStep === totalSteps ? t('wizard.nav.publish') : t('wizard.nav.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
