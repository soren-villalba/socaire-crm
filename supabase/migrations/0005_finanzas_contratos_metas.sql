-- =====================================================================
-- socaire · CRM interno — Entrega B: gastos, servicios y renovaciones,
-- contratos y metas a 12 meses
-- Correr completo en Supabase → SQL Editor → Run, ANTES de mergear el PR.
-- Se puede correr varias veces sin problema (no borra ni modifica datos).
--
-- Qué hace:
--  1. Tabla expenses (gastos): sustituye la hoja Egresos del Excel.
--  2. Tabla assets (servicios y renovaciones): sustituye la hoja Alojamiento.
--     Nunca guarda contraseñas, solo la cuenta de acceso.
--  3. Tabla contracts (contratos): permanencia, renovación y alta bonificada.
--  4. Mismas reglas que el resto: auditoría, updated_at, "creado por" fijado
--     por la base, RLS. Gastos y servicios = Finanzas (solo Dirección/Admin
--     capturan; todos los miembros leen). Contratos = cualquier miembro.
--  5. Metas a 12 meses iniciales (settings → goals).
-- =====================================================================

-- ---------- 1. Gastos ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  vendor text,
  concept text not null,
  category text not null default 'otros',
  kind text not null default 'operativo' check (kind in ('directo','operativo')),
  client_id uuid references public.clients(id),
  project_id uuid references public.projects(id),
  product_id uuid references public.products(id),
  asset_id uuid,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'pagado' check (status in ('pagado','pendiente')),
  due_date date,
  method text check (method in ('transferencia','efectivo','tarjeta','otro')),
  cfdi_folio text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- 2. Servicios y renovaciones (dominios, hosting, bases de datos, licencias) ----------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'otro' check (kind in ('dominio','hosting','base_datos','repositorio','correo','software','api','diseno','otro')),
  provider text,
  url text check (url is null or url ~* '^https://'),
  account text,
  product_id uuid references public.products(id),
  client_id uuid references public.clients(id),
  cost_type text not null default 'mensual' check (cost_type in ('mensual','anual','por_cliente','unico','gratis')),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  renewal_date date,
  status text not null default 'activo' check (status in ('activo','cancelado')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_asset_id_fkey') then
    alter table public.expenses add constraint expenses_asset_id_fkey foreign key (asset_id) references public.assets(id);
  end if;
end $$;

-- ---------- 3. Contratos ----------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  subscription_id uuid references public.subscriptions(id),
  project_id uuid references public.projects(id),
  quote_id uuid references public.quotes(id),
  title text not null,
  kind text not null default 'servicio_saas' check (kind in ('servicio_saas','desarrollo','nda','datos','otro')),
  status text not null default 'borrador' check (status in ('borrador','enviado','firmado','terminado')),
  sent_date date,
  signed_date date,
  start_date date,
  min_term_months integer not null default 6 check (min_term_months >= 0),
  auto_renew boolean not null default true,
  renewal_notice_days integer not null default 30 check (renewal_notice_days >= 0),
  setup_fee_waived numeric(12,2) not null default 0 check (setup_fee_waived >= 0),
  terminated_date date,
  document_url text check (document_url is null or document_url ~* '^https://'),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- 4. Triggers, permisos y RLS (igual que las demás tablas) ----------
do $$
declare t text;
begin
  foreach t in array array['expenses','assets','contracts'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('drop trigger if exists stamp_created_by on public.%I', t);
    execute format('create trigger stamp_created_by before insert or update on public.%I for each row execute function public.stamp_created_by()', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%1$s_read" on public.%1$I', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('drop policy if exists "%1$s_finance_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_finance_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_member_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_member_update" on public.%1$I', t);
    if t in ('expenses','assets') then
      execute format('create policy "%1$s_finance_insert" on public.%1$I for insert to authenticated with check (public.has_role(''direccion''))', t);
      execute format('create policy "%1$s_finance_update" on public.%1$I for update to authenticated using (public.has_role(''direccion'')) with check (public.has_role(''direccion''))', t);
    else
      execute format('create policy "%1$s_member_insert" on public.%1$I for insert to authenticated with check (public.is_member())', t);
      execute format('create policy "%1$s_member_update" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    end if;

    -- Sin DELETE ni TRUNCATE: el borrado es lógico y queda auditado. Sin acceso para anon.
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create index if not exists expenses_date_idx on public.expenses (expense_date);
create index if not exists expenses_client_idx on public.expenses (client_id);
create index if not exists assets_renewal_idx on public.assets (renewal_date);
create index if not exists contracts_client_idx on public.contracts (client_id);

-- ---------- 5. Metas a 12 meses (de 01_Estrategia/04_Metas_12_meses.md) ----------
insert into public.settings (key, value) values ('goals', '{"items": [
  {"id": "g1", "name": "10 clientes activos al mismo tiempo", "metric": "clientes_activos", "target": 10, "due": "2027-11-30"},
  {"id": "g2", "name": "Primera factura (CFDI emitido)", "metric": "facturas", "target": 1, "due": "2027-03-31"},
  {"id": "g3", "name": "Constituir la SAS (acta y RFC)", "metric": "manual", "target": 1, "due": "2027-02-28"},
  {"id": "g4", "name": "Contrato base, NDA y aviso de privacidad listos", "metric": "manual", "target": 1, "due": "2027-02-28"},
  {"id": "g5", "name": "Modelo de suscripción + desarrollo con precios definidos", "metric": "manual", "target": 1, "due": "2027-01-31"},
  {"id": "g6", "name": "Ecosistema / app propio (MVP)", "metric": "manual", "target": 1, "due": "2027-11-30"},
  {"id": "g7", "name": "Equipo de 2 a 3 personas", "metric": "usuarios_activos", "target": 3, "due": "2027-11-30"}
]}'::jsonb)
on conflict (key) do nothing;

-- Que la API de Supabase vea las tablas nuevas de inmediato.
notify pgrst, 'reload schema';

-- ---------- Verificación: mándame una captura de este resultado ----------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('expenses','assets','contracts') and c.relrowsecurity) as tablas_nuevas_con_rls,
  (select count(*) from public.settings where key = 'goals') as metas_cargadas,
  has_table_privilege('anon', 'public.expenses', 'select') as anon_puede_leer_gastos,
  has_table_privilege('authenticated', 'public.contracts', 'delete') as usuarios_pueden_borrar;
-- Resultado esperado: tablas_nuevas_con_rls = 3, metas_cargadas = 1 y las dos últimas en false.
