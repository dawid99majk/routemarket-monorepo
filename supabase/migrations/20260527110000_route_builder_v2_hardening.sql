-- Route Builder v2 hardening.
-- Prevent duplicate artifact rows for the same project/type pair and make lookups faster.

WITH ranked_artifacts AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, artifact_type
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM route_builder_artifacts
)
DELETE FROM route_builder_artifacts
WHERE id IN (
  SELECT id FROM ranked_artifacts WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_builder_artifacts_project_type_unique
ON route_builder_artifacts(project_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_route_builder_jobs_status_updated_at
ON route_builder_jobs(status, updated_at);
