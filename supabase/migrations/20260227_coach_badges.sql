-- Coach Badge System
-- Tables:
--   eg_badges        -> badge catalogue (tier + metadata)
--   eg_user_badges   -> earned badges per user

CREATE TABLE IF NOT EXISTS public.eg_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eg_user_badges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.eg_badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  progress text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_eg_badges_active ON public.eg_badges (is_active);
CREATE INDEX IF NOT EXISTS idx_eg_badges_category ON public.eg_badges (category);
CREATE INDEX IF NOT EXISTS idx_eg_user_badges_user ON public.eg_user_badges (user_id);

ALTER TABLE public.eg_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eg_user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eg_badges_select_active" ON public.eg_badges;
CREATE POLICY "eg_badges_select_active"
ON public.eg_badges
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "eg_user_badges_select_own" ON public.eg_user_badges;
CREATE POLICY "eg_user_badges_select_own"
ON public.eg_user_badges
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "eg_user_badges_insert_own" ON public.eg_user_badges;
CREATE POLICY "eg_user_badges_insert_own"
ON public.eg_user_badges
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "eg_user_badges_update_own" ON public.eg_user_badges;
CREATE POLICY "eg_user_badges_update_own"
ON public.eg_user_badges
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

INSERT INTO public.eg_badges (code, title, description, category, tier, icon)
VALUES
  ('first_win', 'First Win', 'Secure your first verified match win.', 'Milestones', 'bronze', '🏆'),
  ('double_digit_goals', 'Double-Digit Attack', 'Score 10+ goals across verified submissions.', 'Performance', 'silver', '⚡'),
  ('top_8_push', 'Top 8 Push', 'Reach top eight in the ladder at any checkpoint.', 'Team', 'gold', '📈'),
  ('winning_coach', 'Winning Coach', 'Maintain a 50%+ win rate after at least two games.', 'Performance', 'gold', '🔥'),
  ('century_board', 'Century Board', 'Post 100+ points for in season results.', 'Milestones', 'platinum', '💯'),
  ('psn_linked', 'PSN Linked', 'Connect your PSN for verified submissions.', 'Team', 'bronze', '🎮')
ON CONFLICT (code) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tier = EXCLUDED.tier,
  icon = EXCLUDED.icon,
  is_active = true;
