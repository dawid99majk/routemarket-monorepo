-- Route Builder v2 Tables
CREATE TABLE IF NOT EXISTS route_builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
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
  artifact_type VARCHAR(100) NOT NULL, -- 'gpx', 'report', 'places', 'summary'
  file_path VARCHAR(255),
  content JSONB, -- For JSON artifacts like places.json
  raw_data TEXT, -- For GPX or Markdown
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_route_builder_projects_user_id ON route_builder_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_route_builder_jobs_project_id ON route_builder_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_route_builder_artifacts_project_id ON route_builder_artifacts(project_id);

-- Enable RLS
ALTER TABLE route_builder_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_builder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_builder_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Simplistic: owner can read/write)
-- Note: In a production environment, you'd want more granular control, 
-- but these provide a starting point.
CREATE POLICY "Users can manage their own projects" 
ON route_builder_projects FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view jobs for their projects" 
ON route_builder_jobs FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM route_builder_projects 
  WHERE route_builder_projects.id = route_builder_jobs.project_id 
  AND route_builder_projects.user_id = auth.uid()
));

CREATE POLICY "Users can view artifacts for their projects" 
ON route_builder_artifacts FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM route_builder_projects 
  WHERE route_builder_projects.id = route_builder_artifacts.project_id 
  AND route_builder_projects.user_id = auth.uid()
));

-- Service role access (for backend)
CREATE POLICY "Service role has full access to projects" ON route_builder_projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access to jobs" ON route_builder_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access to artifacts" ON route_builder_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
