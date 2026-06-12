-- ============================================================
-- Credential Routing Fields for Provider-based Key Management
-- Adds: priority, last_used_at, backoff_level to model_credentials
-- Adds: credential_model_locks table for per-(credential, model) locking
-- ============================================================

-- 1. Add routing columns to model_credentials
alter table public.model_credentials
  add column if not exists priority int not null default 0,
  add column if not exists last_used_at timestamptz,
  add column if not exists backoff_level int not null default 0;

comment on column public.model_credentials.priority is
  'Credential selection priority. Lower value = preferred. Used for fill-first routing strategy.';
comment on column public.model_credentials.last_used_at is
  'Timestamp of last gateway request using this credential. Used for round-robin tracking.';
comment on column public.model_credentials.backoff_level is
  'Current exponential backoff exponent. Incremented on consecutive failures, reset on success.';

-- 2. Per-(credential, model) lock table
create table if not exists public.credential_model_locks (
  id uuid default gen_random_uuid() primary key,
  credential_id uuid not null references public.model_credentials on delete cascade,
  model_name text not null,
  locked_until timestamptz not null,
  error_type text not null default 'unknown'
    check (error_type in ('rate_limit', 'auth_error', 'server_error', 'connection_error', 'timeout', 'unknown')),
  error_message text,
  created_at timestamptz not null default now(),
  unique(credential_id, model_name)
);

comment on table public.credential_model_locks is
  'Per-(credential, model) lock entries. Gateway creates locks on provider errors and clears on success.';

-- 3. Enable RLS (service-role only access -- gateway uses service role)
alter table public.credential_model_locks enable row level security;

create policy "Service role can manage credential model locks."
  on public.credential_model_locks for all
  using (true);

-- 4. Indexes for routing query patterns
create index if not exists idx_model_credentials_provider_priority
  on public.model_credentials (provider_id, is_active, priority);

create index if not exists idx_credential_model_locks_lookup
  on public.credential_model_locks (credential_id, model_name, locked_until);
