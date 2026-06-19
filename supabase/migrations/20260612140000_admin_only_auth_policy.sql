-- Defense-in-depth: block direct Supabase Auth signup/login for non-admin emails.
-- Next.js routes also enforce this, but public anon keys can call Supabase Auth directly.
create or replace function public.enforce_admin_only_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if lower(coalesce(new.email, '')) <> 'admin@doralove.io.vn' then
    raise exception 'This account is not allowed to sign in.' using errcode = '28000';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_admin_only_auth_email on auth.users;
create trigger enforce_admin_only_auth_email
  before insert or update on auth.users
  for each row execute function public.enforce_admin_only_auth_email();
