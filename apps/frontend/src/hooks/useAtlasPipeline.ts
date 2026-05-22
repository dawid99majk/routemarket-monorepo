import { useState } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { toast } from 'sonner';

export function useAtlasPipeline() {
  const { invokeAtlas } = useAtlasApi();
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState('');

  const runPipeline = async (slug: string, callback?: () => Promise<void>) => {
    setRunning(true);
    setStatusText('AI rozpoczyna przetwarzanie. Prowadzenie badań i generowanie trasy (do 90 sekund)...');
    try {
      await invokeAtlas('run_mvp2', { slug });
      toast.success('Przetwarzanie zakończone pomyślnie!');
      if (callback) await callback();
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas uruchamiania potoku: ' + (err as Error).message);
    } finally {
      setRunning(false);
      setStatusText('');
    }
  };

  const approveStage = async (slug: string, stage: string, decision: 'approved' | 'rejected' = 'approved') => {
    try {
      await invokeAtlas('approve_stage', {
        slug,
        stage,
        decision,
        reviewer: 'Creator Studio',
        notes: 'Approved through Creator Studio UI'
      });
      toast.success(`Etap ${stage} został zatwierdzony.`);
      await runPipeline(slug);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas zatwierdzania etapu: ' + (err as Error).message);
    }
  };

  return {
    running,
    statusText,
    runPipeline,
    approveStage
  };
}
