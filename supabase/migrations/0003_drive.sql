-- =====================================================================
-- socaire · CRM interno — ligas de Google Drive
-- Correr completo en Supabase → SQL Editor → Run.
-- Se puede correr varias veces sin problema (no borra ni modifica datos).
--
-- Qué hace:
--  1. Agrega a clientes y proyectos la liga a su carpeta en Google Drive.
--  2. La base solo acepta ligas https de Google Drive / Docs en esos campos.
--  3. La ubicación de un documento nunca puede ser una liga peligrosa
--     (javascript:, data:, vbscript:).
-- Los archivos NO se suben a Supabase: siguen en Drive y el CRM solo guarda la liga.
-- =====================================================================

-- ---------- 1. Columnas nuevas ----------
alter table public.clients  add column if not exists drive_url text;
alter table public.projects add column if not exists drive_url text;

-- ---------- 2 y 3. Reglas de validación ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_drive_url_check') then
    alter table public.clients add constraint clients_drive_url_check
      check (drive_url is null or drive_url ~* '^https://(drive|docs)\.google\.com/');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_drive_url_check') then
    alter table public.projects add constraint projects_drive_url_check
      check (drive_url is null or drive_url ~* '^https://(drive|docs)\.google\.com/');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_location_safe_check') then
    -- "not valid": revisa los registros nuevos y editados sin bloquear por datos viejos.
    alter table public.documents add constraint documents_location_safe_check
      check (location !~* '^\s*(javascript|data|vbscript|file):') not valid;
  end if;
end $$;

-- Que la API de Supabase vea las columnas nuevas de inmediato.
notify pgrst, 'reload schema';
