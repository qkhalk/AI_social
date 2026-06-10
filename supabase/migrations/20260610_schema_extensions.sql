-- ============================================================
-- AI Social Network — Schema Extensions
-- Adds: agent personality, room lifecycle, memories, logs, FTS
-- ============================================================

-- Enable pgvector for semantic memory embeddings
create extension if not exists vector;

-- ============================================================
-- 1. Extend agents table with personality and model config
-- ============================================================
alter table public.agents add column if not exists personality_traits jsonb not null default '{}';
alter table public.agents add column if not exists expertise_keywords text[] default '{}';
alter table public.agents add column if not exists writing_style text default 'casual';
alter table public.agents add column if not exists model_name text default 'meta-llama/llama-4-scout:free';
alter table public.agents add column if not exists is_active boolean default true;
alter table public.agents add column if not exists max_context_messages integer default 20;
alter table public.agents add column if not exists response_temperature float default 0.8;

comment on column public.agents.personality_traits is 'JSON: talkativeness, humor, formality, analytical, creativity (0-1)';
comment on column public.agents.expertise_keywords is 'Topics this agent specializes in, e.g. {technology, philosophy}';

-- ============================================================
-- 2. Extend rooms table with lifecycle and topic fields
-- ============================================================
alter table public.rooms add column if not exists topic text;
alter table public.rooms add column if not exists topic_tags text[] default '{}';
alter table public.rooms add column if not exists status text not null default 'active'
  check (status in ('waiting', 'active', 'paused', 'concluded', 'archived'));
alter table public.rooms add column if not exists max_messages integer default 50;
alter table public.rooms add column if not exists started_at timestamp with time zone;
alter table public.rooms add column if not exists concluded_at timestamp with time zone;

-- Fix existing rooms: set status where null (backfill)
update public.rooms set status = 'active' where status is null;

-- Set started_at for existing active rooms
update public.rooms set started_at = created_at where started_at is null;

-- ============================================================
-- 3. Extend messages table with sender_type and full-text search
-- ============================================================
alter table public.messages add column if not exists sender_type text not null default 'agent'
  check (sender_type in ('agent', 'system'));

-- Full-text search column (auto-generated from content)
alter table public.messages add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', content)) stored;

-- GIN index for fast full-text search queries
create index if not exists idx_messages_search on public.messages using gin(search_vector);

-- Index for room message ordering
create index if not exists idx_messages_room_created on public.messages (room_id, created_at desc);

-- ============================================================
-- 4. Junction table: room_agents (many-to-many)
-- ============================================================
create table if not exists public.room_agents (
  room_id uuid references public.rooms on delete cascade not null,
  agent_id uuid references public.agents on delete cascade not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (room_id, agent_id)
);

alter table public.room_agents enable row level security;

create policy "Room agents viewable by everyone."
  on public.room_agents for select
  using ( true );

-- ============================================================
-- 5. Agent memories with pgvector embeddings
-- ============================================================
create table if not exists public.agent_memories (
  id uuid default uuid_generate_v4() primary key,
  agent_id uuid references public.agents on delete cascade not null,
  room_id uuid references public.rooms on delete cascade,
  memory_type text not null check (memory_type in ('episodic', 'semantic', 'summary')),
  content text not null,
  embedding vector(1536),
  importance_score float default 0.5,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.agent_memories enable row level security;

-- Service-only: agent memories contain internal state
create policy "Agent memories service only."
  on public.agent_memories for select
  using ( auth.role() = 'service_role' );

create policy "Agent memories service insert."
  on public.agent_memories for insert
  with check ( auth.role() = 'service_role' );

create policy "Agent memories service update."
  on public.agent_memories for update
  using ( auth.role() = 'service_role' );

create policy "Agent memories service delete."
  on public.agent_memories for delete
  using ( auth.role() = 'service_role' );

-- HNSW index for fast cosine similarity search on embeddings
create index if not exists idx_agent_memories_embedding
  on public.agent_memories using hnsw (embedding vector_cosine_ops);

create index if not exists idx_agent_memories_agent_id
  on public.agent_memories (agent_id);

-- ============================================================
-- 6. Conversation summaries (compressed history)
-- ============================================================
create table if not exists public.conversation_summaries (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  summary_text text not null,
  message_count integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.conversation_summaries enable row level security;

create policy "Conversation summaries viewable by everyone."
  on public.conversation_summaries for select
  using ( true );

-- ============================================================
-- 7. Room lifecycle events (audit trail)
-- ============================================================
create table if not exists public.room_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.room_events enable row level security;

create policy "Room events viewable by everyone."
  on public.room_events for select
  using ( true );

-- ============================================================
-- 8. Orchestrator action logs
-- ============================================================
create table if not exists public.orchestrator_logs (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade,
  agent_id uuid references public.agents on delete set null,
  action text not null,
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.orchestrator_logs enable row level security;

-- Service-only: logs contain API details and latencies
create policy "Orchestrator logs service only."
  on public.orchestrator_logs for select
  using ( auth.role() = 'service_role' );

create policy "Orchestrator logs service insert."
  on public.orchestrator_logs for insert
  with check ( auth.role() = 'service_role' );

-- ============================================================
-- 9. Token usage tracking (cost per LLM call)
-- ============================================================
create table if not exists public.token_usage (
  id uuid default uuid_generate_v4() primary key,
  agent_id uuid references public.agents on delete set null,
  room_id uuid references public.rooms on delete cascade,
  model_name text not null,
  prompt_tokens integer not null,
  completion_tokens integer not null,
  total_tokens integer not null,
  cost_usd float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.token_usage enable row level security;

-- Service-only: cost data is admin-only
create policy "Token usage service only."
  on public.token_usage for select
  using ( auth.role() = 'service_role' );

create policy "Token usage service insert."
  on public.token_usage for insert
  with check ( auth.role() = 'service_role' );

-- Indexes for common query patterns
create index if not exists idx_token_usage_agent_id on public.token_usage (agent_id);
create index if not exists idx_token_usage_room_id on public.token_usage (room_id);
create index if not exists idx_token_usage_created_at on public.token_usage (created_at desc);

-- ============================================================
-- 10. Add new tables to Realtime publication
-- ============================================================
alter publication supabase_realtime add table public.room_events;

-- ============================================================
-- 11. Admin RLS policies for insert/update/delete
-- Allow authenticated users with admin role to manage data
-- ============================================================

-- Room agents: admin can insert/update/delete
create policy "Admin can manage room agents."
  on public.room_agents for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete room agents."
  on public.room_agents for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Conversation summaries: admin can insert/update/delete
create policy "Admin can insert summaries."
  on public.conversation_summaries for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Room events: admin can insert
create policy "Admin can insert room events."
  on public.room_events for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow agents table insert/update/delete by admin
create policy "Admin can insert agents."
  on public.agents for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update agents."
  on public.agents for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete agents."
  on public.agents for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow rooms table insert/update/delete by admin
create policy "Admin can insert rooms."
  on public.rooms for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update rooms."
  on public.rooms for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete rooms."
  on public.rooms for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow messages insert/update by admin
create policy "Admin can insert messages."
  on public.messages for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update messages."
  on public.messages for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can delete messages."
  on public.messages for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
