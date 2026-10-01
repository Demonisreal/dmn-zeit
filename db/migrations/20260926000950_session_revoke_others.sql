-- migrate:up
create function auth.session_revoke_others(p_user_id uuid, p_keep_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.user_id = p_user_id and s.id <> p_keep_session_id;
$$;

grant create on schema auth to zeit_system;
alter function auth.session_revoke_others(uuid, uuid) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.session_revoke_others(uuid, uuid) to zeit_app;

-- migrate:down
drop function auth.session_revoke_others(uuid, uuid);
