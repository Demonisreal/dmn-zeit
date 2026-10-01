-- migrate:up
-- anyone who knows an address can run up the misses: the lock stays short, the api throttles per network
create or replace function auth.login_failed(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  -- a streak ends after a day without misses; from the fifth miss the account locks for 1, 2, 4, 8, then 15 minutes
  -- only c is read again once the row lock is granted, a subquery would lose a parallel miss
  update auth.credentials c
     set failed_count = case when c.last_failed_at > now() - interval '24 hours' then c.failed_count else 0 end + 1,
         last_failed_at = now(),
         locked_until = case
           when c.last_failed_at > now() - interval '24 hours' and c.failed_count >= 4
             then now() + interval '1 minute' * least(power(2, c.failed_count - 4), 15)
         end
   where c.user_id = p_user_id
  returning c.locked_until;
$$;

drop function auth.session_create(uuid, bytea, bytea, inet, text);

create function auth.session_create(
  p_user_id uuid,
  p_token_hash bytea,
  p_csrf_hash bytea,
  p_ip inet,
  p_user_agent text,
  p_bypass_lock boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  sandbox boolean;
begin
  update app.users u set last_login_at = now()
   where u.id = p_user_id and u.status in ('active', 'demo')
  returning u.status = 'demo' into sandbox;
  if not found then
    raise exception 'user % may not sign in', p_user_id using errcode = '28000';
  end if;

  -- misses come from password guesses, a passkey with user verification is let past the lock
  if not p_bypass_lock
    and exists (select 1 from auth.credentials c where c.user_id = p_user_id and c.locked_until > now())
  then
    raise exception 'user % is locked', p_user_id using errcode = '28000';
  end if;

  -- a running lock stays, or every passkey login would hand the guesser five fresh tries
  update auth.credentials c set failed_count = 0, locked_until = null, last_failed_at = null
   where c.user_id = p_user_id
     and c.failed_count > 0
     and (c.locked_until is null or c.locked_until <= now());

  -- without a second factor the session only reaches the enrollment endpoints, demo personas excepted
  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent,
    enrollment_pending
  )
  values (
    p_user_id, p_token_hash, p_csrf_hash, now() + interval '12 hours', now() + interval '7 days',
    p_ip, p_user_agent,
    not sandbox
      and not exists (select 1 from auth.totp t where t.user_id = p_user_id and t.confirmed_at is not null)
      and not exists (select 1 from auth.passkeys k where k.user_id = p_user_id)
  )
  returning id into sid;

  return sid;
end;
$$;

grant create on schema auth to zeit_system;
alter function auth.session_create(uuid, bytea, bytea, inet, text, boolean) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.session_create(uuid, bytea, bytea, inet, text, boolean) to zeit_app;

-- migrate:down
drop function auth.session_create(uuid, bytea, bytea, inet, text, boolean);

create function auth.session_create(
  p_user_id uuid,
  p_token_hash bytea,
  p_csrf_hash bytea,
  p_ip inet,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  sandbox boolean;
begin
  update app.users u set last_login_at = now()
   where u.id = p_user_id and u.status in ('active', 'demo')
  returning u.status = 'demo' into sandbox;
  if not found then
    raise exception 'user % may not sign in', p_user_id using errcode = '28000';
  end if;

  -- a lock holds for passkeys too, and signing in does not lift it
  if exists (select 1 from auth.credentials c where c.user_id = p_user_id and c.locked_until > now()) then
    raise exception 'user % is locked', p_user_id using errcode = '28000';
  end if;

  update auth.credentials c set failed_count = 0, locked_until = null, last_failed_at = null
   where c.user_id = p_user_id and c.failed_count > 0;

  -- without a second factor the session only reaches the enrollment endpoints, demo personas excepted
  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent,
    enrollment_pending
  )
  values (
    p_user_id, p_token_hash, p_csrf_hash, now() + interval '12 hours', now() + interval '7 days',
    p_ip, p_user_agent,
    not sandbox
      and not exists (select 1 from auth.totp t where t.user_id = p_user_id and t.confirmed_at is not null)
      and not exists (select 1 from auth.passkeys k where k.user_id = p_user_id)
  )
  returning id into sid;

  return sid;
end;
$$;

grant create on schema auth to zeit_system;
alter function auth.session_create(uuid, bytea, bytea, inet, text) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.session_create(uuid, bytea, bytea, inet, text) to zeit_app;

create or replace function auth.login_failed(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  -- a streak ends after a day without misses; from the fifth miss the account locks for 1, 2, 4 ... 64 minutes
  update auth.credentials c
     set failed_count = s.misses,
         last_failed_at = now(),
         locked_until = case
           when s.misses >= 5 then now() + interval '1 minute' * power(2, least(s.misses - 5, 6))
         end
    from (
      select p.user_id,
             case when p.last_failed_at > now() - interval '24 hours' then p.failed_count else 0 end + 1 as misses
        from auth.credentials p
       where p.user_id = p_user_id
    ) s
   where c.user_id = s.user_id
  returning c.locked_until;
$$;
