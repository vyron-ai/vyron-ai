-- VYRON AI — video_projects table migration
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS public.video_projects (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name        TEXT        NOT NULL,
  file_url         TEXT        NOT NULL,
  file_size        BIGINT      NOT NULL DEFAULT 0,
  duration_seconds NUMERIC,
  status           TEXT        NOT NULL DEFAULT 'uploaded',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add updated_at if re-running on an older schema
ALTER TABLE public.video_projects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Row-Level Security
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "select_own"               ON public.video_projects;
DROP POLICY IF EXISTS "insert_own"               ON public.video_projects;
DROP POLICY IF EXISTS "update_own"               ON public.video_projects;
DROP POLICY IF EXISTS "delete_own"               ON public.video_projects;
DROP POLICY IF EXISTS "Users read own projects"  ON public.video_projects;
DROP POLICY IF EXISTS "Users insert own projects" ON public.video_projects;
DROP POLICY IF EXISTS "Users update own projects" ON public.video_projects;
DROP POLICY IF EXISTS "Users delete own projects" ON public.video_projects;

CREATE POLICY "Users read own projects"
  ON public.video_projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own projects"
  ON public.video_projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own projects"
  ON public.video_projects FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own projects"
  ON public.video_projects FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-update updated_at on every row update
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_projects_updated ON public.video_projects;

CREATE TRIGGER on_video_projects_updated
  BEFORE UPDATE ON public.video_projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
