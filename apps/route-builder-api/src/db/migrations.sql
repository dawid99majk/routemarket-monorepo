CREATE TABLE IF NOT EXISTS route_builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  requirements JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS route_builder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES route_builder_projects(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  current_step VARCHAR(100) NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  human_message TEXT,
  missing_inputs JSONB DEFAULT '[]'::jsonb,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_builder_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES route_builder_projects(id) ON DELETE CASCADE,
  artifact_type VARCHAR(100) NOT NULL,
  file_path VARCHAR(255),
  content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
