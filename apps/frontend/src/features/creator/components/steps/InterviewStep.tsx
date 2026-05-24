import { Card, CardContent } from '@/components/ui/card';
import { AtlasInterviewWizard } from '@/components/atlas/AtlasInterviewWizard';
import { Project } from '@/features/creator/types/creator.types';
import { Proposal } from '@/components/atlas/AtlasInterviewWizard';

interface InterviewStepProps {
  project: Project;
  onComplete: (proposal: Proposal, answers: Array<{ q: string; a: string }>) => void | Promise<void>;
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
          initialContext={{
            topic: project.title,
            category: project.category,
            region: project.region,
          }}
          onComplete={onComplete}
        />
      </CardContent>
    </Card>
  );
}
