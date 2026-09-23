\restrict dbmate

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: ops; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ops;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: federal_state; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.federal_state AS ENUM (
    'BW',
    'BY',
    'BE',
    'BB',
    'HB',
    'HH',
    'HE',
    'MV',
    'NI',
    'NW',
    'RP',
    'SL',
    'SN',
    'ST',
    'SH',
    'TH'
);


--
-- Name: flex_cap_mode; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.flex_cap_mode AS ENUM (
    'none',
    'forfeit_at_close',
    'warn'
);


--
-- Name: tenant_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.tenant_kind AS ENUM (
    'live',
    'sandbox'
);


--
-- Name: user_role; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.user_role AS ENUM (
    'employee',
    'team_lead',
    'hr',
    'admin'
);


--
-- Name: user_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.user_status AS ENUM (
    'invited',
    'active',
    'disabled',
    'demo'
);


--
-- Name: token_kind; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.token_kind AS ENUM (
    'invite',
    'password_reset'
);


--
-- Name: employee_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.employee_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.employee_id', true), '')::uuid
$$;


--
-- Name: reject_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reject_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  -- the sandbox purge is the only one allowed to delete, and only rows of the tenant it purges
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true) then
      return old;
    end if;
  end if;

  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;


--
-- Name: role(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.role() RETURNS app.user_role
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.role', true), '')::app.user_role
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: tenant_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;


--
-- Name: user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: track(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.track() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  -- bookkeeping columns alone are not worth a trail entry
  skipped constant text[] := array['updated_at', 'last_login_at'];
  old_row jsonb := '{}';
  new_row jsonb := '{}';
  latest jsonb;
  changed jsonb;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old) - skipped;
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new) - skipped;
  end if;
  latest := case when tg_op = 'DELETE' then old_row else new_row end;

  select coalesce(jsonb_object_agg(k.key, jsonb_build_array(old_row -> k.key, new_row -> k.key)), '{}')
    into changed
    from jsonb_object_keys(old_row || new_row) as k (key)
   where old_row -> k.key is distinct from new_row -> k.key;

  if changed = '{}' then
    return null;
  end if;

  insert into audit.log (
    tenant_id, actor_user_id, actor_role, source, action, table_name, row_id,
    subject_employee_id, diff, request_id
  )
  values (
    (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid,
    app.user_id(),
    app.role(),
    'trigger',
    lower(tg_op),
    tg_table_name,
    (latest ->> 'id')::uuid,
    (latest ->> 'employee_id')::uuid,
    changed,
    nullif(current_setting('app.request_id', true), '')::uuid
  );

  return null;
end;
$$;


--
-- Name: login_failed(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.login_failed(p_user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- from the fifth miss in a row the account locks for 1, 2, 4 ... 64 minutes
  update auth.credentials c
     set failed_count = c.failed_count + 1,
         locked_until = case
           when c.failed_count >= 4 then now() + interval '1 minute' * power(2, least(c.failed_count - 4, 6))
         end
   where c.user_id = p_user_id
  returning c.locked_until;
$$;


--
-- Name: login_lookup(text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.login_lookup(p_email text) RETURNS TABLE(user_id uuid, tenant_id uuid, role app.user_role, status app.user_status, password_hash text, failed_count integer, locked_until timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.tenant_id, u.role, u.status, c.password_hash, coalesce(c.failed_count, 0), c.locked_until
    from app.users u
    left join auth.credentials c on c.user_id = u.id
   -- search_path is empty, so the citext operator has to be named or = compares case-sensitively
   where u.email operator(public.=) p_email::public.citext
     and u.status in ('active', 'invited');
$$;


--
-- Name: password_set(uuid, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.password_set(p_user_id uuid, p_password_hash text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into auth.credentials (user_id, password_hash)
  values (p_user_id, p_password_hash)
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, failed_count = 0, locked_until = null;

  -- choosing a password is what turns an invitation into an account
  update app.users u set status = 'active' where u.id = p_user_id and u.status = 'invited';
$$;


--
-- Name: purge_expired(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.purge_expired() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.idle_expires_at <= now();
  delete from auth.tokens t where t.expires_at <= now();
$$;


--
-- Name: session_create(uuid, bytea, bytea, inet, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_create(p_user_id uuid, p_token_hash bytea, p_csrf_hash bytea, p_ip inet, p_user_agent text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  sid uuid;
begin
  update app.users u set last_login_at = now()
   where u.id = p_user_id and u.status in ('active', 'demo');
  if not found then
    raise exception 'user % may not sign in', p_user_id using errcode = '28000';
  end if;

  update auth.credentials c set failed_count = 0, locked_until = null
   where c.user_id = p_user_id and c.failed_count > 0;

  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent
  )
  values (
    p_user_id, p_token_hash, p_csrf_hash, now() + interval '12 hours', now() + interval '7 days',
    p_ip, p_user_agent
  )
  returning id into sid;

  return sid;
end;
$$;


--
-- Name: session_resolve(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_resolve(p_token_hash bytea) RETURNS TABLE(session_id uuid, user_id uuid, tenant_id uuid, role app.user_role, employee_id uuid, csrf_hash bytea)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with hit as (
    select s.id, s.last_seen_at, s.csrf_hash, u.id as user_id, u.tenant_id, u.role, u.employee_id
      from auth.sessions s
      join app.users u on u.id = s.user_id
      join app.tenants t on t.id = u.tenant_id
     where s.token_hash = p_token_hash
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
       and u.status in ('active', 'demo')
       and (t.expires_at is null or t.expires_at > now())
  ), touched as (
    -- one write per session and minute keeps the idle window close enough without a write per request
    update auth.sessions s
       set idle_expires_at = least(now() + interval '12 hours', s.absolute_expires_at),
           last_seen_at = now()
      from hit
     where s.id = hit.id
       and hit.last_seen_at < now() - interval '1 minute'
  )
  select hit.id, hit.user_id, hit.tenant_id, hit.role, hit.employee_id, hit.csrf_hash
    from hit;
$$;


--
-- Name: session_revoke(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke(p_token_hash bytea) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.token_hash = p_token_hash;
$$;


--
-- Name: session_revoke_all(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke_all(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.user_id = p_user_id;
$$;


--
-- Name: token_consume(bytea, auth.token_kind); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_consume(p_token_hash bytea, p_kind auth.token_kind) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update auth.tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.kind = p_kind
     and t.used_at is null
     and t.expires_at > now()
  returning t.user_id;
$$;


--
-- Name: token_issue(uuid, auth.token_kind, bytea, interval); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_issue(p_user_id uuid, p_kind auth.token_kind, p_token_hash bytea, p_ttl interval) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- the open token of the same kind is overwritten, so only the newest link works
  insert into auth.tokens as t (user_id, kind, token_hash, expires_at)
  values (p_user_id, p_kind, p_token_hash, now() + p_ttl)
  on conflict (user_id, kind) where used_at is null do update
    set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()
  returning t.expires_at;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tenants; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug public.citext NOT NULL,
    state app.federal_state NOT NULL,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    holiday_options text[] DEFAULT '{}'::text[] NOT NULL,
    half_days_dec24_31 boolean DEFAULT false NOT NULL,
    flex_cap_plus_min integer,
    flex_cap_minus_min integer,
    flex_cap_mode app.flex_cap_mode DEFAULT 'none'::app.flex_cap_mode NOT NULL,
    carryover_until text DEFAULT '03-31'::text NOT NULL,
    kind app.tenant_kind DEFAULT 'live'::app.tenant_kind NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_carryover_until_check CHECK ((carryover_until ~ '^((0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)$'::text)),
    CONSTRAINT tenants_check CHECK (((kind = 'sandbox'::app.tenant_kind) = (expires_at IS NOT NULL))),
    CONSTRAINT tenants_flex_cap_minus_min_check CHECK ((flex_cap_minus_min >= 0)),
    CONSTRAINT tenants_flex_cap_plus_min_check CHECK ((flex_cap_plus_min >= 0)),
    CONSTRAINT tenants_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT tenants_slug_check CHECK (((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT tenants_timezone_check CHECK ((timezone = 'Europe/Berlin'::text))
);

ALTER TABLE ONLY app.tenants FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text NOT NULL,
    role app.user_role DEFAULT 'employee'::app.user_role NOT NULL,
    locale text DEFAULT 'de'::text NOT NULL,
    status app.user_status DEFAULT 'invited'::app.user_status NOT NULL,
    employee_id uuid,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_display_name_check CHECK ((btrim(display_name) <> ''::text)),
    CONSTRAINT users_email_check CHECK (((email)::text ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text)),
    CONSTRAINT users_locale_check CHECK ((locale = ANY (ARRAY['de'::text, 'en'::text])))
);

ALTER TABLE ONLY app.users FORCE ROW LEVEL SECURITY;


--
-- Name: log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.log (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_role app.user_role,
    source text NOT NULL,
    action text NOT NULL,
    table_name text,
    row_id uuid,
    subject_employee_id uuid,
    diff jsonb,
    request_id uuid,
    ip inet,
    CONSTRAINT log_check CHECK (((ip IS NULL) OR (source = 'app'::text))),
    CONSTRAINT log_source_check CHECK ((source = ANY (ARRAY['trigger'::text, 'app'::text])))
);

ALTER TABLE ONLY audit.log FORCE ROW LEVEL SECURITY;


--
-- Name: log_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.credentials (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credentials_failed_count_check CHECK ((failed_count >= 0)),
    CONSTRAINT credentials_password_hash_check CHECK ((password_hash ~~ '$argon2id$%'::text))
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    csrf_hash bytea NOT NULL,
    idle_expires_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_check CHECK ((idle_expires_at <= absolute_expires_at)),
    CONSTRAINT sessions_csrf_hash_check CHECK ((octet_length(csrf_hash) = 32)),
    CONSTRAINT sessions_token_hash_check CHECK ((octet_length(token_hash) = 32))
);


--
-- Name: tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind auth.token_kind NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tokens_check CHECK ((expires_at > created_at)),
    CONSTRAINT tokens_token_hash_check CHECK ((octet_length(token_hash) = 32))
);


--
-- Name: demo_outbox; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.demo_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    recipient public.citext NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.rate_limits (
    key text NOT NULL,
    hits integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    blocked_until timestamp with time zone,
    CONSTRAINT rate_limits_hits_check CHECK ((hits > 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_employee_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_employee_id_key UNIQUE (employee_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: log log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.log
    ADD CONSTRAINT log_pkey PRIMARY KEY (id);


--
-- Name: credentials credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.credentials
    ADD CONSTRAINT credentials_pkey PRIMARY KEY (user_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_token_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: demo_outbox demo_outbox_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.demo_outbox
    ADD CONSTRAINT demo_outbox_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: log_tenant_occurred_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_occurred_idx ON audit.log USING btree (tenant_id, occurred_at DESC);


--
-- Name: log_tenant_row_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_row_idx ON audit.log USING btree (tenant_id, table_name, row_id);


--
-- Name: log_tenant_subject_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_subject_idx ON audit.log USING btree (tenant_id, subject_employee_id, occurred_at DESC);


--
-- Name: sessions_idle_expires_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_idle_expires_idx ON auth.sessions USING btree (idle_expires_at);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_idx ON auth.sessions USING btree (user_id);


--
-- Name: tokens_expires_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX tokens_expires_idx ON auth.tokens USING btree (expires_at);


--
-- Name: tokens_open_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX tokens_open_idx ON auth.tokens USING btree (user_id, kind) WHERE (used_at IS NULL);


--
-- Name: demo_outbox_tenant_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX demo_outbox_tenant_idx ON ops.demo_outbox USING btree (tenant_id, created_at DESC);


--
-- Name: rate_limits_expires_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX rate_limits_expires_idx ON ops.rate_limits USING btree (expires_at);


--
-- Name: tenants audit_tenants; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_tenants AFTER INSERT OR DELETE OR UPDATE ON app.tenants FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: users audit_users; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_users AFTER INSERT OR DELETE OR UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: tenants tenants_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON app.tenants FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: log log_append_only; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_append_only BEFORE DELETE OR UPDATE ON audit.log FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: log log_no_truncate; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_no_truncate BEFORE TRUNCATE ON audit.log FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: credentials credentials_set_updated_at; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER credentials_set_updated_at BEFORE UPDATE ON auth.credentials FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: credentials credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.credentials
    ADD CONSTRAINT credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: tokens tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: demo_outbox demo_outbox_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.demo_outbox
    ADD CONSTRAINT demo_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: tenants admins change the tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins change the tenant" ON app.tenants FOR UPDATE TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: tenants admins create the tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins create the tenant" ON app.tenants FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: users admins manage users; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins manage users" ON app.users TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: users hr and admins read all users; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr and admins read all users" ON app.users FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: tenants members read their tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read their tenant" ON app.tenants FOR SELECT TO zeit_app USING (true);


--
-- Name: users read own user; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own user" ON app.users FOR SELECT TO zeit_app USING ((id = ( SELECT app.user_id() AS user_id)));


--
-- Name: tenants tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.tenants AS RESTRICTIVE TO zeit_app USING ((id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: users tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.users AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: tenants; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: users update own user; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "update own user" ON app.users FOR UPDATE TO zeit_app USING ((id = ( SELECT app.user_id() AS user_id))) WITH CHECK (((id = ( SELECT app.user_id() AS user_id)) AND (role = ( SELECT app.role() AS role)) AND (NOT (employee_id IS DISTINCT FROM ( SELECT app.employee_id() AS employee_id)))));


--
-- Name: users; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;

--
-- Name: log append app events; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "append app events" ON audit.log FOR INSERT TO zeit_app WITH CHECK (((source = 'app'::text) AND (NOT (actor_user_id IS DISTINCT FROM ( SELECT app.user_id() AS user_id))) AND (NOT (actor_role IS DISTINCT FROM ( SELECT app.role() AS role)))));


--
-- Name: log hr and admins read the trail; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "hr and admins read the trail" ON audit.log FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: log; Type: ROW SECURITY; Schema: audit; Owner: -
--

ALTER TABLE audit.log ENABLE ROW LEVEL SECURITY;

--
-- Name: log read own trail; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "read own trail" ON audit.log FOR SELECT TO zeit_app USING (((subject_employee_id = ( SELECT app.employee_id() AS employee_id)) OR (actor_user_id = ( SELECT app.user_id() AS user_id))));


--
-- Name: log tenant fence; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "tenant fence" ON audit.log AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260923000000');
