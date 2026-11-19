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
