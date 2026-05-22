import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const STEP_NUMS = [1, 2, 3, 4, 5, 6, 7] as const;

interface Props {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function WizardProgress({ currentStep, onStepClick }: Props) {
  const { t } = useTranslation();
  const STEPS = STEP_NUMS.map((num) => ({ num, label: t(`wizard.progress.step_${num}`) }));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center justify-between min-w-[600px] px-2">
        {STEPS.map((step, i) => {
          const isCompleted = currentStep > step.num;
          const isCurrent = currentStep === step.num;
          const canClick = step.num < currentStep;

          return (
            <div key={step.num} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => canClick && onStepClick?.(step.num)}
                disabled={!canClick}
                className={cn(
                  'flex flex-col items-center gap-1 transition-colors',
                  canClick && 'cursor-pointer hover:opacity-80',
                  !canClick && !isCurrent && 'cursor-default'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                    isCompleted && 'bg-green-500 border-green-500 text-white',
                    isCurrent && 'bg-accent border-accent text-accent-foreground',
                    !isCompleted && !isCurrent && 'bg-muted border-border text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : step.num}
                </div>
                <span
                  className={cn(
                    'text-xs whitespace-nowrap',
                    isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mt-[-16px]',
                    currentStep > step.num ? 'bg-green-500' : 'bg-border'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
