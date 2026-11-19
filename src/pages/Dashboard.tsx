import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CircleAlert, Info, CheckCircle2, Circle } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { Card, PageHeader, Stat, Segmented, Badge, Empty, Progress } from '../components/ui'
import { ClientLink, DueDate } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { buildAlerts, distribution, expectedCharges, mrr, pipelineSummary, projectProgress, receivables, collectedInMonth, taskOverdue, oppValue, isOpen } from '../lib/metrics'
import { addDays, fdate, fdatetime, money, todayISO, parseISO, toISO } from '../lib/format'
import { STAGES, OPEN_STAGES } from '../lib/constants'
import { usePersist } from '../lib/usePersist'

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function Dashboard() {
  const { db, settings, me, update } = useData()
  const quick = useQuick()
  const navigate = useNavigate()
  const tasks = useTable('tasks')
  const projects = useTable('projects')
  const opps = useTable('opportunities')
  const [area, setArea] = usePersist<string>('dashboard.area', 'todas')
  const today = todayISO()
  const d = new Date()

  const alerts = useMemo(() => buildAlerts(db, settings), [db, settings])
  const m = mrr(db, settings)
  const pipe = pipelineSummary(db)
  const rec = receivables(db)
  const dist = distribution(db)
  const collected = collectedInMonth(db.payments, today.slice(0, 7))
  const activeProjects = projects.filter((p) => p.status === 'en_curso' || p.status === 'planeacion')
  const lateProjects = activeProjects.filter((p) => projectProgress(db, p).late.length > 0)

  const myTasks = tasks
    .filter((t) => t.status !== 'hecha' && t.assigned_to === me?.id && t.due_date && t.due_date <= addDays(today, 2))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const charges = expectedCharges(db, settings, today, addDays(today, 31))
  const milestones = activeProjects
    .flatMap((p) => db.project_phases.filter((x) => x.project_id === p.id && !x.deleted_at && x.status !== 'hecho').map((x) => ({ ...x, client_id: p.client_id, pid: p.id })))
    .filter((x) => x.due_date && x.due_date <= addDays(today, 21))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 6)

  // Semana actual (lunes a domingo)
  const monday = (() => {
    const x = parseISO(today)
    const wd = (x.getDay() + 6) % 7
    x.setDate(x.getDate() - wd)
    return toISO(x)
  })()
  const weekHours = db.time_entries.filter((t) => !t.deleted_at && t.date >= monday && t.date <= addDays(monday, 6))
  const myWeek = weekHours.filter((t) => t.user_id === me?.id).reduce((a, t) => a + t.hours, 0)
  const teamWeek = weekHours.reduce((a, t) => a + t.hours, 0)

  const areas = ['todas', ...Array.from(new Set(alerts.map((a) => a.area)))]
  const shown = area === 'todas' ? alerts : alerts.filter((a) => a.area === area)
  const recent = db.audit_logs.slice(0, 8)

  // Clientes y prospectos
  const clients = db.clients.filter((c) => !c.deleted_at)
  const activeClients = clients.filter((c) => c.status === 'activo')
  const since30 = addDays(today, -30)
  const newClients = activeClients.filter((c) => (c.relationship_start ?? c.created_at.slice(0, 10)) >= since30)
  const atRisk = clients.filter((c) => c.status === 'en_riesgo')
  const leads = db.leads.filter((l) => !l.deleted_at)
  const newLeads = leads.filter((l) => l.created_at.slice(0, 10) >= addDays(today, -7))
  const uncontacted = leads.filter((l) => l.status === 'nuevo' && l.created_at.slice(0, 10) <= addDays(today, -2))
  const qualified = leads.filter((l) => l.status === 'calificado')

  const byStage = OPEN_STAGES.map((s) => {
    const list = opps.filter((o) => o.stage === s)
    return { s, n: list.length, v: list.reduce((a, o) => a + oppValue(o), 0) }
  })
  const maxStage = Math.max(1, ...byStage.map((x) => x.v))

  return (
    <>
      <PageHeader
        title={`Hola, ${me?.full_name.split(' (')[0] ?? ''}`}
        subtitle={`${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} · ${alerts.length ? `${alerts.length} cosas requieren atención` : 'Todo en orden'}`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => quick.open('interaction')}>Registrar interacción</button>
            <button className="btn-secondary" onClick={() => quick.open('task')}>Nueva tarea</button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="MRR activo" value={money(m.active)} sub={m.committed ? `+ ${money(m.committed)} por arrancar` : `ARR ${money(m.arr)}`} onClick={() => navigate('/finanzas')} />
        <Stat label="Pipeline abierto" value={money(pipe.weighted)} sub={`${pipe.open} oportunidades · ${money(pipe.mrrOpen)}/mes posibles`} onClick={() => navigate('/oportunidades')} />
        <Stat label="Por cobrar" value={money(rec.total)} tone={rec.overdue > 0 ? 'red' : undefined} sub={rec.overdue > 0 ? `${money(rec.overdue)} vencido` : 'Nada vencido'} onClick={() => navigate('/finanzas?tab=facturas')} />
        <Stat label="Cobrado este mes" value={money(collected)} tone={collected > 0 ? 'green' : undefined} sub={MONTHS[d.getMonth()]} onClick={() => navigate('/finanzas?tab=pagos')} />
        <Stat label="Sucursales con Socaire" value={`${dist.activeBranches} activas`} sub={`${dist.pendingBranches} por arrancar · ${dist.potential} posibles en ${dist.clientsWithService} cliente(s)`} onClick={() => navigate('/finanzas?tab=distribucion')} />
        <Stat label="Proyectos en curso" value={activeProjects.length} tone={lateProjects.length ? 'amber' : undefined} sub={lateProjects.length ? `${lateProjects.length} con hitos retrasados` : 'Sin retrasos'} onClick={() => navigate('/proyectos')} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-brand-400" /> Atención requerida</span>}
          actions={<Segmented options={areas.map((a) => ({ value: a, label: a === 'todas' ? `Todas (${alerts.length})` : a }))} value={area} onChange={setArea} />}
          bodyClass=""
        >
          {shown.length === 0 ? (
            <Empty title="Nada pendiente aquí">Cuando algo se atrase, venza o se quede sin seguimiento, aparecerá en esta lista.</Empty>
          ) : (
            <ul className="max-h-[460px] divide-y divide-stone-100 overflow-y-auto">
              {shown.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} className="flex items-start gap-3 px-4 py-2.5 hover:bg-stone-50">
                    {a.level === 'alta' ? <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-500" /> : a.level === 'media' ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" /> : <Info size={16} className="mt-0.5 shrink-0 text-sky-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-stone-800">{a.title}</div>
                      <div className="truncate text-xs text-stone-500">{a.detail}</div>
                    </div>
                    <Badge>{a.area}</Badge>
                    {a.date && <span className="tnum w-16 shrink-0 text-right text-xs text-stone-500">{fdate(a.date)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Mis tareas (vencidas y próximas)" actions={<Link to="/tareas" className="text-xs link">Ver todas</Link>} bodyClass="">
          {myTasks.length === 0 ? (
            <Empty title="Sin tareas urgentes" action={<button className="btn-secondary btn-sm" onClick={() => quick.open('task')}>Nueva tarea</button>} />
          ) : (
            <ul className="divide-y divide-stone-100">
              {myTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 px-4 py-2">
                  <button aria-label="Marcar como hecha" onClick={() => update('tasks', t.id, { status: 'hecha', completed_at: new Date().toISOString() })} className="mt-0.5 text-stone-300 hover:text-emerald-600">
                    <Circle size={17} />
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => quick.edit('task', t)}>
                    <div className="text-sm text-stone-800">{t.title}</div>
                    <div className="flex gap-2 text-xs text-stone-500">
                      <DueDate date={t.due_date} />
                      {t.client_id && <span className="truncate">· {db.clients.find((c) => c.id === t.client_id)?.company_name}</span>}
                    </div>
                  </button>
                  {taskOverdue(t) && t.priority === 'alta' && <Badge tone="red">Alta</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Próximos cobros (31 días)" actions={<Link to="/finanzas?tab=cobros" className="text-xs link">Cobranza</Link>} bodyClass="">
          {charges.length === 0 ? (
            <Empty title="Sin mensualidades en los próximos 31 días" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {charges.map((c) => (
                  <tr key={c.sub.id + c.period}>
                    <td className="td"><ClientLink id={c.sub.client_id} /></td>
                    <td className="td tnum whitespace-nowrap text-stone-600">{fdate(c.date)}</td>
                    <td className="td tnum text-right font-medium">{money(c.amount)}</td>
                    <td className="td text-right">{c.invoice ? <Badge tone="green">Facturada</Badge> : <Badge tone="amber">Por facturar</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Hitos próximos (VELERO)" actions={<Link to="/proyectos" className="text-xs link">Proyectos</Link>} bodyClass="">
          {milestones.length === 0 ? (
            <Empty title="Sin hitos en las próximas 3 semanas" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {milestones.map((x) => (
                <li key={x.id}>
                  <Link to={`/proyectos/${x.pid}`} className="flex items-center gap-3 px-4 py-2 hover:bg-stone-50">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-semibold text-brand-700">{x.milestone}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-stone-800">{x.milestone_name}</div>
                      <div className="truncate text-xs text-stone-500">{db.clients.find((c) => c.id === x.client_id)?.company_name} · {x.name}</div>
                    </div>
                    <DueDate date={x.due_date} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pipeline por etapa" actions={<Link to="/oportunidades" className="text-xs link">Ver pipeline</Link>}>
          <ul className="space-y-2.5">
            {byStage.map((x) => (
              <li key={x.s}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-stone-600">{STAGES.find((s) => s.key === x.s)?.label} <span className="text-stone-500">({x.n})</span></span>
                  <span className="tnum text-stone-700">{money(x.v)}</span>
                </div>
                <Progress pct={(x.v / maxStage) * 100} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500">Valor anual: pago único + 12 meses de recurrente. Cierre: {pipe.closed === 0 ? 'aún sin oportunidades cerradas' : pipe.closed < 5 ? `${pipe.won} ganada(s) de ${pipe.closed} cerrada(s)` : `${Math.round((pipe.winRate ?? 0) * 100)}% (${pipe.won} de ${pipe.closed})`}.</p>
        </Card>

        <Card title="Clientes y prospectos" className="xl:col-span-2" actions={<Link to="/clientes" className="text-xs link">Clientes</Link>}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline gap-4">
                <Link to="/clientes" className="group"><div className="tnum text-2xl font-semibold text-brand-800 group-hover:underline">{activeClients.length}</div><div className="text-xs text-stone-500">activos</div></Link>
                <div><div className="tnum text-2xl font-semibold text-stone-800">{newClients.length}</div><div className="text-xs text-stone-500">nuevos (30 días)</div></div>
                <div><div className={`tnum text-2xl font-semibold ${atRisk.length ? 'text-amber-600' : 'text-stone-800'}`}>{atRisk.length}</div><div className="text-xs text-stone-500">en riesgo</div></div>
              </div>
              {atRisk.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {atRisk.slice(0, 4).map((c) => <li key={c.id} className="flex items-center gap-2"><AlertTriangle size={13} className="shrink-0 text-amber-500" /><ClientLink id={c.id} /></li>)}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-stone-500">Ningún cliente marcado en riesgo.</p>
              )}
            </div>
            <div className="sm:border-l sm:border-stone-100 sm:pl-5">
              <div className="flex items-baseline gap-4">
                <Link to="/prospectos" className="group"><div className="tnum text-2xl font-semibold text-brand-800 group-hover:underline">{newLeads.length}</div><div className="text-xs text-stone-500">prospectos nuevos (7 días)</div></Link>
                <div><div className="tnum text-2xl font-semibold text-stone-800">{qualified.length}</div><div className="text-xs text-stone-500">calificados</div></div>
              </div>
              {uncontacted.length > 0 ? (
                <Link to="/prospectos" className="mt-3 flex items-center gap-2 text-sm text-red-700 hover:underline"><CircleAlert size={13} /> {uncontacted.length} sin contactar desde hace 2 días o más</Link>
              ) : (
                <p className="mt-3 text-xs text-stone-500">Todos los prospectos nuevos ya tienen primer contacto.</p>
              )}
              <button className="btn-secondary btn-sm mt-3" onClick={() => quick.open('lead')}>Nuevo prospecto</button>
            </div>
          </div>
        </Card>

        <Card title="Capacidad de esta semana">
          <div className="flex items-end justify-between">
            <div>
              <div className="tnum text-2xl font-semibold text-brand-800">{myWeek} h <span className="text-sm font-normal text-stone-500">/ {settings.weekly_capacity_hours} h</span></div>
              <div className="text-xs text-stone-500">Tus horas registradas · equipo: {teamWeek} h</div>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => quick.open('time')}>Registrar horas</button>
          </div>
          <div className="mt-3"><Progress pct={(myWeek / settings.weekly_capacity_hours) * 100} tone={myWeek > settings.weekly_capacity_hours ? 'red' : 'brand'} /></div>
        </Card>

        <Card title="Actividad reciente" className="lg:col-span-2 xl:col-span-3" bodyClass="">
          {recent.length === 0 ? (
            <Empty title="Aún no hay cambios registrados" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  {l.action === 'insert' ? <CheckCircle2 size={14} className="text-emerald-500" /> : l.action === 'delete' ? <CircleAlert size={14} className="text-red-400" /> : <Circle size={14} className="text-stone-300" />}
                  <span className="text-stone-500">{db.profiles.find((p) => p.id === l.changed_by)?.full_name.split(' (')[0] ?? 'Sistema'}</span>
                  <span className="text-stone-700">{l.action === 'insert' ? 'creó' : l.action === 'delete' ? 'eliminó' : 'actualizó'}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-800">{l.summary}</span>
                  <span className="tnum text-xs text-stone-500">{fdatetime(l.changed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {opps.filter(isOpen).length === 0 && null}
    </>
  )
}
