-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

CREATE TABLE IF NOT EXISTS public.video_projects (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name         TEXT        NOT NULL,
  file_url          TEXT        NOT NULL,
  file_size         BIGINT      NOT NULL DEFAULT 0,
  duration_seconds  INTEGER     NULL,
  status            TEXT        NOT NULL DEFAULT 'uploaded',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table already exists, add the duration column:
ALTER TABLE public.video_projects
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;

ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "select_own" ON public.video_projects;
DROP POLICY IF EXISTS "insert_own" ON public.video_projects;
DROP POLICY IF EXISTS "update_own" ON public.video_projects;
DROP POLICY IF EXISTS "delete_own" ON public.video_projects;

CREATE POLICY "select_own" ON public.video_projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own" ON public.video_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own" ON public.video_projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own" ON public.video_projects
  FOR DELETE USING (auth.uid() = user_id);
