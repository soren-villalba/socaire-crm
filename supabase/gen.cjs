const fs=require('fs');const [,,seedP,colsP,schemaP,outP]=process.argv
const d=JSON.parse(fs.readFileSync(seedP,'utf8'))
const types={};for(const l of fs.readFileSync(colsP,'utf8').trim().split('\n')){const [tc,ty]=l.split(':');const [t,c]=tc.split('.');(types[t]??={})[c]=ty}
const prof=d.profiles.map(p=>p.id)
const q=s=>"'"+String(s).replace(/'/g,"''")+"'"
const lit=(t,c,v)=>{const ty=types[t][c];if(ty===undefined)return undefined
 if(v===null||v===undefined)return 'null'
 if(typeof v==='string'&&prof.includes(v)&&/uuid/.test(ty))return `(select real_id from _socaire_map where n=${prof.indexOf(v)+1})`
 if(ty==='jsonb')return q(JSON.stringify(v))+'::jsonb'
 if(ty==='_text')return 'array['+v.map(q).join(',')+']::text[]'
 if(typeof v==='boolean'||typeof v==='number')return String(v)
 return q(v)+'::'+ty}
const SELF={clients:'referred_by_client_id',leads:'converted_opportunity_id',quotes:'previous_version_id'}
const out=[];const later=[]
const ins=(t,rows)=>{for(const r of rows){const cols=[],vals=[]
 for(const [c,v] of Object.entries(r)){if(c.startsWith('__'))continue;let L=lit(t,c,v);if(L===undefined)continue
  if(SELF[t]===c&&v){later.push(`update public.${t} set ${c} = ${L} where id = ${q(r.id)}::uuid;`);L='null'}
  cols.push(c);vals.push(L)}
 out.push(`insert into public.${t} (${cols.join(', ')}) values (${vals.join(', ')});`)}}
const order=['products','clients','contacts','opportunities','leads','quotes','quote_items','subscriptions','branches','referrals','projects','project_phases','change_requests','time_entries','invoices','payments','tasks','interactions','tickets','documents']
for(const t of order){if(d[t].length){out.push(`\n-- ${t} (${d[t].length})`);ins(t,t==='quotes'?[...d[t]].sort((a,b)=>a.version-b.version):d[t])}}
const app=d.settings.find(s=>s.key==='app')
const schema=fs.readFileSync(schemaP,'utf8')
const sql=`-- =====================================================================
-- socaire · CRM interno — instalación completa en Supabase (un solo script)
-- Antes de correrlo: crea en Authentication → Users a los 2 usuarios
-- (primero tú, después tu papá). Córrelo UNA sola vez en un proyecto nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1 · Esquema, permisos (RLS) y auditoría
-- ---------------------------------------------------------------------
${schema}

-- ---------------------------------------------------------------------
-- PARTE 2 · Perfiles de los usuarios que ya existen en Auth
-- (el primero creado queda como administrador)
-- ---------------------------------------------------------------------
insert into public.profiles (id, full_name, email, roles, hourly_cost)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email,
       case when u.rn = 1 then array['admin','direccion','comercial','desarrollo','soporte'] else array[${d.profiles[1].roles.map(q).join(',')}] end,
       case when u.rn = 1 then ${d.profiles[0].hourly_cost} else ${d.profiles[1].hourly_cost} end
from (select id, email, raw_user_meta_data, row_number() over (order by created_at) rn from auth.users) u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- PARTE 3 · Datos iniciales de socaire (Brenda, Nelly, Vidriera, Baken…)
-- Responsable 1 = primer usuario (tú); 2 = segundo usuario (tu papá).
-- ---------------------------------------------------------------------
create temp table _socaire_map as
select row_number() over (order by u.created_at) as n, p.id as real_id from public.profiles p join auth.users u on u.id = p.id;
insert into _socaire_map select 2, real_id from _socaire_map where n = 1 and not exists (select 1 from _socaire_map where n = 2);
${out.join('\n')}

-- referencias entre registros
${later.join('\n')||'-- (ninguna)'}

-- parámetros del negocio
update public.settings set value = ${q(JSON.stringify(app.value))}::jsonb where key = 'app';

drop table _socaire_map;

select 'socaire CRM instalado: ' || (select count(*) from public.clients) || ' clientes, ' || (select count(*) from public.profiles) || ' usuarios' as resultado;
`
fs.writeFileSync(outP,sql)
