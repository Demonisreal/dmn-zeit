-- migrate:up
create or replace function auth.password_change(p_password_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := app.user_id();
begin
  if account is null then
    raise exception 'nobody is signed in' using errcode = '28000';
  end if;

  perform auth.password_set(account, p_password_hash);
  -- this device included, the api opens a fresh session right after
  delete from auth.sessions s where s.user_id = account;
  -- a reset link sent before the change would otherwise still overwrite the new password
  delete from auth.tokens t where t.user_id = account and t.kind = 'password_reset' and t.used_at is null;
end;
$$;

-- migrate:down
create or replace function auth.password_change(p_password_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := app.user_id();
begin
  if account is null then
    raise exception 'nobody is signed in' using errcode = '28000';
  end if;

  perform auth.password_set(account, p_password_hash);
  -- this device included, the api opens a fresh session right after
  delete from auth.sessions s where s.user_id = account;
end;
$$;
