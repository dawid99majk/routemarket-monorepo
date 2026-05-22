import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, CheckCircle2, ChevronRight, Loader2, Play, Sparkles, Youtube } from 'lucide-react';
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
  initialContext 
}: { 
  onComplete: (proposal: Proposal, answers: Array<{ q: string; a: string }>) => void;
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
      context: { topic: initialTopic },
      answers: [],
      youtube_url: youtubeUrl || undefined
    });
  };

  const handleAnswer = (option: InterviewOption) => {
    const newAnswers = [...answers, { q: currentStep?.question || '', a: option.label }];
    setAnswers(newAnswers);
    interviewMutation.mutate({
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

  const selectProposal = (proposal: Proposal) => {
    toast.success(`Wybrano propozycję: ${proposal.title}`);
    onComplete(proposal, answers);
  };

  // Loading state on auto-start
  if (initialContext && interviewMutation.isPending && !currentStep) {
    return (
      <Card className="p-8 border-primary/20 bg-primary/5 flex flex-col items-center justify-center space-y-4 text-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Atlas analizuje Twoje materiały...</h3>
          <p className="text-sm text-muted-foreground">Przygotowywanie spersonalizowanych pytań na podstawie notatek.</p>
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
          <h2 className="text-xl font-bold">Zacznij z Atlasem (Guided Mode)</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Opisz krótko swój pomysł, a Atlas poprowadzi Cię przez resztę za pomocą kilku pytań.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Twój pomysł na wyprawę</label>
            <Input 
              placeholder="np. Dolomity, 7 dni, trekking, nieoczywiste miejsca" 
              value={initialTopic}
              onChange={(e) => setInitialTopic(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-500" />
              Opcjonalny link YouTube (inspiracja)
            </label>
            <Input 
              placeholder="https://www.youtube.com/watch?v=..." 
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="bg-background"
            />
          </div>
          <Button 
            className="w-full" 
            onClick={startInterview}
            disabled={interviewMutation.isPending}
          >
            {interviewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Rozpocznij planowanie
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-primary/30 shadow-lg animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between mb-6">
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
          <Bot className="h-3 w-3 mr-1" />
          Atlas Interview
        </Badge>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {currentStep.summary}
        </span>
      </div>

      {currentStep.status === 'interviewing' && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold leading-tight">{currentStep.question}</h3>
          <div className="flex flex-col gap-3 w-full">
            {currentStep.options.map((option) => (
              <Button 
                key={option.value} 
                variant="outline" 
                className="h-auto py-3.5 px-5 flex justify-between items-center text-left hover:border-primary hover:bg-primary/5 group whitespace-normal w-full"
                onClick={() => handleAnswer(option)}
                disabled={interviewMutation.isPending}
              >
                <span className="font-medium flex-1 pr-3 break-words leading-snug min-w-0">{option.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Button>
            ))}
          </div>
          {interviewMutation.isPending && (
            <div className="flex justify-center pt-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {currentStep.status === 'proposal' && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold">Mamy to! Oto Twoje opcje:</h3>
            <p className="text-muted-foreground">Wybierz bazę, którą Atlas weźmie na warsztat.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentStep.proposals?.map((p) => (
              <Card key={p.id} className="p-5 flex flex-col h-full border-2 hover:border-primary/50 transition-all bg-card">
                <h4 className="text-lg font-bold mb-2">{p.title}</h4>
                <p className="text-sm text-muted-foreground mb-4 flex-grow">{p.description}</p>
                <div className="space-y-2 mb-6">
                  {p.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => selectProposal(p)}>
                  Wybierz tę opcję
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
