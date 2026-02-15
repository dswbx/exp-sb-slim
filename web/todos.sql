-- Create auth helper if not exists (PostgREST sets request.jwt.claims)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$ LANGUAGE sql STABLE;

-- Todos table
CREATE TABLE IF NOT EXISTS public.todos (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  is_complete boolean NOT NULL DEFAULT false,
  is_private boolean NOT NULL DEFAULT false,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent re-runs)
DROP POLICY IF EXISTS "Public todos visible to everyone" ON public.todos;
DROP POLICY IF EXISTS "Authenticated see own + public" ON public.todos;
DROP POLICY IF EXISTS "Authenticated insert own" ON public.todos;
DROP POLICY IF EXISTS "Authenticated update own" ON public.todos;
DROP POLICY IF EXISTS "Authenticated delete own" ON public.todos;

-- SELECT: anon sees public only
CREATE POLICY "Public todos visible to everyone"
  ON public.todos FOR SELECT TO anon
  USING (is_private = false);

-- SELECT: authenticated sees public + own private
CREATE POLICY "Authenticated see own + public"
  ON public.todos FOR SELECT TO authenticated
  USING (is_private = false OR user_id = auth.uid());

-- INSERT: authenticated, must set own user_id
CREATE POLICY "Authenticated insert own"
  ON public.todos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: authenticated, own rows only
CREATE POLICY "Authenticated update own"
  ON public.todos FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- DELETE: authenticated, own rows only
CREATE POLICY "Authenticated delete own"
  ON public.todos FOR DELETE TO authenticated
  USING (user_id = auth.uid());
