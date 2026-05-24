import { useState, useCallback, useRef } from 'react';
import { useAtlasApi } from './useAtlasApi';
import { toast } from 'sonner';

export type JobStatus = 'queued' | 'pending' | 'running' | 'waiting_for_approval' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  message?: string;
  currentStep?: string;
  pendingApprovalContext?: any;
  result?: any;
}

export function useAtlasWorkflow() {
  const { invokeAtlas } = useAtlasApi();
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentJob, setCurrentJob] = useState<Job | null>(null);

  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string, onComplete?: () => Promise<void>) => {
    stopPolling();

    const tick = async () => {
      try {
        const data = await invokeAtlas('get_job', { jobId }) as { job: Job };
        const job = data.job;
        setCurrentJob(job);
        setStatusText(job.message || `Przetwarzanie: ${job.progress}%`);

        if (job.status === 'completed') {
          stopPolling();
          setRunning(false);
          toast.success('Przetwarzanie zakończone!');
          if (onComplete) await onComplete();
        } else if (job.status === 'failed') {
          stopPolling();
          setRunning(false);
          toast.error(job.message || 'Przetwarzanie nie powiodło się.');
        } else if (job.status === 'waiting_for_approval') {
          stopPolling();
          setRunning(false);
          toast.info('Projekt wymaga Twojego zatwierdzenia.');
          if (onComplete) await onComplete();
        }
      } catch (err) {
        console.error('Job polling error:', err);
      }
    };

    await tick();
    pollIntervalRef.current = window.setInterval(tick, 2500);
  }, [invokeAtlas, stopPolling]);

  const findProjectJob = useCallback(async (slug: string, stage?: string) => {
    const data = await invokeAtlas('get_project_jobs', { slug }) as { jobs?: Job[] };
    const jobs = data.jobs ?? [];
    return jobs.find((job: any) => {
      if (!['queued', 'pending', 'running', 'waiting_for_approval'].includes(job.status)) return false;
      if (!stage) return true;
      return job.waitingForStage === stage || job.currentStep === stage || job.pendingApprovalContext?.stage === stage;
    }) ?? null;
  }, [invokeAtlas]);

  const runPipeline = async (slug: string, onComplete?: () => Promise<void>) => {
    setRunning(true);
    setStatusText('Inicjalizacja AI...');
    try {
      const data = await invokeAtlas('start_run_mvp2_job', { slug }) as { job: Job };
      setCurrentJob(data.job);
      await pollJob(data.job.id, onComplete);
    } catch (err) {
      console.error(err);
      try {
        const existing = await findProjectJob(slug);
        if (existing) {
          setCurrentJob(existing);
          await pollJob(existing.id, onComplete);
          return;
        }
      } catch (recoverErr) {
        console.error('Failed to recover existing Atlas job:', recoverErr);
      }
      toast.error('Błąd podczas uruchamiania: ' + (err as Error).message);
      setRunning(false);
    }
  };

  const approveJob = async (jobId: string, approvalData: any = {}, onComplete?: () => Promise<void>) => {
    setRunning(true);
    setStatusText('Zatwierdzanie...');
    try {
      await invokeAtlas('approve_job', { jobId, approvalData });
      toast.success('Zatwierdzono. Kontynuacja prac AI...');
      await pollJob(jobId, onComplete);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas zatwierdzania: ' + (err as Error).message);
      setRunning(false);
    }
  };

  const approveStage = async (slug: string, stage: string, onComplete?: () => Promise<void>, decision: 'approved' | 'rejected' = 'approved') => {
    try {
      const waitingJob = await findProjectJob(slug, stage);
      if (waitingJob && waitingJob.status === 'waiting_for_approval') {
        await approveJob(waitingJob.id, { stage, decision }, onComplete);
        return;
      }

      setRunning(true);
      setStatusText('Zatwierdzanie etapu...');
      await invokeAtlas('approve_stage', {
        slug,
        stage,
        decision,
        reviewer: 'Creator Studio',
        notes: 'Approved through Creator Studio UI'
      });
      toast.success(`Etap ${stage} został zatwierdzony.`);
      await runPipeline(slug, onComplete);
    } catch (err) {
      console.error(err);
      toast.error('Błąd podczas zatwierdzania etapu: ' + (err as Error).message);
      setRunning(false);
    }
  };

  return {
    running,
    statusText,
    currentJob,
    runPipeline,
    approveJob,
    approveStage,
    invokeAtlas
  };
}
