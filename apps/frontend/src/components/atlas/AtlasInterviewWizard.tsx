import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, CheckCircle2, ChevronRight, Loader2, Sparkles, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export type InterviewOption = {
  label: string;
  value: string;
  icon?: string;
};

export type Proposal = {
  id: string;
  title: string;
  description: string;
  highlights: string[];
};

export type InterviewState = {
  status: 'interviewing' | 'proposal' | 'completed';
  question: string;
  hint?: string;
  options: InterviewOption[];
  proposals?: Proposal[];
  summary: string;
};

export interface InitialContext {
  topic: string;
  category: string;
  region: string;
  notes?: string;
  youtubeUrl?: string;
}

export function AtlasInterviewWizard({
  onComplete,
  projectSlug,
  initialContext
}: {
  onComplete: (proposal: Proposal, answers: Array<{ q: string; a: string }>) => void | Promise<void>;
  projectSlug?: string;
  initialContext?: InitialContext;
}) {
  const [answers, setAnswers] = useState<Array<{ q: string; a: string }>>([]);
  const [currentStep, setCurrentStep] = useState<InterviewState | null>(null);
  const [initialTopic, setInitialTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const interviewMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke('atlas-interview', {
        body: payload,
      });
      if (error) throw error;
      return data as InterviewState;
    },
    onSuccess: (data) => {
      setCurrentStep(data);
    },
    onError: (err: any) => {
      toast.error(`Błąd wywiadu AI: ${err.message}`);
    }
  });

  // Auto-start interview if initialContext is provided
  useEffect(() => {
    if (initialContext && !currentStep && !interviewMutation.isPending && !interviewMutation.isSuccess) {
      interviewMutation.mutate({
        project_slug: projectSlug,
        context: {
          topic: initialContext.topic,
          category: initialContext.category,
          region: initialContext.region,
          notes: initialContext.notes || ''
        },
        answers: [],
        youtube_url: initialContext.youtubeUrl || undefined
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContext]);

  const startInterview = () => {
    if (!initialTopic) {
      toast.error('Wpisz krótki pomysł na początek.');
      return;
    }
    interviewMutation.mutate({
      project_slug: projectSlug,
      context: { topic: initialTopic },
      answers: [],
      youtube_url: youtubeUrl || undefined
    });
  };

  const handleAnswer = (option: InterviewOption | string) => {
    const answerLabel = typeof option === 'string' ? option : option.label;
    const newAnswers = [...answers, { q: currentStep?.question || '', a: answerLabel }];
    setAnswers(newAnswers);
    interviewMutation.mutate({
      project_slug: projectSlug,
      context: {
        topic: initialContext?.topic || initialTopic,
        category: initialContext?.category || 'motorcycle',
        region: initialContext?.region || 'Polska',
        notes: initialContext?.notes || ''
      },
      answers: newAnswers,
      youtube_url: initialContext?.youtubeUrl || youtubeUrl || undefined
    });
  };

  const handleBack = () => {
    if (answers.length === 0) return;
    const newAnswers = answers.slice(0, -1);
    setAnswers(newAnswers);
    interviewMutation.mutate({
      project_slug: projectSlug,
      context: {
        topic: initialContext?.topic || initialTopic,
        category: initialContext?.category || 'motorcycle',
        region: initialContext?.region || 'Polska',
        notes: initialContext?.notes || ''
      },
      answers: newAnswers,
      youtube_url: initialContext?.youtubeUrl || youtubeUrl || undefined
    });
  };

  const selectProposal = async (proposal: Proposal) => {
    toast.success(`Wybrano propozycję: ${proposal.title}`);
    await onComplete(proposal, answers);
  };

  // Extract step numbers from summary like "Pytanie 2/5"
  const progressMatch = currentStep?.summary?.match(/(\d+)\/(\d+)/);
  const currentStepNum = progressMatch ? parseInt(progressMatch[1]) : answers.length + 1;
  const totalSteps = progressMatch ? parseInt(progressMatch[2]) : 5;
  const progressPercent = (currentStepNum / totalSteps) * 100;

  // Loading state
  if ((initialContext && interviewMutation.isPending && !currentStep) || (currentStep && interviewMutation.isPending)) {
    return (
      <Card className="p-8 border-primary/20 bg-primary/5 flex flex-col items-center justify-center space-y-4 text-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Atlas analizuje Twoje wybory...</h3>
          <p className="text-sm text-muted-foreground">Dostosowywanie kolejnych kroków wywiadu.</p>
        </div>
      </Card>
    );
  }

  if (!currentStep) {
    return (
      <Card className="p-6 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Zacznij z Atlasem (Szybki Wywiad)</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Wpisz krótki pomysł, a Atlas pomoże Ci podjąć kluczowe decyzje w 60 sekund.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Twój pomysł na wyprawę</label>
            <Input
              placeholder="np. Dolomity, 7 dni, trekking"
              value={initialTopic}
              onChange={(e) => setInitialTopic(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-500" />
              Opcjonalny link YouTube
            </label>
            <Input
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="bg-background"
            />
          </div>
          <Button
            className="w-full h-12 text-lg font-semibold"
            onClick={startInterview}
            disabled={interviewMutation.isPending}
          >
            Rozpocznij planowanie
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-primary/30 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <div className="space-y-6">
        {/* Header & Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <Bot className="h-3 w-3 mr-1.5" />
              Atlas AI
            </Badge>
            <span className="text-xs font-bold text-muted-foreground tracking-widest uppercase">
              {currentStep.summary}
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {currentStep.status === 'interviewing' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold leading-tight tracking-tight text-foreground">{currentStep.question}</h3>
              {currentStep.hint && (
                <p className="text-sm text-muted-foreground italic">{currentStep.hint}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {currentStep.options.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  className="h-auto py-4 px-6 flex justify-between items-center text-left hover:border-primary hover:bg-primary/5 group transition-all duration-200 border-2"
                  onClick={() => handleAnswer(option)}
                  disabled={interviewMutation.isPending}
                >
                  <span className="text-base font-bold flex-1 break-words">{option.label}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => handleAnswer("Zaproponuj najlepszą opcję")}
                disabled={interviewMutation.isPending}
              >
                Nie wiem / zaproponuj
              </Button>
              {answers.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleBack}
                  disabled={interviewMutation.isPending}
                >
                  Cofnij
                </Button>
              )}
            </div>
          </div>
        )}

        {currentStep.status === 'proposal' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-3xl font-black tracking-tighter">GOTOWE!</h3>
              <p className="text-muted-foreground">Przeanalizowałem wszystko. Wybierz fundament swojej trasy.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentStep.proposals?.map((p) => (
                <Card key={p.id} className="p-6 flex flex-col h-full border-2 hover:border-primary transition-all bg-card shadow-sm hover:shadow-xl group">
                  <h4 className="text-xl font-extrabold mb-3 group-hover:text-primary transition-colors">{p.title}</h4>
                  <p className="text-sm text-muted-foreground mb-5 flex-grow leading-relaxed">{p.description}</p>
                  <div className="space-y-2 mb-8">
                    {p.highlights.map((h, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs font-semibold">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span className="truncate">{h}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full h-11 font-bold shadow-lg" onClick={() => selectProposal(p)}>
                    Wybieram
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
