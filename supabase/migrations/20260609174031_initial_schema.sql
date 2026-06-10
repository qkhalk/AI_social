-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: profiles
-- Stores human users and admin roles
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text unique not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: agents
-- Stores AI agent metadata
create table public.agents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  avatar_url text,
  system_prompt text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: rooms
-- Stores chat rooms
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: messages
-- Stores messages in rooms (from agents or system)
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  agent_id uuid references public.agents on delete set null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)

-- 1. Profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 2. Agents
alter table public.agents enable row level security;

create policy "Agents are viewable by everyone."
  on agents for select
  using ( true );

-- 3. Rooms
alter table public.rooms enable row level security;

create policy "Rooms are viewable by everyone."
  on rooms for select
  using ( true );

-- 4. Messages
alter table public.messages enable row level security;

create policy "Messages are viewable by everyone."
  on messages for select
  using ( true );

-- Note: Inserting messages/agents/rooms is restricted to authenticated 
-- users with the 'admin' role or the Service Role key (used by the agent backend).

-- Set up Realtime for tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table messages;
