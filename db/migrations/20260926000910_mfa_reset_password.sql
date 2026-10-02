-- migrate:up
create or replace function auth.mfa_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.role() is distinct from 'admin'
    or p_user_id is not distinct from app.user_id()
    or not exists (select 1 from app.users u where u.id = p_user_id and u.tenant_id = app.tenant_id())
  then
    raise exception 'second factors of % cannot be reset from here', p_user_id
      using errcode = 'insufficient_privilege';
  end if;

  delete from auth.totp t where t.user_id = p_user_id;
  delete from auth.passkeys k where k.user_id = p_user_id;
  delete from auth.recovery_codes c where c.user_id = p_user_id;
  delete from auth.mfa_challenges m where m.user_id = p_user_id;
  delete from auth.webauthn_challenges w where w.user_id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;
  delete from auth.credentials c where c.user_id = p_user_id;
end;
$$;

grant delete on auth.credentials to zeit_system;

-- migrate:down
create or replace function auth.mfa_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.role() is distinct from 'admin'
    or p_user_id is not distinct from app.user_id()
    or not exists (select 1 from app.users u where u.id = p_user_id and u.tenant_id = app.tenant_id())
  then
    raise exception 'second factors of % cannot be reset from here', p_user_id
      using errcode = 'insufficient_privilege';
  end if;

  delete from auth.totp t where t.user_id = p_user_id;
  delete from auth.passkeys k where k.user_id = p_user_id;
  delete from auth.recovery_codes c where c.user_id = p_user_id;
  delete from auth.mfa_challenges m where m.user_id = p_user_id;
  delete from auth.webauthn_challenges w where w.user_id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;
end;
$$;

revoke delete on auth.credentials from zeit_system;
