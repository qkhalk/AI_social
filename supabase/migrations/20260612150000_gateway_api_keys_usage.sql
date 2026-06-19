-- Public OpenAI-compatible gateway API keys and usage logs.
create table if not exists public.gateway_api_keys (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.profiles on delete set null,
  model_credential_id uuid references public.model_credentials on delete restrict not null,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  is_active boolean not null default true,
  request_limit_per_minute integer not null default 60,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.gateway_rate_limit_buckets (
  api_key_id uuid references public.gateway_api_keys on delete cascade not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key (api_key_id, bucket_start)
);

create table if not exists public.gateway_usage_events (
  id uuid default gen_random_uuid() primary key,
  api_key_id uuid references public.gateway_api_keys on delete set null,
  model_name text not null,
  provider_name text,
  status text not null check (status in ('success', 'failed')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.gateway_api_keys enable row level security;
alter table public.gateway_usage_events enable row level security;
alter table public.gateway_rate_limit_buckets enable row level security;

drop policy if exists "Admin can manage gateway API keys." on public.gateway_api_keys;
create policy "Admin can manage gateway API keys."
  on public.gateway_api_keys for all
  using (
    admin_id = auth.uid() and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    admin_id = auth.uid() and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') and
    exists (
      select 1 from public.model_credentials
      where id = model_credential_id and admin_id = auth.uid()
    )
  );

drop policy if exists "Admin can view gateway usage." on public.gateway_usage_events;
create policy "Admin can view gateway usage."
  on public.gateway_usage_events for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Admin can view gateway rate buckets." on public.gateway_rate_limit_buckets;
create policy "Admin can view gateway rate buckets."
  on public.gateway_rate_limit_buckets for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create or replace function public.gateway_consume_request(
  p_api_key_id uuid,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 or p_limit > 600 then
    return false;
  end if;

  insert into public.gateway_rate_limit_buckets (api_key_id, bucket_start, request_count)
  values (p_api_key_id, v_bucket, 1)
  on conflict (api_key_id, bucket_start)
  do update set request_count = public.gateway_rate_limit_buckets.request_count + 1
  where public.gateway_rate_limit_buckets.request_count < p_limit
  returning request_count into v_count;

  return v_count is not null;
end;
$$;

create index if not exists idx_gateway_api_keys_hash on public.gateway_api_keys (key_hash);
create index if not exists idx_gateway_api_keys_credential on public.gateway_api_keys (model_credential_id);
create index if not exists idx_gateway_usage_api_key_created on public.gateway_usage_events (api_key_id, created_at desc);
create index if not exists idx_gateway_usage_created on public.gateway_usage_events (created_at desc);
