import { useState } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AiSuggestButtonProps {
  field: string;
  routeData: Record<string, any>;
  onAccept: (value: any) => void;
  label?: string;
}

export default function AiSuggestButton({ field, routeData, onAccept, label = 'AI' }: AiSuggestButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-suggestion', {
        body: { field, route_data: routeData },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data);
      setOpen(true);
    } catch (err: any) {
      if (err.message?.includes('Rate limited') || err.message?.includes('429')) {
        toast.error(t('wizard.ai.rate_limit'));
      } else if (err.message?.includes('credits') || err.message?.includes('402')) {
        toast.error(t('wizard.ai.no_credits'));
      } else {
        toast.error(t('wizard.ai.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    onAccept(suggestion);
    setOpen(false);
    setSuggestion(null);
  };

  const handleReject = () => {
    setOpen(false);
    setSuggestion(null);
  };

  const displayValue = suggestion
    ? field === 'poi_suggestions'
      ? `${suggestion.pois?.length || 0} POI`
      : suggestion.suggestion || suggestion.reasoning || JSON.stringify(suggestion)
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleGenerate}
          disabled={loading}
          className="h-7 px-2 text-xs gap-1 text-accent hover:text-accent-foreground"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {label}
        </Button>
      </PopoverTrigger>
      {suggestion && (
        <PopoverContent className="w-80 p-3" align="start">
          <p className="text-xs text-muted-foreground mb-2">{t('wizard.ai.suggestion')}</p>
          <div className="text-sm bg-muted/50 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {displayValue}
          </div>
          {suggestion.reasoning && (
            <p className="text-xs text-muted-foreground mt-2 italic">{suggestion.reasoning}</p>
          )}
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAccept}>
              <Check className="w-3 h-3 mr-1" /> {t('wizard.ai.accept')}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={handleReject}>
              <X className="w-3 h-3 mr-1" /> {t('wizard.ai.reject')}
            </Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
