-- migrate:up
create function auth.password_rehash(p_user_id uuid, p_old_hash text, p_new_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  -- a password change in between wins; the $argon2id$ check on the column guards the format
  with swapped as (
    update auth.credentials c set password_hash = p_new_hash
     where c.user_id = p_user_id and c.password_hash = p_old_hash
    returning c.user_id
  )
  select exists (select 1 from swapped);
$$;

create or replace function app.guard_own_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own constant text[] := array['display_name', 'locale', 'updated_at', 'last_login_at'];
begin
  -- own row: name and language only, except invitation_accept activating the invited person
  if new.id = app.user_id()
    and to_jsonb(new) - own <> to_jsonb(old) - own
    and not (
      current_user = 'zeit_system'
      and old.status = 'invited'
      and new.status = 'active'
      and to_jsonb(new) - own - 'status' = to_jsonb(old) - own - 'status'
    )
  then
    raise exception 'only display name and locale can be changed on one''s own user'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function auth.invitation_accept(p_token_hash bytea, p_password_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
  previous_user text := current_setting('app.user_id', true);
  previous_role text := current_setting('app.role', true);
begin
  update auth.tokens t set used_at = now()
    from app.users u
   where t.token_hash = p_token_hash
     and t.kind = 'invite'
     and t.used_at is null
     and t.expires_at > now()
     and u.id = t.user_id
     and u.status = 'invited'
  returning t.user_id into account;

  if account is not null then
    -- the trail names the invited person as the one who activated the account
    perform set_config('app.user_id', account::text, true),
            set_config('app.role', (select u.role::text from app.users u where u.id = account), true);
    perform auth.password_set(account, p_password_hash);
    perform set_config('app.user_id', coalesce(previous_user, ''), true),
            set_config('app.role', coalesce(previous_role, ''), true);
  end if;
  return account;
end;
$$;

create or replace function auth.mfa_challenge_attempt(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  -- counted before the code is checked, and once login_failed has locked the account nothing is left
  update auth.mfa_challenges m set attempts = m.attempts + 1
   where m.token_hash = p_token_hash
     and m.expires_at > now()
     and m.attempts < 5
     and not exists (
       select 1 from auth.credentials c where c.user_id = m.user_id and c.locked_until > now()
     )
  returning m.user_id;
$$;

grant create on schema auth to zeit_system;
alter function auth.password_rehash(uuid, text, text) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.password_rehash(uuid, text, text) to zeit_app;

-- migrate:down
drop function auth.password_rehash(uuid, text, text);

create or replace function auth.mfa_challenge_attempt(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  -- the attempt is counted before the code is checked, so parallel guesses cannot slip past the limit
  update auth.mfa_challenges m set attempts = m.attempts + 1
   where m.token_hash = p_token_hash
     and m.expires_at > now()
     and m.attempts < 5
  returning m.user_id;
$$;

create or replace function auth.invitation_accept(p_token_hash bytea, p_password_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  update auth.tokens t set used_at = now()
    from app.users u
   where t.token_hash = p_token_hash
     and t.kind = 'invite'
     and t.used_at is null
     and t.expires_at > now()
     and u.id = t.user_id
     and u.status = 'invited'
  returning t.user_id into account;

  if account is not null then
    perform auth.password_set(account, p_password_hash);
  end if;
  return account;
end;
$$;

create or replace function app.guard_own_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own constant text[] := array['display_name', 'locale', 'updated_at', 'last_login_at'];
begin
  -- on their own row people rename themselves or switch the language, admins included
  if new.id = app.user_id() and to_jsonb(new) - own <> to_jsonb(old) - own then
    raise exception 'only display name and locale can be changed on one''s own user'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
