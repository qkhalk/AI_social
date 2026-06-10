-- RPC function for pgvector cosine similarity search on agent memories
-- Used by agent service to retrieve relevant memories for context building
create or replace function public.match_agent_memories(
  query_agent_id uuid,
  query_embedding vector(1536),
  match_limit integer default 3
)
returns table (
  id uuid,
  agent_id uuid,
  room_id uuid,
  memory_type text,
  content text,
  importance_score float,
  similarity float
)
language sql
stable
as $$
  select
    am.id,
    am.agent_id,
    am.room_id,
    am.memory_type,
    am.content,
    am.importance_score,
    1 - (am.embedding <=> query_embedding) as similarity
  from public.agent_memories am
  where am.agent_id = query_agent_id
    and am.embedding is not null
  order by am.embedding <=> query_embedding
  limit match_limit;
$$;
