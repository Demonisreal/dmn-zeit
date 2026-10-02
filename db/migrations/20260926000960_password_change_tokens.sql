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
  delete from auth.sessions s where s.user_id = account;
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
  delete from auth.sessions s where s.user_id = account;
end;
$$;
