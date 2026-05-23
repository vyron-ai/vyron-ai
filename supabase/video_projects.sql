-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

CREATE TABLE IF NOT EXISTS public.video_projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name   TEXT        NOT NULL,
  file_url    TEXT        NOT NULL,
  file_size   BIGINT      NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'uploaded',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON public.video_projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own" ON public.video_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own" ON public.video_projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own" ON public.video_projects
  FOR DELETE USING (auth.uid() = user_id);
