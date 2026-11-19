-- socaire CRM · reparación de acceso (se puede correr varias veces sin problema)

-- 1) Permisos de la API para usuarios con sesión (las reglas RLS siguen aplicando)
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.has_role(text) to authenticated;
alter default privileges in schema public grant select, insert, update on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- 2) Crear el perfil de cualquier usuario de Auth que no lo tenga.
--    El primero = administrador activo; los demás quedan INACTIVOS hasta que el admin los apruebe
--    en Configuración → Usuarios y roles.
insert into public.profiles (id, full_name, email, roles, hourly_cost, active)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email,
       case when u.rn = 1 and not exists (select 1 from public.profiles where 'admin' = any(roles))
            then array['admin','direccion','comercial','desarrollo','soporte']
            else array[]::text[] end,
       case when u.rn = 1 then 400 else 250 end,
       (u.rn = 1 and not exists (select 1 from public.profiles where 'admin' = any(roles)))
from (select id, email, raw_user_meta_data, row_number() over (order by created_at) rn from auth.users) u
on conflict (id) do nothing;

-- 3) Diagnóstico: mándame una captura de este resultado
select u.email,
       p.id is not null as tiene_perfil,
       p.roles,
       p.active as activo,
       (select count(*) from public.clients) as clientes_en_base
from auth.users u left join public.profiles p on p.id = u.id
order by u.created_at;
