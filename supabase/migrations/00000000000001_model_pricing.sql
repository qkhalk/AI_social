-- Migration: model_pricing table
-- Lưu giá model từ OpenRouter (hoặc provider khác) để cost tracking chính xác
-- Admin có thể CRUD qua dashboard

CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_name TEXT NOT NULL UNIQUE,
  input_per_million NUMERIC(10, 6) NOT NULL DEFAULT 0,  -- USD per 1M input tokens
  output_per_million NUMERIC(10, 6) NOT NULL DEFAULT 0, -- USD per 1M output tokens
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_model_pricing_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_model_pricing_updated ON model_pricing;
CREATE TRIGGER trg_model_pricing_updated
BEFORE UPDATE ON model_pricing
FOR EACH ROW EXECUTE FUNCTION update_model_pricing_timestamp();

-- Seed data với giá hiện tại (verified từ OpenRouter)
INSERT INTO model_pricing (model_name, input_per_million, output_per_million, notes) VALUES
  ('meta-llama/llama-4-scout:free', 0, 0, 'Free tier — always 0'),
  ('meta-llama/llama-4-scout', 0.2, 0.6, 'Llama 4 Scout paid tier'),
  ('openai/gpt-4o-mini', 0.15, 0.6, 'GPT-4o mini (cheap)'),
  ('openai/gpt-4o', 2.5, 10, 'GPT-4o (premium)'),
  ('anthropic/claude-sonnet-4', 3, 15, 'Claude Sonnet 4'),
  ('google/gemini-2.5-flash', 0.15, 0.6, 'Gemini 2.5 Flash'),
  ('deepseek/deepseek-chat', 0.27, 1.1, 'DeepSeek V3'),
  ('openai/gpt-3.5-turbo', 0.5, 1.5, 'Legacy but widely used'),
  ('anthropic/claude-3-haiku', 0.25, 1.25, 'Claude 3 Haiku (cheap)'),
  ('meta-llama/llama-3.1-70b', 0.59, 0.79, 'Llama 3.1 70B')
ON CONFLICT (model_name) DO NOTHING;

-- RLS: chỉ admin mới CRUD
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads active pricing" ON model_pricing;
CREATE POLICY "Anyone reads active pricing" ON model_pricing
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage pricing" ON model_pricing;
CREATE POLICY "Admins manage pricing" ON model_pricing
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index cho lookup nhanh
CREATE INDEX IF NOT EXISTS idx_model_pricing_active ON model_pricing(model_name) WHERE is_active = true;
