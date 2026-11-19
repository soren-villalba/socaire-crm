-- =====================================================================
-- socaire · CRM interno — Entrega C: historial de soporte, checklists
-- de onboarding y cierre, y revisión semanal
-- Correr completo en Supabase → SQL Editor → Run, ANTES de mergear el PR.
-- Requiere haber corrido 0005. Se puede correr varias veces sin problema.
--
-- Qué hace:
--  1. ticket_events: historial de cada ticket (respuestas al cliente,
--     mensajes del cliente, notas internas y cambios de estado).
--  2. checklist_items: pasos de onboarding (SOP 4) y cierre (SOP 9)
--     por cliente o proyecto.
--  3. weekly_reviews: la revisión semanal (una por semana).
--  4. Mismas reglas que el resto: auditoría, updated_at, "creado por"
--     fijado por la base, RLS para miembros, sin DELETE ni acceso anon.
-- =====================================================================

-- ---------- 1. Historial de tickets ----------
create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id),
  kind text not null default 'respuesta' check (kind in ('respuesta','cliente','nota','estado')),
  body text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- 2. Checklists de onboarding y cierre ----------
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  project_id uuid references public.projects(id),
  list text not null check (list in ('onboarding','cierre')),
  sort integer not null default 0,
  phase text,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);

-- ---------- 3. Revisión semanal ----------
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  wins text,
  blockers text,
  priorities text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), deleted_at timestamptz
);
create unique index if not exists weekly_reviews_week_uidx on public.weekly_reviews (week_start) where deleted_at is null;

-- ---------- 4. Triggers, permisos y RLS ----------
do $$
declare t text;
begin
  foreach t in array array['ticket_events','checklist_items','weekly_reviews'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('drop trigger if exists stamp_created_by on public.%I', t);
    execute format('create trigger stamp_created_by before insert or update on public.%I for each row execute function public.stamp_created_by()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_read" on public.%1$I', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('drop policy if exists "%1$s_member_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_member_update" on public.%1$I', t);
    execute format('create policy "%1$s_member_insert" on public.%1$I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy "%1$s_member_update" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create index if not exists ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);
create index if not exists checklist_items_client_idx on public.checklist_items (client_id, list, sort);

notify pgrst, 'reload schema';

-- ---------- Verificación: mándame una captura de este resultado ----------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('ticket_events','checklist_items','weekly_reviews') and c.relrowsecurity) as tablas_nuevas_con_rls,
  has_table_privilege('anon', 'public.ticket_events', 'select') as anon_puede_leer,
  has_table_privilege('authenticated', 'public.checklist_items', 'delete') as usuarios_pueden_borrar;
-- Resultado esperado: tablas_nuevas_con_rls = 3 y las dos últimas en false.
