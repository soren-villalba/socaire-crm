-- =====================================================================
-- socaire · CRM interno — refuerzo de seguridad (Fase B)
-- Correr completo en Supabase → SQL Editor → Run.
-- Se puede correr varias veces sin problema (no borra ni modifica datos del negocio).
--
-- Qué hace:
--  1. Usuarios nuevos entran INACTIVOS y sin roles: el administrador los aprueba.
--  2. Quita permisos que sobraban a visitantes sin sesión (anon).
--  3. Quita a usuarios con sesión permisos que la app no usa (borrar, vaciar tablas).
--  4. "Creado por" lo pone la base, no el navegador (no se puede falsificar).
--  5. Candado: solo el administrador cambia roles, estado y costo/hora de un usuario,
--     y nunca se puede quedar el CRM sin un administrador activo.
--  6. El historial de cambios completo (copias de cada registro, con datos fiscales)
--     ya no se puede leer desde la app; la app solo ve el resumen.
--  7. Funciones con search_path fijo.
-- =====================================================================

-- ---------- 1. Alta de usuarios nuevos: inactivos hasta que el admin los apruebe ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, email, roles, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when is_first then array['admin','direccion','comercial','desarrollo','soporte'] else array[]::text[] end,
    is_first  -- solo el primer usuario entra activo; los demás esperan aprobación
  );
  return new;
end $$;

-- ---------- 2 y 3. Permisos de la API ----------
-- Visitantes sin sesión: nada en tablas, secuencias ni funciones.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Usuarios con sesión: leer, crear y editar (las reglas RLS siguen decidiendo qué filas).
-- Se quitan borrar, vaciar tablas (TRUNCATE no respeta RLS), referencias y triggers.
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke delete, truncate, references, trigger on tables from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Las funciones de permisos las usan las reglas RLS; las de trigger no se llaman desde la API.
grant execute on function public.is_member() to authenticated;
grant execute on function public.has_role(text) to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.audit_row() from authenticated;
revoke execute on function public.set_updated_at() from authenticated;

-- ---------- 4. "Creado por" lo fija la base ----------
create or replace function public.stamp_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Desde la app siempre es el usuario con sesión. Desde el SQL Editor (sin sesión) se respeta lo que venga.
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.stamp_created_by() from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array['clients','contacts','branches','leads','opportunities','products','quotes','quote_items',
    'subscriptions','referrals','invoices','payments','projects','project_phases','change_requests','time_entries',
    'tasks','interactions','tickets','documents','settings'] loop
    execute format('drop trigger if exists stamp_created_by on public.%I', t);
    execute format('create trigger stamp_created_by before insert or update on public.%I for each row execute function public.stamp_created_by()', t);
  end loop;
end $$;

-- ---------- 5. Candado de perfiles ----------
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin sesión (SQL Editor / panel de Supabase) no se aplica el candado.
  if auth.uid() is null then return new; end if;

  if not public.has_role('admin') then
    if new.roles is distinct from old.roles
       or new.active is distinct from old.active
       or new.deleted_at is distinct from old.deleted_at
       or new.hourly_cost is distinct from old.hourly_cost
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Solo el administrador puede cambiar roles, estado, correo o costo por hora.';
    end if;
  end if;

  -- Nunca dejar el CRM sin un administrador activo.
  if ('admin' = any(old.roles) and old.active and old.deleted_at is null)
     and not ('admin' = any(new.roles) and new.active and new.deleted_at is null)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and 'admin' = any(p.roles) and p.active and p.deleted_at is null
     ) then
    raise exception 'Debe quedar al menos un administrador activo.';
  end if;

  return new;
end $$;
revoke execute on function public.guard_profile() from anon, authenticated, public;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
for each row execute function public.guard_profile();

-- La regla de "editar mi propio perfil" ahora es simple: el candado de arriba hace el resto.
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_member()) with check (id = auth.uid());

-- ---------- 6. Historial de cambios: la app solo ve el resumen ----------
-- Las copias completas (old_data / new_data) siguen guardándose y se consultan
-- desde el panel de Supabase (Table Editor → audit_logs), no desde la app.
revoke all on public.audit_logs from authenticated;
grant select (id, table_name, record_id, action, changed_by, changed_at, summary) on public.audit_logs to authenticated;

-- ---------- 7. search_path fijo ----------
alter function public.set_updated_at() set search_path = '';

-- ---------- Verificación: mándame una captura de este resultado ----------
select
  (select count(*) from public.profiles where active and 'admin' = any(roles)) as admins_activos,
  (select count(*) from public.profiles where not active) as usuarios_pendientes,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as tablas_sin_rls,
  has_table_privilege('anon', 'public.clients', 'select') as anon_puede_leer_clientes,
  has_table_privilege('authenticated', 'public.clients', 'delete') as usuarios_pueden_borrar,
  has_function_privilege('anon', 'public.has_role(text)', 'execute') as anon_ejecuta_funciones;
-- Resultado esperado: admins_activos ≥ 1, tablas_sin_rls = 0 y las tres últimas en false.
