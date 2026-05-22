import { Card, CardContent } from '@/components/ui/card';
import { AtlasInterviewWizard } from '@/components/atlas/AtlasInterviewWizard';
import { Project } from '@/features/creator/types/creator.types';

interface InterviewStepProps {
  project: Project;
  onComplete: () => void;
}

export function InterviewStep({
  project,
  onComplete
}: InterviewStepProps) {
  return (
    <Card className="border-primary/20 shadow-token-lg overflow-hidden">
      <CardContent className="p-0">
        <AtlasInterviewWizard 
          projectSlug={project.id} 
          onComplete={onComplete}
        />
      </CardContent>
    </Card>
  );
}
