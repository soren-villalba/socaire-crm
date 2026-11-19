// Reportes: la foto del negocio en una sola página (dirección, comercial, operación y soporte).
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData, useTable } from '../lib/store'
import { PageHeader, Card, Stat, Segmented, Progress, Empty } from '../components/ui'
import { ClientLink } from '../components/links'
import { usePersist } from '../lib/usePersist'
import { SOURCES, expenseCategoryLabel } from '../lib/constants'
import { addMonths, diffDays, money, monthLabel, todayISO } from '../lib/format'
import { monthResult, mrr, paymentNet, projectCost, projectProgress, subMonthly } from '../lib/metrics'
import { ticketSla } from '../lib/sla'

type Range = '6' | '12'

function Bars({ rows, series, height = 160 }: { rows: { label: string; current?: boolean; values: number[] }[]; series: { label: string; color: string }[]; height?: number }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values.map(Math.abs)))
  if (rows.every((r) => r.values.every((v) => !v))) return <Empty title="Sin movimientos en el periodo">Aparecen al registrar pagos, gastos o suscripciones activas.</Empty>
  return (
    <div>
      <div className="relative flex items-end gap-2 pl-14" style={{ height: height + 28 }}>
        {[1, 0.5, 0].map((t) => (
          <div key={t} className="pointer-events-none absolute left-0 right-0 flex items-center gap-2" style={{ bottom: `calc(${t * height}px + 1.75rem)` }}>
            <span className="tnum w-12 text-right text-[10px] text-stone-500">{money(max * t)}</span>
            <span className="h-px flex-1 bg-stone-100" />
          </div>
        ))}
        {rows.map((r) => (
          <div key={r.label} className="relative flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height }}>
              {r.values.map((v, i) => (
                <div key={i} title={`${series[i].label}: ${money(v)}`} className={`w-1/3 max-w-[18px] rounded-t ${series[i].color} ${v < 0 ? 'opacity-50' : ''}`} style={{ height: `${(Math.abs(v) / max) * 100}%` }} />
              ))}
            </div>
            <span className={`text-[11px] ${r.current ? 'font-semibold text-brand-800' : 'text-stone-500'}`}>{r.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-500">
        {series.map((s) => <span key={s.label} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} /> {s.label}</span>)}
      </div>
    </div>
  )
}

export default function Reports() {
  const { db, settings } = useData()
  const [range, setRange] = usePersist<Range>('reportes.rango', '12')
  const clients = useTable('clients')
  const leads = useTable('leads')
  const opps = useTable('opportunities')
  const subs = useTable('subscriptions')
  const projects = useTable('projects')
  const tickets = useTable('tickets')
  const payments = useTable('payments')
  const today = todayISO()
  const n = Number(range)
  const from = addMonths(`${today.slice(0, 7)}-01`, -(n - 1))

  const months = useMemo(() => Array.from({ length: n }, (_, i) => addMonths(from, i).slice(0, 7)), [from, n])
  const results = useMemo(() => months.map((ym) => monthResult(db, settings, ym)), [months, db, settings])
  const totals = results.reduce((t, r) => ({ collected: t.collected + r.collectedNet, expenses: t.expenses + r.expenses, profit: t.profit + r.profit }), { collected: 0, expenses: 0, profit: 0 })

  // MRR al cierre de cada mes (con los precios actuales de cada suscripción).
  const mrrSeries = useMemo(
    () =>
      months.map((ym) => {
        const end = `${ym}-31`
        return subs
          .filter((s) => s.start_date && s.start_date <= end && (!s.cancellation_date || s.cancellation_date > end) && s.status !== 'pendiente')
          .reduce((t, s) => t + subMonthly(db, s, settings), 0)
      }),
    [months, subs, db, settings],
  )
  const m = mrr(db, settings)
  const mrrStart = mrrSeries[0] ?? 0

  // Comercial
  const sales = useMemo(() => {
    const inRange = (d?: string | null) => !!d && d.slice(0, 10) >= from
    const newLeads = leads.filter((l) => inRange(l.created_at))
    const bySource = SOURCES.map((s) => {
      const ls = newLeads.filter((l) => (l.source ?? 'otro') === s.value)
      return { ...s, leads: ls.length, converted: ls.filter((l) => l.status === 'convertido').length }
    }).filter((x) => x.leads > 0)
    const closed = opps.filter((o) => (o.stage === 'ganada' || o.stage === 'perdida') && inRange(o.closed_at ?? o.updated_at))
    const won = closed.filter((o) => o.stage === 'ganada')
    const cycle = won.filter((o) => o.closed_at).map((o) => Math.max(0, diffDays(o.closed_at!, o.created_at.slice(0, 10))))
    const reasons = new Map<string, number>()
    for (const o of closed.filter((o) => o.stage === 'perdida')) reasons.set(o.lost_reason || 'Sin razón registrada', (reasons.get(o.lost_reason || 'Sin razón registrada') ?? 0) + 1)
    return {
      newLeads: newLeads.length,
      converted: newLeads.filter((l) => l.status === 'convertido').length,
      bySource,
      closed: closed.length,
      won: won.length,
      wonValue: won.reduce((t, o) => t + o.estimated_value + o.estimated_mrr * 12, 0),
      cycle: cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null,
      reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [leads, opps, from])

  // Clientes: cobrado por cliente y concentración
  const byClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) if (p.payment_date >= from) map.set(p.client_id, (map.get(p.client_id) ?? 0) + paymentNet(db, p, settings))
    const rows = [...map.entries()].map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v)
    const total = rows.reduce((t, r) => t + r.v, 0)
    return { rows, total, top: rows[0] && total ? Math.round((rows[0].v / total) * 100) : 0 }
  }, [payments, from, db, settings])
  const churned = subs.filter((s) => s.cancellation_date && s.cancellation_date >= from).length

  // Proyectos
  const projRows = useMemo(
    () =>
      projects
        .filter((p) => p.status !== 'cancelado')
        .map((p) => {
          const prog = projectProgress(db, p)
          const cost = projectCost(db, p, settings)
          return { p, prog, cost, margin: p.budget ? p.budget - cost : null }
        }),
    [projects, db, settings],
  )

  // Soporte por mes
  const support = useMemo(
    () =>
      months.map((ym) => {
        const ts = tickets.filter((t) => t.created_at.startsWith(ym))
        const measured = ts.map((t) => ticketSla(t, settings)).filter((x) => x.state === 'cumplido' || x.state === 'incumplido' || x.state === 'vencido')
        return { ym, count: ts.length, sla: measured.length ? Math.round((measured.filter((x) => x.state === 'cumplido').length / measured.length) * 100) : null }
      }),
    [months, tickets, settings],
  )
  const slaAll = (() => {
    const ms = tickets.filter((t) => t.created_at.slice(0, 10) >= from).map((t) => ticketSla(t, settings)).filter((x) => x.state === 'cumplido' || x.state === 'incumplido' || x.state === 'vencido')
    return ms.length ? Math.round((ms.filter((x) => x.state === 'cumplido').length / ms.length) * 100) : null
  })()
  const expCats = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of db.expenses ?? []) if (!e.deleted_at && e.status === 'pagado' && e.expense_date >= from) map.set(e.category, (map.get(e.category) ?? 0) + e.subtotal)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [db.expenses, from])

  const activeClients = clients.filter((c) => c.status === 'activo').length
  const margin = totals.collected > 0 ? Math.round((totals.profit / totals.collected) * 100) : null

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="La foto del negocio: ingresos, utilidad, ventas, clientes, proyectos y soporte. Cifras sin IVA y en base efectivo."
        actions={<Segmented<Range> value={range} onChange={setRange} options={[{ value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />}
      />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="MRR activo" value={money(m.active)} sub={mrrStart ? `${m.active >= mrrStart ? '+' : ''}${money(m.active - mrrStart)} vs ${monthLabel(months[0])}` : `${money(m.committed)} por arrancar`} />
          <Stat label="Clientes activos" value={activeClients} sub={churned ? `${churned} cancelaciones en el periodo` : 'Sin cancelaciones'} tone={churned ? 'amber' : undefined} />
          <Stat label={`Cobrado (${n} meses)`} value={money(totals.collected)} tone="green" />
          <Stat label={`Utilidad (${n} meses)`} value={money(totals.profit)} sub={margin == null ? 'Sin cobros aún' : `Margen ${margin}%`} tone={totals.profit < 0 ? 'red' : 'green'} />
          <Stat label="Tasa de cierre" value={sales.closed ? `${Math.round((sales.won / sales.closed) * 100)}%` : '—'} sub={`${sales.won} ganadas de ${sales.closed} cerradas`} />
          <Stat label="SLA de soporte" value={slaAll == null ? '—' : `${slaAll}%`} sub="Primera respuesta en tiempo" tone={slaAll == null ? undefined : slaAll >= 90 ? 'green' : 'amber'} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Cobrado, gastos y utilidad por mes">
            <Bars
              rows={results.map((r) => ({ label: monthLabel(r.ym).split(' ')[0], current: r.ym === today.slice(0, 7), values: [r.collectedNet, r.expenses, r.profit] }))}
              series={[{ label: 'Cobrado sin IVA', color: 'bg-emerald-500' }, { label: 'Gastos sin IVA', color: 'bg-stone-300' }, { label: 'Utilidad (tenue si es negativa)', color: 'bg-brand-400' }]}
            />
          </Card>
          <Card title="MRR al cierre de cada mes">
            <Bars rows={months.map((ym, i) => ({ label: monthLabel(ym).split(' ')[0], current: ym === today.slice(0, 7), values: [mrrSeries[i]] }))} series={[{ label: 'MRR (precios actuales de cada suscripción)', color: 'bg-brand-600' }]} />
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Card title="Ventas" actions={<Link to="/oportunidades" className="text-xs link">Pipeline</Link>}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-stone-500">Prospectos nuevos</dt><dd className="tnum text-xl font-semibold text-brand-800">{sales.newLeads}</dd></div>
              <div><dt className="text-xs text-stone-500">Convertidos a cliente</dt><dd className="tnum text-xl font-semibold text-brand-800">{sales.converted}{sales.newLeads ? <span className="text-sm font-normal text-stone-500"> · {Math.round((sales.converted / sales.newLeads) * 100)}%</span> : null}</dd></div>
              <div><dt className="text-xs text-stone-500">Valor ganado (12 meses de recurrente)</dt><dd className="tnum text-xl font-semibold text-brand-800">{money(sales.wonValue)}</dd></div>
              <div><dt className="text-xs text-stone-500">Ciclo de venta promedio</dt><dd className="tnum text-xl font-semibold text-brand-800">{sales.cycle == null ? '—' : `${sales.cycle} días`}</dd></div>
            </dl>
            {sales.reasons.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs font-medium text-stone-500">Por qué se pierden</div>
                <ul className="space-y-1 text-sm">{sales.reasons.map(([r, c]) => <li key={r} className="flex justify-between"><span className="text-stone-700">{r}</span><span className="tnum text-stone-500">{c}</span></li>)}</ul>
              </div>
            )}
          </Card>
          <Card title="De dónde vienen los prospectos" bodyClass="">
            {sales.bySource.length === 0 ? <Empty title="Sin prospectos en el periodo" /> : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Fuente</th><th className="th text-right">Prospectos</th><th className="th text-right">Clientes</th><th className="th text-right">Conversión</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {sales.bySource.map((s) => (
                    <tr key={s.value}><td className="td">{s.label}</td><td className="td tnum text-right">{s.leads}</td><td className="td tnum text-right">{s.converted}</td><td className="td tnum text-right">{Math.round((s.converted / s.leads) * 100)}%</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Cobrado por cliente" bodyClass="">
            {byClient.rows.length === 0 ? <Empty title="Sin cobros en el periodo" /> : (
              <>
                {byClient.top >= 50 && byClient.rows.length > 0 && <p className="border-b border-stone-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">Un solo cliente es el {byClient.top}% de lo cobrado: riesgo de concentración.</p>}
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {byClient.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="td w-2/5"><ClientLink id={r.id} /></td>
                        <td className="td"><Progress pct={(r.v / Math.max(1, byClient.total)) * 100} /></td>
                        <td className="td tnum w-28 text-right font-medium">{money(r.v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Card title="Proyectos: avance, horas y margen" className="xl:col-span-2" bodyClass="">
            {projRows.length === 0 ? <Empty title="Sin proyectos" /> : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Proyecto</th><th className="th w-40">Avance</th><th className="th text-right">Horas / estimadas</th><th className="th text-right">Costo de horas</th><th className="th text-right">Monto</th><th className="th text-right">Margen</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {projRows.map(({ p, prog, cost, margin: mg }) => (
                    <tr key={p.id}>
                      <td className="td"><Link className="link" to={`/proyectos/${p.id}`}>{p.name}</Link>{prog.late.length > 0 && <span className="ml-2 text-xs text-red-600">{prog.late.length} hito(s) retrasado(s)</span>}</td>
                      <td className="td"><Progress pct={prog.pct} tone={prog.late.length ? 'red' : 'brand'} /></td>
                      <td className={`td tnum text-right ${p.estimated_hours && prog.hours > p.estimated_hours ? 'text-red-600' : ''}`}>{prog.hours} / {p.estimated_hours ?? '—'}</td>
                      <td className="td tnum text-right">{money(cost)}</td>
                      <td className="td tnum text-right">{p.budget ? money(p.budget) : '—'}</td>
                      <td className={`td tnum text-right font-medium ${mg != null && mg < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{mg == null ? '—' : money(mg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Gastos por categoría" bodyClass="">
            {expCats.length === 0 ? <Empty title="Sin gastos en el periodo" /> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone-100">
                  {expCats.map(([c, v]) => (
                    <tr key={c}><td className="td">{expenseCategoryLabel(c)}</td><td className="td tnum text-right font-medium">{money(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card title="Soporte por mes" bodyClass="">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Mes</th><th className="th text-right">Tickets</th><th className="th w-1/2">SLA cumplido</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {support.map((s) => (
                <tr key={s.ym}>
                  <td className="td">{monthLabel(s.ym)}</td>
                  <td className="td tnum text-right">{s.count}</td>
                  <td className="td">{s.sla == null ? <span className="text-stone-500">—</span> : <div className="flex items-center gap-2"><Progress pct={s.sla} tone={s.sla >= 90 ? 'green' : 'red'} /><span className="tnum w-10 text-right text-xs">{s.sla}%</span></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
