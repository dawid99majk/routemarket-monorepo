-- Route Builder durable worker bookkeeping.
-- These fields let the API claim queued jobs, recover stale running jobs after a restart,
-- and keep enough attempt metadata for troubleshooting.

ALTER TABLE route_builder_jobs
ADD COLUMN IF NOT EXISTS locked_by TEXT,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_route_builder_jobs_queue
ON route_builder_jobs(status, created_at)
WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_route_builder_jobs_stale_running
ON route_builder_jobs(status, locked_at)
WHERE status = 'running';

UPDATE route_builder_jobs
SET status = 'queued',
    current_step = 'retrying',
    progress = 0,
    human_message = 'Zadanie wznowione po wdrożeniu workera.',
    locked_by = NULL,
    locked_at = NULL,
    updated_at = NOW()
WHERE status = 'running'
  AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '15 minutes');
