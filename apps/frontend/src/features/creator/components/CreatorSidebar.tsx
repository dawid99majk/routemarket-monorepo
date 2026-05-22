import { PipelineStep } from '@/features/creator/types/creator.types';
import { Button } from '@/components/ui/button';
import { Files, MessageSquare, FileText, Route, Pencil, Image, CheckCircle2 } from 'lucide-react';

interface Step {
  id: PipelineStep;
  label: string;
  icon: any;
}

const steps: Step[] = [
  { id: 'sources', label: '1. Materiały', icon: Files },
  { id: 'interview', label: '2. Wywiad AI', icon: MessageSquare },
  { id: 'outline', label: '3. Konspekt', icon: FileText },
  { id: 'gpx', label: '4. GPX i mapa', icon: Route },
  { id: 'guide', label: '5. Opis', icon: Pencil },
  { id: 'media', label: '6. Media', icon: Image },
  { id: 'publish', label: '7. Publikacja', icon: CheckCircle2 },
];

interface CreatorSidebarProps {
  activeStep: PipelineStep;
  maxAllowedStep: PipelineStep;
  onStepClick: (step: PipelineStep) => void;
}

export function CreatorSidebar({ 
  activeStep, 
  maxAllowedStep, 
  onStepClick 
}: CreatorSidebarProps) {
  const getStepStatus = (stepId: PipelineStep) => {
    const stepOrder: PipelineStep[] = ['sources', 'interview', 'outline', 'gpx', 'guide', 'media', 'publish'];
    const activeIdx = stepOrder.indexOf(activeStep);
    const maxIdx = stepOrder.indexOf(maxAllowedStep);
    const currentIdx = stepOrder.indexOf(stepId);

    if (currentIdx < maxIdx) return 'completed';
    if (currentIdx === activeIdx) return 'active';
    if (currentIdx <= maxIdx) return 'available';
    return 'locked';
  };

  return (
    <div className="flex flex-wrap gap-2 mb-8 p-1 bg-muted/30 rounded-xl border border-border/50">
      {steps.map((step) => {
        const status = getStepStatus(step.id);
        const Icon = step.icon;
        
        return (
          <Button
            key={step.id}
            variant={activeStep === step.id ? 'default' : 'ghost'}
            size="sm"
            disabled={status === 'locked'}
            onClick={() => onStepClick(step.id)}
            className={`gap-2 rounded-lg transition-all duration-300 ${
              activeStep === step.id 
                ? 'shadow-sm' 
                : status === 'completed' 
                  ? 'text-primary hover:text-primary hover:bg-primary/5' 
                  : ''
            }`}
          >
            <Icon className={`w-4 h-4 ${status === 'locked' ? 'opacity-50' : ''}`} />
            <span className="hidden sm:inline">{step.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
