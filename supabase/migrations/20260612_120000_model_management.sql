-- ============================================================
-- AI Social Network — Model Management Schema
-- Adds: model_providers, model_credentials, site_settings
-- ============================================================

-- Enable pgcrypto for encryption functions
create extension if not exists pgcrypto;

-- ============================================================
-- 1. Model Providers Configuration
-- ============================================================
create table if not exists public.model_providers (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,              -- 'openai', 'anthropic', 'google', 'meta', 'custom'
  display_name text not null,             -- 'OpenAI', 'Anthropic', etc.
  auth_type text not null check (auth_type in ('api_key', 'oauth', 'none')),
  api_base_url text,                      -- Optional custom endpoint
  icon_url text,                          -- Provider logo/icon URL
  is_active boolean default true,
  config_schema jsonb default '{}',       -- Validation schema for provider config
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 2. Admin-Stored Credentials (Encrypted)
-- ============================================================
create table if not exists public.model_credentials (
  id uuid default gen_random_uuid() primary key,
  provider_id uuid references model_providers on delete cascade not null,
  admin_id uuid references profiles on delete cascade not null,
  credential_name text not null,          -- 'Production GPT-4', 'Dev Claude Key'
  encrypted_config text not null,         -- Encrypted JSON: {api_key: "...", org_id: "..."}
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(provider_id, admin_id, credential_name)
);

-- ============================================================
-- 3. Site-Wide Settings
-- ============================================================
create table if not exists public.site_settings (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  category text default 'general',
  updated_by uuid references profiles,
  updated_at timestamptz default now()
);

-- ============================================================
-- 4. Extend Agents Table with Model Credential Reference
-- ============================================================
alter table public.agents 
  add column if not exists model_credential_id uuid references model_credentials on delete set null;

-- ============================================================
-- 5. Row Level Security Policies
-- ============================================================

-- Model Providers: Viewable by everyone (for dropdown selection)
alter table public.model_providers enable row level security;

create policy "Model providers viewable by everyone."
  on model_providers for select
  using (true);

-- Admin can manage model providers
create policy "Admin can insert model providers."
  on model_providers for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update model providers."
  on model_providers for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete model providers."
  on model_providers for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Model Credentials: Admin-scoped (each admin sees only their own)
alter table public.model_credentials enable row level security;

create policy "Admin can view own credentials."
  on model_credentials for select
  using (
    admin_id = auth.uid() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can insert own credentials."
  on model_credentials for insert
  with check (
    admin_id = auth.uid() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update own credentials."
  on model_credentials for update
  using (
    admin_id = auth.uid() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete own credentials."
  on model_credentials for delete
  using (
    admin_id = auth.uid() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Site Settings: Admin only
alter table public.site_settings enable row level security;

create policy "Site settings viewable by everyone."
  on site_settings for select
  using (true);

create policy "Admin can manage site settings."
  on site_settings for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- 6. Indexes
-- ============================================================
create index if not exists idx_model_credentials_admin_id on model_credentials (admin_id);
create index if not exists idx_model_credentials_provider_id on model_credentials (provider_id);
create index if not exists idx_model_credentials_is_default on model_credentials (is_default) where is_default = true;
create index if not exists idx_site_settings_category on site_settings (category);

-- ============================================================
-- 7. Seed Default Model Providers
-- ============================================================
insert into public.model_providers (name, display_name, auth_type, api_base_url, icon_url, config_schema) values
  ('openai', 'OpenAI', 'api_key', 'https://api.openai.com/v1', 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/openai.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}, "organization_id": {"type": "string", "title": "Organization ID (optional)"}}, "required": ["api_key"]}'),
  ('anthropic', 'Anthropic', 'api_key', 'https://api.anthropic.com', 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/anthropic.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}}, "required": ["api_key"]}'),
  ('google', 'Google AI', 'api_key', 'https://generativelanguage.googleapis.com', 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}}, "required": ["api_key"]}'),
  ('meta', 'Meta (Llama)', 'api_key', 'https://api.llama-api.com', 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/meta.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}}, "required": ["api_key"]}'),
  ('openrouter', 'OpenRouter', 'api_key', 'https://openrouter.ai/api/v1', 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/openrouter.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}}, "required": ["api_key"]}'),
  ('custom', 'Custom Endpoint', 'api_key', null, 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/apollographql.svg', '{"type": "object", "properties": {"api_key": {"type": "string", "title": "API Key"}, "base_url": {"type": "string", "title": "Base URL"}}, "required": ["api_key", "base_url"]}')
on conflict (name) do nothing;

-- ============================================================
-- 8. Add Updated_At Trigger Function
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
drop trigger if exists model_providers_updated_at on model_providers;
create trigger model_providers_updated_at
  before update on model_providers
  for each row execute function public.handle_updated_at();

drop trigger if exists model_credentials_updated_at on model_credentials;
create trigger model_credentials_updated_at
  before update on model_credentials
  for each row execute function public.handle_updated_at();

drop trigger if exists site_settings_updated_at on site_settings;
create trigger site_settings_updated_at
  before update on site_settings
  for each row execute function public.handle_updated_at();