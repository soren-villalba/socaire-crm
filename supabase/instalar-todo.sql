-- =====================================================================
-- socaire · CRM interno — instalación completa en Supabase (un solo script)
-- Antes de correrlo: crea en Authentication → Users a los 2 usuarios
-- (primero tú, después tu papá). Córrelo UNA sola vez en un proyecto nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1 · Esquema, permisos (RLS) y auditoría
-- ---------------------------------------------------------------------
-- =====================================================================
-- socaire · CRM interno — esquema inicial (Supabase / PostgreSQL)
-- Ejecutar completo en el SQL Editor de un proyecto NUEVO de Supabase.
-- Incluye: tablas, índices, updated_at automático, auditoría,
-- perfiles ligados a Auth y permisos por rol con RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Utilidades ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Usuarios internos ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null default '',
  roles text[] not null default array['comercial'],
  hourly_cost numeric(12,2) not null default 0,
  active boolean not null default true,
  initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);

-- Al crear un usuario en Auth se crea su perfil. El PRIMER usuario es administrador.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, email, roles)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when is_first then array['admin','direccion','comercial','desarrollo','soporte'] else array['comercial'] end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Ayudantes de permisos (security definer para evitar recursión en RLS)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.deleted_at is null)
$$;

create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.deleted_at is null
      and (r = any(p.roles) or 'admin' = any(p.roles))
  )
$$;

-- ---------- Comercial ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  legal_name text, tax_id text, tax_regime text, tax_zip text, cfdi_use text, billing_email text,
  industry text, size text, website text, email text, phone text, city text,
  status text not null default 'prospecto' check (status in ('prospecto','activo','en_riesgo','inactivo','perdido')),
  acquisition_source text,
  referred_by_client_id uuid references public.clients(id),
  account_manager_id uuid references public.profiles(id),
  importance text not null default 'media' check (importance in ('alta','media','baja')),
  relationship_start date,
  total_branches int,
  peak_seasons text,
  folder_path text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null, role text, phone text, email text,
  is_primary boolean not null default false,
  is_approver boolean not null default false,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, company text, phone text, email text, source text,
  status text not null default 'nuevo' check (status in ('nuevo','contactado','calificado','descartado','convertido')),
  owner_id uuid references public.profiles(id),
  notes text,
  converted_client_id uuid references public.clients(id),
  converted_opportunity_id uuid,
  converted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('saas','desarrollo','servicio')),
  billing text not null check (billing in ('mensual','unico','por_hora')),
  unit text not null default 'unidad',
  list_price numeric(12,2) not null default 0,
  intro_price numeric(12,2), setup_fee numeric(12,2),
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  lead_id uuid references public.leads(id),
  title text not null, description text,
  service_type text not null default 'saas' check (service_type in ('saas','a_medida','consultoria','otro')),
  product_id uuid references public.products(id),
  stage text not null default 'nuevo' check (stage in ('nuevo','primer_contacto','calificacion','diagnostico','propuesta','negociacion','ganada','perdida')),
  estimated_value numeric(12,2) not null default 0,
  estimated_mrr numeric(12,2) not null default 0,
  probability int not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references public.profiles(id),
  next_followup_date date,
  next_step text,
  lost_reason text,
  closed_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz,
  -- Reglas de negocio: una perdida registra motivo
  constraint lost_needs_reason check (stage <> 'perdida' or coalesce(lost_reason,'') <> '')
);
alter table public.leads add constraint leads_converted_opp_fk foreign key (converted_opportunity_id) references public.opportunities(id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  version int not null default 1,
  previous_version_id uuid references public.quotes(id),
  opportunity_id uuid references public.opportunities(id),
  client_id uuid not null references public.clients(id),
  issue_date date not null default current_date,
  valid_until date,
  status text not null default 'borrador' check (status in ('borrador','enviada','aceptada','rechazada','vencida','reemplazada')),
  title text, conditions text, notes text, file_path text,
  accepted_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz,
  unique (folio, version)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id),
  product_id uuid references public.products(id),
  description text not null default '',
  kind text not null default 'unico' check (kind in ('mensual','unico')),
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  sort int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- Servicios contratados y distribución ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  product_id uuid not null references public.products(id),
  quote_id uuid references public.quotes(id),
  status text not null default 'pendiente' check (status in ('pendiente','activa','pausada','cancelada')),
  quantity int not null default 1 check (quantity > 0),
  list_price numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  price_floor numeric(12,2),
  apply_referrals boolean not null default true,
  start_date date,
  billing_day int,
  min_term_months int,
  setup_fee numeric(12,2),
  setup_fee_waived boolean not null default false,
  cancellation_date date,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null, address text, phone text,
  subscription_id uuid references public.subscriptions(id),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_client_id uuid not null references public.clients(id),
  referred_client_id uuid not null references public.clients(id),
  signed_date date not null,
  first_payment_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz,
  check (referrer_client_id <> referred_client_id)
);

-- ---------- Proyectos ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  opportunity_id uuid references public.opportunities(id),
  quote_id uuid references public.quotes(id),
  name text not null, description text,
  project_type text not null default 'implementacion' check (project_type in ('implementacion','desarrollo','diagnostico','soporte')),
  status text not null default 'planeacion' check (status in ('planeacion','en_curso','en_pausa','completado','cancelado')),
  priority text not null default 'media' check (priority in ('alta','media','baja')),
  start_date date, go_live_date date, estimated_end_date date, actual_end_date date,
  budget numeric(12,2), estimated_hours numeric(8,2),
  manager_id uuid references public.profiles(id),
  freeze_window text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  sort int not null default 0,
  letter text not null, name text not null,
  milestone text not null, milestone_name text not null,
  start_date date, due_date date, done_date date,
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','hecho','bloqueado')),
  owner_id uuid references public.profiles(id),
  estimated_hours numeric(8,2),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  client_id uuid not null references public.clients(id),
  title text not null, description text,
  requested_date date not null default current_date,
  estimated_hours numeric(8,2), amount numeric(12,2),
  status text not null default 'registrado' check (status in ('registrado','estimado','cotizado','aprobado','rechazado','hecho')),
  approved_date date, approval_evidence text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz,
  -- No se ejecuta un cambio sin aprobación por escrito
  constraint change_needs_approval check (status not in ('aprobado','hecho') or approved_date is not null)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  phase_id uuid references public.project_phases(id),
  client_id uuid references public.clients(id),
  user_id uuid not null references public.profiles(id),
  date date not null default current_date,
  hours numeric(6,2) not null check (hours > 0),
  activity text not null,
  billable boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- Finanzas ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  subscription_id uuid references public.subscriptions(id),
  project_id uuid references public.projects(id),
  folio text, uuid_sat text, period text,
  concept text not null,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'emitida' check (status in ('borrador','emitida','cancelada')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id),
  client_id uuid not null references public.clients(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'transferencia' check (method in ('transferencia','efectivo','tarjeta','otro')),
  reference text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- Actividad, soporte y documentos ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text,
  kind text not null default 'tarea' check (kind in ('tarea','reunion','llamada','compromiso','recordatorio')),
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','hecha')),
  priority text not null default 'media' check (priority in ('alta','media','baja')),
  assigned_to uuid references public.profiles(id),
  due_date date, due_time text,
  completed_at timestamptz,
  client_id uuid references public.clients(id),
  related_type text check (related_type in ('client','opportunity','project','lead','invoice','ticket','quote')),
  related_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  lead_id uuid references public.leads(id),
  opportunity_id uuid references public.opportunities(id),
  project_id uuid references public.projects(id),
  kind text not null default 'nota' check (kind in ('llamada','whatsapp','correo','reunion','visita','nota')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  project_id uuid references public.projects(id),
  product_id uuid references public.products(id),
  title text not null, description text,
  category text not null default 'incidencia' check (category in ('incidencia','duda','solicitud','mejora')),
  priority text not null default 'media' check (priority in ('alta','media','baja')),
  status text not null default 'nuevo' check (status in ('nuevo','asignado','en_proceso','esperando_cliente','resuelto','cerrado')),
  assigned_to uuid references public.profiles(id),
  first_response_at timestamptz, resolved_at timestamptz, resolution text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  project_id uuid references public.projects(id),
  quote_id uuid references public.quotes(id),
  name text not null,
  kind text not null default 'otro',
  status text not null default 'borrador' check (status in ('borrador','enviado','aprobado','firmado','cerrado')),
  location text not null,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- Auditoría ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  summary text,
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_changed_at_idx on public.audit_logs (changed_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  act text := lower(tg_op);
  label text;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (rec->>'deleted_at') is not null and (to_jsonb(old)->>'deleted_at') is null then act := 'delete'; end if;
  label := coalesce(rec->>'title', rec->>'company_name', rec->>'name', rec->>'full_name', rec->>'folio', rec->>'concept', rec->>'summary', rec->>'milestone_name', rec->>'key', '');
  insert into public.audit_logs (table_name, record_id, action, changed_by, summary, old_data, new_data)
  values (tg_table_name, (rec->>'id')::uuid, act, auth.uid(), label,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------- Triggers, índices y RLS para todas las tablas ----------
do $$
declare
  t text;
  finance_tables text[] := array['subscriptions','referrals','invoices','payments','products','settings'];
  all_tables text[] := array['profiles','clients','contacts','branches','leads','opportunities','products','quotes','quote_items',
    'subscriptions','referrals','invoices','payments','projects','project_phases','change_requests','time_entries',
    'tasks','interactions','tickets','documents','settings'];
begin
  foreach t in array all_tables loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
    -- Leer: cualquier miembro activo del equipo
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.is_member())', t);
    if t = 'profiles' then
      execute 'create policy "profiles_admin_write" on public.profiles for update to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))';
      execute 'create policy "profiles_self_update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and roles = (select p.roles from public.profiles p where p.id = auth.uid()))';
    elsif t = any(finance_tables) then
      -- Finanzas: solo Administración / Dirección
      execute format('create policy "%1$s_finance_insert" on public.%1$I for insert to authenticated with check (public.has_role(''direccion''))', t);
      execute format('create policy "%1$s_finance_update" on public.%1$I for update to authenticated using (public.has_role(''direccion'')) with check (public.has_role(''direccion''))', t);
    else
      execute format('create policy "%1$s_member_insert" on public.%1$I for insert to authenticated with check (public.is_member())', t);
      execute format('create policy "%1$s_member_update" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    end if;
    -- Sin política de DELETE: el borrado es lógico (deleted_at) y queda auditado.
  end loop;
end $$;

alter table public.audit_logs enable row level security;
create policy "audit_read" on public.audit_logs for select to authenticated using (public.is_member());

-- Índices de consulta frecuente
create index on public.contacts (client_id);
create index on public.branches (client_id);
create index on public.opportunities (client_id);
create index on public.opportunities (stage);
create index on public.quotes (client_id);
create index on public.quote_items (quote_id);
create index on public.subscriptions (client_id);
create index on public.invoices (client_id);
create index on public.payments (invoice_id);
create index on public.projects (client_id);
create index on public.project_phases (project_id);
create index on public.change_requests (project_id);
create index on public.time_entries (project_id);
create index on public.tasks (assigned_to, status);
create index on public.tasks (client_id);
create index on public.interactions (client_id);
create index on public.tickets (client_id);
create index on public.documents (client_id);

-- Parámetros iniciales
insert into public.settings (key, value) values ('app', '{
  "iva_rate": 0.16, "referral_steps": [100,50,50], "referral_floor": 800, "referral_window_months": 6,
  "weekly_capacity_hours": 15, "default_hourly_cost": 400, "followup_stale_days": 7,
  "quote_expiry_warning_days": 7, "invoice_reminder_days": [3,7],
  "fixed_cost_per_package": 1000, "branches_per_package": 5
}'::jsonb);


-- Permisos de la API (las reglas RLS siguen aplicando)
-- 1) Permisos de la API para usuarios con sesión (las reglas RLS siguen aplicando)
grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2 · Perfiles de los usuarios que ya existen en Auth
-- (el primero creado queda como administrador)
-- ---------------------------------------------------------------------
insert into public.profiles (id, full_name, email, roles, hourly_cost)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email,
       case when u.rn = 1 then array['admin','direccion','comercial','desarrollo','soporte'] else array['comercial','soporte'] end,
       case when u.rn = 1 then 400 else 250 end
from (select id, email, raw_user_meta_data, row_number() over (order by created_at) rn from auth.users) u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- PARTE 3 · Datos iniciales de socaire (Brenda, Nelly, Vidriera, Baken…)
-- Responsable 1 = primer usuario (tú); 2 = segundo usuario (tu papá).
-- ---------------------------------------------------------------------
create temp table _socaire_map as
select row_number() over (order by u.created_at) as n, p.id as real_id from public.profiles p join auth.users u on u.id = p.id;
insert into _socaire_map select 2, real_id from _socaire_map where n = 1 and not exists (select 1 from _socaire_map where n = 2);

-- products (9)
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, intro_price, setup_fee, active, description) values ('22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Socaire Pedidos'::text, 'saas'::text, 'mensual'::text, 'sucursal'::text, 1600, 1000, 4500, true, 'Sistema de pedidos para florerías. Precio por sucursal; alta incluye catálogo, sucursal, configuración y capacitación.'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('fd7bcc39-4b60-492c-8927-54d7d07fde28'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'CRM a la medida'::text, 'desarrollo'::text, 'unico'::text, 'proyecto'::text, 0, true, 'Módulos activables según el negocio. Desarrollo + suscripción.'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('23a83558-b8d1-4c63-b8fe-e5319f6da16c'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Automatización n8n'::text, 'desarrollo'::text, 'unico'::text, 'proyecto'::text, 0, true, 'Flujos entre herramientas. Por proyecto + mantenimiento.'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('a46d327f-942f-4508-a397-a2d0c13ecc5e'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'WhatsApp API'::text, 'saas'::text, 'mensual'::text, 'cuenta'::text, 0, true, 'Atención y avisos automatizados. Setup + mensual.'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active) values ('58c2887d-6041-421c-a8ba-dc6344f593b6'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Integración de herramientas'::text, 'desarrollo'::text, 'unico'::text, 'proyecto'::text, 0, true);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active) values ('c84bba70-1e59-4341-93e1-2fe6c07a5663'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Capacitación'::text, 'servicio'::text, 'unico'::text, 'sesión'::text, 0, true);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('b2092633-26fa-4ffa-a971-2f91d59ec8f2'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Mantenimiento'::text, 'servicio'::text, 'mensual'::text, 'cliente'::text, 0, true, 'Soporte y mejoras por suscripción.'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('612cb71c-5155-41ec-a57f-fe2aa3b23fe5'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Estudio y diagnóstico'::text, 'servicio'::text, 'unico'::text, 'proyecto'::text, 0, true, 'Diagnóstico previo al desarrollo a la medida (p. ej. VIDRIO).'::text);
insert into public.products (id, created_at, updated_at, created_by, deleted_at, name, kind, billing, unit, list_price, active, description) values ('f41ad59f-1d33-4d10-822c-47b588de9f6d'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Actualización / cambio de alcance'::text, 'desarrollo'::text, 'por_hora'::text, 'hora'::text, 0, true, 'Cambios fuera del plan inicial (SOP 6).'::text);

-- clients (4)
insert into public.clients (id, created_at, updated_at, created_by, deleted_at, company_name, industry, size, status, acquisition_source, account_manager_id, importance, relationship_start, total_branches, peak_seasons, folder_path, notes) values ('988eafbe-410c-484d-8083-b7060525d146'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Bodega de Flores Brenda'::text, 'Florería'::text, '5 sucursales'::text, 'activo'::text, 'directo'::text, (select real_id from _socaire_map where n=1), 'alta'::text, '2026-11-12'::date, 5, '12 dic, 24 dic, 14 feb, 10 may. Congelamiento 8–26 dic.'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda'::text, 'Arranca con 1 de sus 5 sucursales para probar. Facturación: persona física, CFDI mensual. Datos fiscales pendientes.'::text);
insert into public.clients (id, created_at, updated_at, created_by, deleted_at, company_name, industry, status, importance, account_manager_id, notes) values ('f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Flores Nelly'::text, 'Florería'::text, 'prospecto'::text, 'media'::text, (select real_id from _socaire_map where n=1), 'Cotización SOC-2026-001 emitida 9 nov; estado por confirmar.'::text);
insert into public.clients (id, created_at, updated_at, created_by, deleted_at, company_name, industry, status, importance, account_manager_id, notes) values ('029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Vidriera Mar de Cristal'::text, 'Vidriería (manufactura)'::text, 'prospecto'::text, 'alta'::text, (select real_id from _socaire_map where n=1), 'Primera necesidad: control de empaque (recibido, usado, turno, quién revisa, fecha). Propuesta de diagnóstico VIDRIO.'::text);
insert into public.clients (id, created_at, updated_at, created_by, deleted_at, company_name, industry, status, importance, account_manager_id, notes) values ('cdb34279-9bae-4061-b714-6c02566b009e'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Baken Pastries'::text, 'Repostería'::text, 'prospecto'::text, 'media'::text, (select real_id from _socaire_map where n=1), 'En plática. Presentar copia adaptada de Socaire Pedidos.'::text);

-- contacts (1)
insert into public.contacts (id, created_at, updated_at, created_by, deleted_at, client_id, name, role, is_primary, is_approver, notes) values ('983aa311-f0e5-446d-9ca7-865927a463e5'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Brenda'::text, 'Dueña'::text, true, true, 'Falta definir la persona que da seguimiento.'::text);

-- opportunities (5)
insert into public.opportunities (id, created_at, updated_at, created_by, deleted_at, client_id, title, service_type, product_id, stage, estimated_value, estimated_mrr, probability, expected_close_date, closed_at, owner_id) values ('af21822f-916d-48ed-a566-e2af511d8204'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Socaire Pedidos · 1 sucursal'::text, 'saas'::text, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'ganada'::text, 0, 1000, 100, '2026-11-12'::date, '2026-11-12'::date, (select real_id from _socaire_map where n=1));
insert into public.opportunities (id, created_at, updated_at, created_by, deleted_at, client_id, title, description, service_type, product_id, stage, estimated_value, estimated_mrr, probability, expected_close_date, owner_id, next_followup_date, next_step) values ('cbc4c295-2649-484a-a4b7-c51feb396858'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Ampliar a sucursales 2–5'::text, 'Puerta de decisión en la revisión del 8 ene 2027: si la prueba fue buena, proponer sucursales 2–5 ($1,000 c/u, alta bonificada) y pedir referidos antes del 10 may.'::text, 'saas'::text, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'calificacion'::text, 0, 4000, 40, '2027-01-15'::date, (select real_id from _socaire_map where n=1), '2027-01-08'::date, 'Revisión mensual H7 y propuesta de ampliación'::text);
insert into public.opportunities (id, created_at, updated_at, created_by, deleted_at, client_id, title, service_type, product_id, stage, estimated_value, estimated_mrr, probability, expected_close_date, owner_id, next_followup_date, next_step) values ('b60eef62-f3fa-4f39-8a86-ee182a87d75e'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, 'Socaire Pedidos · 1 sucursal'::text, 'saas'::text, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'propuesta'::text, 0, 1000, 50, '2026-12-09'::date, (select real_id from _socaire_map where n=1), '2026-11-26'::date, 'Dar seguimiento a la cotización antes de que venza (9 dic)'::text);
insert into public.opportunities (id, created_at, updated_at, created_by, deleted_at, client_id, title, description, service_type, product_id, stage, estimated_value, estimated_mrr, probability, owner_id, next_followup_date, next_step) values ('a4d541ca-ab38-4361-af51-e756976a2d7c'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, 'Diagnóstico VIDRIO + software a la medida'::text, 'Propuesta de diagnóstico gratuito (2 semanas) y cotización SOC-2026-002.'::text, 'a_medida'::text, 'fd7bcc39-4b60-492c-8927-54d7d07fde28'::uuid, 'propuesta'::text, 0, 0, 40, (select real_id from _socaire_map where n=1), '2026-11-24'::date, 'Agendar visita de diagnóstico VIDRIO'::text);
insert into public.opportunities (id, created_at, updated_at, created_by, deleted_at, client_id, title, service_type, product_id, stage, estimated_value, estimated_mrr, probability, owner_id, next_followup_date, next_step) values ('4d7a93d1-a010-4cbe-b338-4e4140513683'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'cdb34279-9bae-4061-b714-6c02566b009e'::uuid, 'Socaire Pedidos adaptado para repostería'::text, 'saas'::text, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'primer_contacto'::text, 0, 1000, 15, (select real_id from _socaire_map where n=1), '2026-11-25'::date, 'Presentar copia adaptada de Socaire Pedidos (demo)'::text);

-- quotes (3)
insert into public.quotes (id, created_at, updated_at, created_by, deleted_at, folio, version, client_id, opportunity_id, issue_date, valid_until, status, title, conditions, file_path, accepted_at) values ('e80ec94d-ef1e-4565-b763-ea1f837e7473'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'SOC-2026-001'::text, 1, 'f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, 'b60eef62-f3fa-4f39-8a86-ee182a87d75e'::uuid, '2026-11-09'::date, '2026-12-09'::date, 'enviada'::text, 'Socaire Pedidos, el sistema de pedidos para tus florerías'::text, 'Vigencia 30 días. Bonificación del alta con permanencia mínima de 6 meses; si cancela antes, el alta se cobra proporcional. Referidos: −$100, −$50, −$50 por sucursal (piso $800) si firman en los primeros 6 meses; el referido paga su alta con 50% de descuento ($450). Cambios fuera del plan inicial se cotizan aparte. Precios en MXN, IVA aparte.'::text, '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-001.pdf'::text, null);
insert into public.quotes (id, created_at, updated_at, created_by, deleted_at, folio, version, client_id, opportunity_id, issue_date, valid_until, status, title, conditions, file_path, accepted_at) values ('2760c26d-8a8c-4aae-a4d9-171a81b5603a'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'SOC-2026-002'::text, 1, '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, 'a4d541ca-ab38-4361-af51-e756976a2d7c'::uuid, '2026-11-09'::date, '2026-12-09'::date, 'enviada'::text, 'Socaire Pedidos, el sistema de pedidos para tus florerías'::text, 'Vigencia 30 días. Bonificación del alta con permanencia mínima de 6 meses; si cancela antes, el alta se cobra proporcional. Referidos: −$100, −$50, −$50 por sucursal (piso $800) si firman en los primeros 6 meses; el referido paga su alta con 50% de descuento ($450). Cambios fuera del plan inicial se cotizan aparte. Precios en MXN, IVA aparte.'::text, '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-002.pdf'::text, null);
insert into public.quotes (id, created_at, updated_at, created_by, deleted_at, folio, version, client_id, opportunity_id, issue_date, valid_until, status, title, conditions, file_path, accepted_at) values ('4f1c58a8-6828-4894-9d14-a4c9f5cfb258'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'SOC-2026-003'::text, 1, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'af21822f-916d-48ed-a566-e2af511d8204'::uuid, '2026-11-09'::date, '2026-12-09'::date, 'aceptada'::text, 'Socaire Pedidos, el sistema de pedidos para tus florerías'::text, 'Vigencia 30 días. Bonificación del alta con permanencia mínima de 6 meses; si cancela antes, el alta se cobra proporcional. Referidos: −$100, −$50, −$50 por sucursal (piso $800) si firman en los primeros 6 meses; el referido paga su alta con 50% de descuento ($450). Cambios fuera del plan inicial se cotizan aparte. Precios en MXN, IVA aparte.'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda/02_Contrato_y_Cotizacion/Cotizacion_SOC-2026-003.pdf'::text, '2026-11-12'::date);

-- quote_items (6)
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('c213e74d-5d59-487b-aa08-821a87ae9f1d'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'e80ec94d-ef1e-4565-b763-ea1f837e7473'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Socaire Pedidos, por sucursal (precio introductorio −$600)'::text, 'mensual'::text, 1, 1600, 600, 1);
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('e87c7af2-940a-4583-b5e8-75c00365d601'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'e80ec94d-ef1e-4565-b763-ea1f837e7473'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Alta: catálogo, sucursales, configuración y capacitación (bonificada)'::text, 'unico'::text, 1, 4500, 4500, 2);
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('bb56dff6-3783-4a74-a747-fe0bc6085aa1'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '2760c26d-8a8c-4aae-a4d9-171a81b5603a'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Socaire Pedidos, por sucursal (precio introductorio −$600)'::text, 'mensual'::text, 1, 1600, 600, 1);
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('c58419a3-9e0b-44f4-b8e1-df573a4ca1cd'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '2760c26d-8a8c-4aae-a4d9-171a81b5603a'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Alta: catálogo, sucursales, configuración y capacitación (bonificada)'::text, 'unico'::text, 1, 4500, 4500, 2);
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('e179b5f9-a91e-47c9-a218-764a8ad1a615'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '4f1c58a8-6828-4894-9d14-a4c9f5cfb258'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Socaire Pedidos, por sucursal (precio introductorio −$600)'::text, 'mensual'::text, 1, 1600, 600, 1);
insert into public.quote_items (id, created_at, updated_at, created_by, deleted_at, quote_id, product_id, description, kind, quantity, unit_price, discount, sort) values ('7066243c-ece2-4c37-ae69-dee8a745180f'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '4f1c58a8-6828-4894-9d14-a4c9f5cfb258'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'Alta: catálogo, sucursales, configuración y capacitación (bonificada)'::text, 'unico'::text, 1, 4500, 4500, 2);

-- subscriptions (1)
insert into public.subscriptions (id, created_at, updated_at, created_by, deleted_at, client_id, product_id, status, quantity, list_price, unit_price, price_floor, apply_referrals, start_date, billing_day, min_term_months, setup_fee, setup_fee_waived, notes, quote_id) values ('98a43dc9-42c8-486b-8640-bc8ef11579ee'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, '22b7037a-0c43-4afb-a547-2b2ccff66549'::uuid, 'pendiente'::text, 1, 1600, 1000, 800, true, '2026-12-04'::date, 4, 6, 4500, true, 'Precio introductorio. Alta bonificada con 6 meses de permanencia; si cancela antes se cobra proporcional. Referidos −100/−50/−50 (piso $800) si firman en los primeros 6 meses.'::text, '4f1c58a8-6828-4894-9d14-a4c9f5cfb258'::uuid);

-- branches (5)
insert into public.branches (id, created_at, updated_at, created_by, deleted_at, client_id, name, subscription_id, notes) values ('172411bc-ceaf-4ac1-88b4-4dc04a7a7ae6'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Sucursal 1 (piloto)'::text, '98a43dc9-42c8-486b-8640-bc8ef11579ee'::uuid, 'Dirección y horario: pendientes (lista FLORES).'::text);
insert into public.branches (id, created_at, updated_at, created_by, deleted_at, client_id, name, subscription_id) values ('7f2e3c2d-72d7-417e-82cc-4c3c2e23e662'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Sucursal 2'::text, null);
insert into public.branches (id, created_at, updated_at, created_by, deleted_at, client_id, name, subscription_id) values ('2fa5d2af-333a-4dd5-8efa-73c9d8ad7e55'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Sucursal 3'::text, null);
insert into public.branches (id, created_at, updated_at, created_by, deleted_at, client_id, name, subscription_id) values ('2e407d55-c72a-4ce1-bee1-59a28a287a17'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Sucursal 4'::text, null);
insert into public.branches (id, created_at, updated_at, created_by, deleted_at, client_id, name, subscription_id) values ('38f785e9-e0ab-430a-8665-5c464f979f48'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'Sucursal 5'::text, null);

-- projects (1)
insert into public.projects (id, created_at, updated_at, created_by, deleted_at, client_id, opportunity_id, quote_id, name, project_type, status, priority, start_date, go_live_date, estimated_end_date, estimated_hours, manager_id, freeze_window, notes) values ('9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'af21822f-916d-48ed-a566-e2af511d8204'::uuid, '4f1c58a8-6828-4894-9d14-a4c9f5cfb258'::uuid, 'Implementación Socaire Pedidos · Brenda'::text, 'implementacion'::text, 'en_curso'::text, 'alta'::text, '2026-11-13'::date, '2026-12-04'::date, '2027-01-08'::date, 25, (select real_id from _socaire_map where n=1), '8–26 dic (temporada alta). Si H5 no es antes del lun 7 dic, la salida pasa al lun 11 ene 2027.'::text, 'Salida en paralelo con su método actual. Brenda conserva su método como respaldo hasta pasar el 12 dic.'::text);

-- project_phases (7)
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('8719e0b8-1620-4ede-b609-3d0f388565cb'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 1, 'V'::text, 'Validar'::text, 'H1'::text, 'Alcance y condiciones aceptados por escrito'::text, '2026-11-13'::date, '2026-11-17'::date, (select real_id from _socaire_map where n=1), 2, 'Confirmar 1 sucursal y condiciones, datos fiscales, aviso de privacidad, carpeta y ficha, kickoff.'::text, 'en_curso'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('5ef7ef8d-fc17-4f9f-be9e-ac30188e8dc3'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 2, 'E'::text, 'Entrada de datos'::text, 'H2'::text, 'Paquete de información completo (FLORES)'::text, '2026-11-18'::date, '2026-11-23'::date, (select real_id from _socaire_map where n=2), 3, 'Kickoff 60–90 min y checklist FLORES.'::text, 'pendiente'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('906c9411-64bc-4955-aca0-a0c6a7832cd4'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 3, 'L'::text, 'Levantar'::text, 'H3'::text, 'Ambiente listo y revisado'::text, '2026-11-23'::date, '2026-11-27'::date, (select real_id from _socaire_map where n=1), 8, 'Depende del esquema multi-cliente.'::text, 'pendiente'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('53f79761-3f0f-487f-afc7-ec194fe1c8c0'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 4, 'E'::text, 'Ensayar'::text, 'H4'::text, 'Demo aprobada y equipo capacitado'::text, '2026-11-30'::date, '2026-12-03'::date, (select real_id from _socaire_map where n=2), 5, '10 pedidos de prueba, capacitación, guía de 1 página.'::text, 'pendiente'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('8bcfdb64-33c5-414e-899c-1db5140811b8'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 5, 'R'::text, 'Rumbo a producción'::text, 'H5'::text, 'Primer pedido real (go-live)'::text, '2026-12-04'::date, '2026-12-04'::date, (select real_id from _socaire_map where n=2), 3, 'Salida en paralelo, canal único de soporte, primer CFDI.'::text, 'pendiente'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('b4515f3b-d0ac-4e6f-9600-85f49166d8e2'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 6, 'O'::text, 'Observar'::text, 'H6'::text, 'Acta de entrega firmada'::text, '2026-12-04'::date, '2026-12-18'::date, (select real_id from _socaire_map where n=1), 3, 'Acompañamiento diario 2 semanas, bitácora de incidencias.'::text, 'pendiente'::text);
insert into public.project_phases (id, created_at, updated_at, created_by, deleted_at, project_id, sort, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status) values ('447fbeb5-3c50-4059-b4bc-a24b7856cc37'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 7, 'O'::text, 'Observar'::text, 'H7'::text, 'Revisión mensual y puerta de ampliación'::text, '2027-01-04'::date, '2027-01-08'::date, (select real_id from _socaire_map where n=1), 1, 'Medir contra la línea base; pedir referidos.'::text, 'pendiente'::text);

-- tasks (12)
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('ff67700d-d1c1-4e4c-9439-c028bfe41d40'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Confirmar a Brenda por escrito: 1 sucursal, $1,000/mes desde el 4 dic'::text, '2026-11-17'::date, (select real_id from _socaire_map where n=1), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'project'::text, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 'alta'::text, 'compromiso'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status, description) values ('66578354-9755-4703-bf50-617abdb1ec63'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Pedir a Brenda datos fiscales para el CFDI'::text, '2026-11-17'::date, (select real_id from _socaire_map where n=1), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'client'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'alta'::text, 'tarea'::text, 'pendiente'::text, 'Nombre completo, RFC, CP fiscal, régimen, uso de CFDI y correo.'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('a4d7ee78-bbad-4efb-ab69-465cdd7177e9'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Definir quién da seguimiento y aprueba del lado de Brenda'::text, '2026-11-18'::date, (select real_id from _socaire_map where n=2), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'client'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'alta'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('f03fea19-ed82-4f5f-a669-87b0dfee23f5'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Recibir paquete FLORES completo'::text, '2026-11-23'::date, (select real_id from _socaire_map where n=2), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'project'::text, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 'alta'::text, 'compromiso'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('b354f2ed-2ffb-4963-82d5-ec6e75ee5a91'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Cerrar y probar el esquema multi-cliente de Socaire Pedidos'::text, '2026-11-23'::date, (select real_id from _socaire_map where n=1), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'project'::text, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid, 'alta'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('53a55b7b-dc2a-47cb-a0ce-b43f7b9822f0'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Aviso de privacidad listo (revisión legal) antes del go-live'::text, '2026-12-03'::date, (select real_id from _socaire_map where n=1), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'client'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'alta'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('00b081cc-350b-44ff-91de-7ba39ddf9894'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Confirmar régimen y emisión de CFDI como persona física con contador'::text, '2026-12-03'::date, (select real_id from _socaire_map where n=1), null, null, null, 'alta'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('1bc78809-54a1-45ec-b52e-8ec33577fde1'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Firmar acuerdo de colaboración y confidencialidad (papá)'::text, '2026-11-27'::date, (select real_id from _socaire_map where n=1), null, null, null, 'media'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('27932c48-4cb9-4cd4-b34d-c9dfe05f3046'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Emitir primer CFDI de Brenda (go-live)'::text, '2026-12-04'::date, (select real_id from _socaire_map where n=1), '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'client'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'alta'::text, 'tarea'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('7385eba2-18b8-4c2e-9ddd-cb974644c275'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Seguimiento a cotización SOC-2026-001'::text, '2026-11-26'::date, (select real_id from _socaire_map where n=1), 'f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, 'opportunity'::text, 'b60eef62-f3fa-4f39-8a86-ee182a87d75e'::uuid, 'media'::text, 'llamada'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('9cbb62fe-abdf-4b6e-a4a1-b173f5cd069f'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Agendar visita de diagnóstico VIDRIO'::text, '2026-11-24'::date, (select real_id from _socaire_map where n=1), '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, 'opportunity'::text, 'a4d541ca-ab38-4361-af51-e756976a2d7c'::uuid, 'media'::text, 'llamada'::text, 'pendiente'::text);
insert into public.tasks (id, created_at, updated_at, created_by, deleted_at, title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status) values ('cf3bb7d3-98e3-4c27-bbc0-ba0fd6d17993'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Constituir SAS (acta y RFC)'::text, '2027-02-15'::date, (select real_id from _socaire_map where n=1), null, null, null, 'media'::text, 'tarea'::text, 'pendiente'::text);

-- interactions (5)
insert into public.interactions (id, created_at, updated_at, created_by, deleted_at, client_id, kind, summary, occurred_at, user_id, opportunity_id) values ('ed6914db-3519-40f6-8855-04fb80abfa52'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, 'nota'::text, 'Cotización SOC-2026-001 emitida (Socaire Pedidos, 1 sucursal, $1,000/mes).'::text, '2026-11-09T12:00:00'::timestamp with time zone, (select real_id from _socaire_map where n=1), 'b60eef62-f3fa-4f39-8a86-ee182a87d75e'::uuid);
insert into public.interactions (id, created_at, updated_at, created_by, deleted_at, client_id, kind, summary, occurred_at, user_id, opportunity_id) values ('a4b70207-df25-4adb-a93e-1f80c7d249e2'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, 'nota'::text, 'Cotización SOC-2026-002 y propuesta de diagnóstico VIDRIO emitidas.'::text, '2026-11-09T12:00:00'::timestamp with time zone, (select real_id from _socaire_map where n=1), 'a4d541ca-ab38-4361-af51-e756976a2d7c'::uuid);
insert into public.interactions (id, created_at, updated_at, created_by, deleted_at, client_id, kind, summary, occurred_at, user_id, opportunity_id) values ('0606783f-24de-4d31-8a66-7acea52c977b'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'nota'::text, 'Cotización SOC-2026-003 emitida.'::text, '2026-11-09T12:00:00'::timestamp with time zone, (select real_id from _socaire_map where n=1), 'af21822f-916d-48ed-a566-e2af511d8204'::uuid);
insert into public.interactions (id, created_at, updated_at, created_by, deleted_at, client_id, kind, summary, occurred_at, user_id, opportunity_id) values ('d9b34ca5-218e-47e4-95a5-c2c9178f3316'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'whatsapp'::text, 'Brenda acepta la cotización para 1 sucursal (de 5) para probar.'::text, '2026-11-12T12:00:00'::timestamp with time zone, (select real_id from _socaire_map where n=1), 'af21822f-916d-48ed-a566-e2af511d8204'::uuid);
insert into public.interactions (id, created_at, updated_at, created_by, deleted_at, client_id, kind, summary, occurred_at, user_id, opportunity_id) values ('f5b352e5-152b-4304-a725-68a2dbc55197'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, '988eafbe-410c-484d-8083-b7060525d146'::uuid, 'nota'::text, 'Roadmap VELERO armado: go-live 4 dic, congelamiento 8–26 dic, revisión 8 ene 2027.'::text, '2026-11-13T12:00:00'::timestamp with time zone, (select real_id from _socaire_map where n=1), null);

-- documents (10)
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('8383317a-90a9-4103-ac04-7e024494fa50'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Cotización SOC-2026-003'::text, 'cotizacion'::text, 'aprobado'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda/02_Contrato_y_Cotizacion/Cotizacion_SOC-2026-003.pdf'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('c356a278-e77e-4128-abe8-409069dd2f0c'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Roadmap de entrega VELERO v1'::text, 'roadmap'::text, 'borrador'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda/03_Plan_de_Trabajo/2026-11-13_Roadmap_Entrega_Brenda_v1.md'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('dd92e471-7006-48f8-b63a-8862c3dab564'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Minuta de kickoff'::text, 'minuta'::text, 'borrador'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda/08_Minutas/2026-11-18_Minuta_Kickoff_Brenda_v1.md'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('d5d45e02-1879-46ec-8e9f-ab7ba048ce9a'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Acta de entrega'::text, 'acta'::text, 'borrador'::text, '06_Clientes/Activos/Bodega_de_Flores_Brenda/05_Entregables/Acta_Entrega_Brenda_BORRADOR.md'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, '9cf63919-b936-49c5-9f6c-4aa49bcda0ba'::uuid);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('7f6213fe-8046-45f9-92b5-142976869ec6'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Aviso de privacidad para compradores'::text, 'aviso_privacidad'::text, 'borrador'::text, '07_Legal_Fiscal/Aviso_de_Privacidad/2026-11-13_Aviso_Compradores_Brenda_BORRADOR.md'::text, '988eafbe-410c-484d-8083-b7060525d146'::uuid, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('d86e5c40-28c8-4d3b-964d-12ce94f1695c'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Cotización SOC-2026-001'::text, 'cotizacion'::text, 'enviado'::text, '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-001.pdf'::text, 'f8e6c9ed-c070-4970-930a-dbcfb386eb1c'::uuid, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('2f16e2b8-e12f-4c1f-96ab-278bdb676bd2'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Cotización SOC-2026-002'::text, 'cotizacion'::text, 'enviado'::text, '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-002.pdf'::text, '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('f2afbf8a-2fca-4d9c-aeaf-34d6c5d96c73'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Propuesta de diagnóstico VIDRIO'::text, 'propuesta'::text, 'enviado'::text, '04_Ventas/Propuestas/Socaire_Propuesta_Diagnostico_Vidriera.pdf'::text, '029f3afb-78e1-4bf1-b640-1e4c0891bb7f'::uuid, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('455ba4a7-e2f6-456f-a125-b36f7a67981b'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Acuerdo de colaboración y confidencialidad (papá)'::text, 'contrato'::text, 'borrador'::text, '07_Legal_Fiscal/Contratos/2026-11-13_Acuerdo_Colaboracion_Confidencialidad_BORRADOR.md'::text, null, null);
insert into public.documents (id, created_at, updated_at, created_by, deleted_at, name, kind, status, location, client_id, project_id) values ('905a1e04-09a2-4bee-85b9-082c58518cb6'::uuid, '2026-11-19T08:28:46.494Z'::timestamp with time zone, '2026-11-19T08:28:46.494Z'::timestamp with time zone, null, null, 'Cláusulas de tratamiento de datos'::text, 'contrato'::text, 'borrador'::text, '07_Legal_Fiscal/Contratos/2026-11-13_Clausulas_Tratamiento_Datos_BORRADOR.md'::text, null, null);

-- referencias entre registros
-- (ninguna)

-- parámetros del negocio
update public.settings set value = '{"iva_rate":0.16,"referral_steps":[100,50,50],"referral_floor":800,"referral_window_months":6,"weekly_capacity_hours":15,"default_hourly_cost":400,"followup_stale_days":7,"quote_expiry_warning_days":7,"invoice_reminder_days":[3,7],"fixed_cost_per_package":1000,"branches_per_package":5}'::jsonb where key = 'app';

drop table _socaire_map;

select 'socaire CRM instalado: ' || (select count(*) from public.clients) || ' clientes, ' || (select count(*) from public.profiles) || ' usuarios' as resultado;
