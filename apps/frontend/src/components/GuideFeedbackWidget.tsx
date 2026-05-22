import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { trackEvent } from '@/lib/analytics';

interface Props {
  articleSlug: string;
}

export default function GuideFeedbackWidget({ articleSlug }: Props) {
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleVote = (v: 'yes' | 'no') => {
    setVote(v);
  };

  const handleSubmit = () => {
    trackEvent({
      event: 'guide_helpfulness_submitted',
      metadata: { slug: articleSlug, helpful: vote, comment: comment.trim() || undefined },
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <p className="text-sm font-medium text-foreground">Thank you for your feedback! 🎉</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium text-foreground text-center">Was this guide helpful?</p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => handleVote('yes')}
          className={`min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
            vote === 'yes'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background border-border text-muted-foreground hover:border-primary/40'
          }`}
          aria-label="Yes, this was helpful"
          aria-pressed={vote === 'yes'}
        >
          <ThumbsUp className="w-4 h-4" /> Yes
        </button>
        <button
          onClick={() => handleVote('no')}
          className={`min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
            vote === 'no'
              ? 'bg-destructive/10 border-destructive text-destructive'
              : 'bg-background border-border text-muted-foreground hover:border-destructive/40'
          }`}
          aria-label="No, this was not helpful"
          aria-pressed={vote === 'no'}
        >
          <ThumbsDown className="w-4 h-4" /> No
        </button>
      </div>
      {vote && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any suggestions? (optional)"
            className="text-sm min-h-[60px] resize-none"
            maxLength={500}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSubmit} className="min-h-[44px]">
              <Send className="w-3.5 h-3.5 mr-1" /> Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
