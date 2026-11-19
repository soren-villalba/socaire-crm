// Revisión semanal: lo que pasó, lo que viene y las prioridades. 15 minutos cada viernes.
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { missingTables } from '../lib/backend'
import { PageHeader, Card, Stat, Badge } from '../components/ui'
import { ClientLink, DueDate } from '../components/links'
import { useToast } from '../components/Toast'
import { addDays, fdate, fdatetime, money, todayISO } from '../lib/format'
import { buildAlerts, expectedCharges, paymentNet, weekStart } from '../lib/metrics'
import { ticketSla } from '../lib/sla'

export default function WeeklyReview() {
  const { db, settings, insert, update } = useData()
  const toast = useToast()
  const reviews = useTable('weekly_reviews')
  const [params, setParams] = useSearchParams()
  const ws = weekStart(params.get('w') ?? todayISO())
  const we = addDays(ws, 6)
  const setWeek = (w: string) => setParams(w === weekStart(todayISO()) ? {} : { w }, { replace: true })
  const existing = reviews.find((r) => r.week_start === ws)
  const [form, setForm] = useState({ wins: '', blockers: '', priorities: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setForm({ wins: existing?.wins ?? '', blockers: existing?.blockers ?? '', priorities: existing?.priorities ?? '' })
  }, [existing?.id, existing?.updated_at, ws]) // eslint-disable-line react-hooks/exhaustive-deps

  const inWeek = (d?: string | null) => !!d && d.slice(0, 10) >= ws && d.slice(0, 10) <= we
  const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at)

  const s = useMemo(() => {
    const pays = live(db.payments).filter((p) => inWeek(p.payment_date))
    const exps = live(db.expenses ?? []).filter((e) => e.status === 'pagado' && inWeek(e.expense_date))
    const tks = live(db.tickets)
    const won = live(db.opportunities).filter((o) => o.stage === 'ganada' && inWeek(o.closed_at))
    const lost = live(db.opportunities).filter((o) => o.stage === 'perdida' && inWeek(o.closed_at))
    return {
      leads: live(db.leads).filter((l) => inWeek(l.created_at)).length,
      quotes: live(db.quotes).filter((q) => q.status !== 'borrador' && inWeek(q.issue_date)).length,
      won, lost,
      collected: pays.reduce((t, p) => t + paymentNet(db, p, settings), 0),
      expenses: exps.reduce((t, e) => t + e.subtotal, 0),
      ticketsOpened: tks.filter((t) => inWeek(t.created_at)).length,
      ticketsResolved: tks.filter((t) => inWeek(t.resolved_at)).length,
      slaMissed: tks.filter((t) => inWeek(t.created_at)).map((t) => ticketSla(t, settings)).filter((x) => x.state === 'incumplido' || x.state === 'vencido').length,
      tasksDone: live(db.tasks).filter((t) => t.status === 'hecha' && inWeek(t.completed_at ?? t.updated_at)).length,
      hours: live(db.time_entries).filter((t) => inWeek(t.date)).reduce((a, t) => a + t.hours, 0),
      milestones: live(db.project_phases).filter((p) => p.status === 'hecho' && inWeek(p.done_date)),
      // Lo que viene la semana siguiente
      nextMilestones: live(db.project_phases).filter((p) => p.status !== 'hecho' && p.due_date && p.due_date <= addDays(we, 7)),
      nextCharges: expectedCharges(db, settings, addDays(we, 1), addDays(we, 7)).filter((c) => !c.invoice),
      nextTasks: live(db.tasks).filter((t) => t.status !== 'hecha' && t.due_date && t.due_date <= addDays(we, 7)).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    }
  }, [db, settings, ws, we]) // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => buildAlerts(db, settings).filter((a) => a.level === 'alta'), [db, settings])

  const save = async () => {
    setBusy(true)
    const snapshot = { leads: s.leads, quotes: s.quotes, won: s.won.length, lost: s.lost.length, collected: Math.round(s.collected), expenses: Math.round(s.expenses), tickets_opened: s.ticketsOpened, tickets_resolved: s.ticketsResolved, sla_missed: s.slaMissed, tasks_done: s.tasksDone, hours: s.hours, milestones: s.milestones.length }
    try {
      if (existing) await update('weekly_reviews', existing.id, { ...form, snapshot }, { silent: true })
      else await insert('weekly_reviews', { week_start: ws, ...form, snapshot }, { silent: true })
      toast.success('Revisión guardada')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const cname = (id?: string | null) => db.clients.find((c) => c.id === id)?.company_name ?? ''
  const isCurrent = ws === weekStart(todayISO())

  return (
    <>
      <PageHeader
        title="Revisión semanal"
        subtitle="15 minutos cada viernes: qué salió, qué se atoró y las 3 prioridades de la semana que viene."
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-1.5" onClick={() => setWeek(addDays(ws, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
            <span className="min-w-[170px] text-center text-sm font-medium text-stone-700">{fdate(ws)} – {fdate(we)}{isCurrent && ' · esta semana'}</span>
            <button className="btn-ghost px-1.5" onClick={() => setWeek(addDays(ws, 7))} disabled={isCurrent} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
          </div>
        }
      />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Prospectos nuevos" value={s.leads} sub={`${s.quotes} cotizaciones enviadas`} />
          <Stat label="Ventas" value={`${s.won.length} ganadas`} sub={`${s.lost.length} perdidas`} tone={s.won.length ? 'green' : undefined} />
          <Stat label="Cobrado" value={money(s.collected)} sub={`Gastos ${money(s.expenses)} (sin IVA)`} tone="green" />
          <Stat label="Hitos cumplidos" value={s.milestones.length} sub={`${s.hours} h registradas`} />
          <Stat label="Soporte" value={`${s.ticketsOpened} nuevos`} sub={`${s.ticketsResolved} resueltos · ${s.slaMissed} fuera de SLA`} tone={s.slaMissed ? 'red' : undefined} />
          <Stat label="Tareas hechas" value={s.tasksDone} />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Card title={existing ? `Notas de la semana · guardadas ${fdatetime(existing.updated_at)}` : 'Notas de la semana'}>
              {missingTables.has('weekly_reviews') ? (
                <p className="text-sm text-stone-500">Para guardar revisiones, corre el script 0006 en Supabase. Mientras, el resumen de arriba ya funciona.</p>
              ) : (
                <div className="space-y-3">
                  {([
                    ['wins', 'Qué salió bien', 'Ventas, entregas, clientes contentos…'],
                    ['blockers', 'Qué se atoró y por qué', 'Lo que no avanzó y qué se necesita para destrabarlo'],
                    ['priorities', 'Las 3 prioridades de la próxima semana', '1. …\n2. …\n3. …'],
                  ] as const).map(([k, label, ph]) => (
                    <div key={k}>
                      <label className="label">{label}</label>
                      <textarea className="input h-24" value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                  <button className="btn-primary" disabled={busy} onClick={save}>{existing ? 'Actualizar revisión' : 'Guardar revisión'}</button>
                </div>
              )}
            </Card>
            {(s.won.length > 0 || s.milestones.length > 0) && (
              <Card title="Logros registrados en el CRM">
                <ul className="space-y-1 text-sm">
                  {s.won.map((o) => <li key={o.id}><Badge tone="green">Ganada</Badge> {o.title} · <ClientLink id={o.client_id} /></li>)}
                  {s.milestones.map((p) => <li key={p.id}><Badge tone="brand">{p.milestone}</Badge> {p.milestone_name} · <Link className="link" to={`/proyectos/${p.project_id}`}>{db.projects.find((x) => x.id === p.project_id)?.name}</Link></li>)}
                </ul>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card title="Urgente ahora" bodyClass="">
              {alerts.length === 0 ? <p className="px-4 py-3 text-sm text-stone-500">Nada urgente.</p> : (
                <ul className="divide-y divide-stone-100">
                  {alerts.slice(0, 8).map((a) => <li key={a.id} className="px-4 py-2 text-sm"><Link className="link" to={a.to}>{a.title}</Link><div className="text-xs text-stone-500">{a.detail}</div></li>)}
                </ul>
              )}
            </Card>
            <Card title="La semana que viene" bodyClass="">
              <ul className="divide-y divide-stone-100 text-sm">
                {s.nextMilestones.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2"><span className="min-w-0 truncate"><Badge tone="brand">{p.milestone}</Badge> {p.milestone_name}</span><DueDate date={p.due_date} /></li>
                ))}
                {s.nextCharges.map((c) => (
                  <li key={c.sub.id + c.period} className="flex items-center justify-between gap-2 px-4 py-2"><span>Facturar {cname(c.sub.client_id)} · {money(c.amount)}</span><span className="text-xs text-stone-500">{fdate(c.date)}</span></li>
                ))}
                {s.nextTasks.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2"><span className="min-w-0 truncate">{t.title}</span><DueDate date={t.due_date} /></li>
                ))}
                {!s.nextMilestones.length && !s.nextCharges.length && !s.nextTasks.length && <li className="px-4 py-3 text-stone-500">Sin hitos, cobros ni tareas programadas.</li>}
              </ul>
            </Card>
            {reviews.length > 0 && (
              <Card title="Revisiones anteriores" bodyClass="">
                <ul className="divide-y divide-stone-100 text-sm">
                  {[...reviews].sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 12).map((r) => (
                    <li key={r.id}><button className={`w-full px-4 py-2 text-left hover:bg-stone-50 ${r.week_start === ws ? 'font-semibold text-brand-800' : 'text-stone-700'}`} onClick={() => setWeek(r.week_start)}>Semana del {fdate(r.week_start)} <span className="text-xs font-normal text-stone-500">· {money(r.snapshot?.collected ?? 0)} cobrado</span></button></li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
