import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Tabs, Card, Stat, Badge, Empty, Progress, clickRow } from '../components/ui'
import { ClientLink } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { InvoicesTable, PaymentsTable, SubscriptionsTable } from '../components/tables'
import { AssetsTable, ContractsTable, ExpensesTable } from '../components/financeTables'
import { expenseCategoryLabel } from '../lib/constants'
import { ExpenseImport } from '../components/ExpenseImport'
import { addDays, addMonths, fdate, money, monthLabel, todayISO } from '../lib/format'
import { assetMonthly, collectedInMonth, distribution, expectedCharges, expensesByCategory, expensesPending, monthResult, mrr, platformCost, receivables, referralDiscount, subMonthly, subUnitPrice } from '../lib/metrics'

type TabKey = 'resumen' | 'cobros' | 'facturas' | 'pagos' | 'gastos' | 'servicios' | 'contratos' | 'suscripciones' | 'distribucion'

export default function Finance() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) ?? 'resumen'
  const setTab = (t: TabKey) => setParams(t === 'resumen' ? {} : { tab: t }, { replace: true })
  const { db, settings, byId, can } = useData()
  const quick = useQuick()
  const invoices = useTable('invoices')
  const payments = useTable('payments')
  const subs = useTable('subscriptions')
  const clients = useTable('clients')
  const referrals = useTable('referrals')
  const expenses = useTable('expenses')
  const assets = useTable('assets')
  const contracts = useTable('contracts')
  const [year, setYear] = useState(todayISO().slice(0, 4))
  const [importOpen, setImportOpen] = useState(false)
  const [expFilter, setExpFilter] = useState<'todos' | 'pendiente'>('todos')
  const today = todayISO()

  const m = mrr(db, settings)
  const rec = receivables(db)
  const dist = distribution(db)

  const months = useMemo(() => {
    const out: { ym: string; invoiced: number; collected: number; expected: number }[] = []
    for (let i = -5; i <= 6; i++) {
      const ym = addMonths(`${today.slice(0, 7)}-01`, i).slice(0, 7)
      const invoiced = invoices.filter((x) => x.status === 'emitida' && x.issue_date.startsWith(ym)).reduce((a, x) => a + x.total, 0)
      const collected = collectedInMonth(payments, ym)
      const expected = expectedCharges(db, settings, `${ym}-01`, `${ym}-31`).reduce((a, c) => a + c.amount, 0)
      out.push({ ym, invoiced, collected, expected })
    }
    return out
  }, [invoices, payments, db, settings, today])
  const maxM = Math.max(1, ...months.map((x) => Math.max(x.invoiced, x.collected, x.expected)))

  const charges = expectedCharges(db, settings, addDays(today, -60), addDays(today, 62))
  const platform = platformCost(db, settings)
  const fixedCost = platform.amount
  const thisMonth = monthResult(db, settings, today.slice(0, 7))
  const pendingExp = expensesPending(db)
  const yearRows = useMemo(() => {
    const last = year === today.slice(0, 4) ? Number(today.slice(5, 7)) : 12
    return Array.from({ length: last }, (_, i) => monthResult(db, settings, `${year}-${String(i + 1).padStart(2, '0')}`))
  }, [db, settings, year, today])
  const yearTotal = yearRows.reduce(
    (t, r) => ({ invoiced: t.invoiced + r.invoiced, collectedNet: t.collectedNet + r.collectedNet, expenses: t.expenses + r.expenses, profit: t.profit + r.profit, ivaCollected: t.ivaCollected + r.ivaCollected, ivaCredit: t.ivaCredit + r.ivaCredit }),
    { invoiced: 0, collectedNet: 0, expenses: 0, profit: 0, ivaCollected: 0, ivaCredit: 0 },
  )
  const byCat = expensesByCategory(db, year)
  const years = [...new Set([today.slice(0, 4), ...expenses.map((e) => e.expense_date.slice(0, 4)), ...payments.map((p) => p.payment_date.slice(0, 4))])].sort().reverse()
  const assetsMonthly = assets.reduce((t, a) => t + assetMonthly(db, a), 0)
  const ticks = [1, 0.5, 0]

  return (
    <>
      <PageHeader
        title="Finanzas"
        subtitle="Visibilidad de cada relación comercial: no sustituye a la contabilidad. Los CFDI se registran a mano."
        actions={
          can('finance.manage') && (
            <>
              <button className="btn-secondary" onClick={() => quick.open('expense')}><Plus size={15} /> Gasto</button>
              <button className="btn-secondary" onClick={() => quick.open('invoice')}><Plus size={15} /> Factura</button>
              <button className="btn-primary" onClick={() => quick.open('payment')}><Plus size={15} /> Pago recibido</button>
            </>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'cobros', label: 'Cobranza', count: charges.filter((c) => !c.invoice && c.date <= addDays(today, 5)).length },
          { key: 'facturas', label: 'Facturas', count: invoices.length },
          { key: 'pagos', label: 'Pagos', count: payments.length },
          { key: 'gastos', label: 'Gastos', count: expenses.length },
          { key: 'servicios', label: 'Servicios y renovaciones', count: assets.filter((a) => a.status === 'activo').length },
          { key: 'contratos', label: 'Contratos', count: contracts.filter((c) => c.status !== 'terminado').length },
          { key: 'suscripciones', label: 'Suscripciones', count: subs.length },
          { key: 'distribucion', label: 'Distribución y referidos' },
        ]}
      />
      <ExpenseImport open={importOpen} onClose={() => setImportOpen(false)} />
      <div className="mt-4">
        {tab === 'resumen' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="Utilidad del mes" value={money(thisMonth.profit)} tone={thisMonth.profit < 0 ? 'red' : 'green'} sub={`Cobrado ${money(thisMonth.collectedNet)} − gastos ${money(thisMonth.expenses)} (sin IVA)`} />
              <Stat label="Gastos del mes" value={money(thisMonth.expenses)} sub={pendingExp ? `${money(pendingExp)} por pagar` : 'Nada por pagar'} tone={pendingExp ? 'amber' : undefined} onClick={() => setTab('gastos')} />
              <Stat label="IVA estimado del mes" value={money(Math.max(0, thisMonth.ivaCollected - thisMonth.ivaCredit))} sub={`Cobrado ${money(thisMonth.ivaCollected)} − acreditable ${money(thisMonth.ivaCredit)}. Confírmalo con tu contador.`} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="MRR activo" value={money(m.active)} sub={`ARR ${money(m.arr)}`} />
              <Stat label="MRR por arrancar" value={money(m.committed)} sub="Suscripciones firmadas sin go-live" />
              <Stat label="Por cobrar" value={money(rec.total)} tone={rec.overdue ? 'red' : undefined} sub={rec.overdue ? `${money(rec.overdue)} vencido` : 'Nada vencido'} onClick={() => setTab('facturas')} />
              <Stat label="Cobrado este mes" value={money(collectedInMonth(payments, today.slice(0, 7)))} tone="green" sub={monthLabel(today.slice(0, 7))} />
              <Stat label="Costo de plataforma" value={money(fixedCost)} sub={`${platform.fromAssets ? 'Según servicios registrados' : 'Estimado por paquete'} · margen ${money(m.active + m.committed - fixedCost)}/mes`} onClick={() => setTab('servicios')} tone={m.active + m.committed - fixedCost < 0 ? 'red' : undefined} />
            </div>
            <Card title="Facturado, cobrado y esperado por mes">
              <div className="relative flex h-48 items-end gap-3 pl-14">
                {ticks.map((t) => (
                  <div key={t} className="pointer-events-none absolute left-0 right-0 flex items-center gap-2" style={{ bottom: `calc(${t} * 10rem + 1.75rem)` }}>
                    <span className="tnum w-12 text-right text-[10px] text-stone-500">{money(maxM * t)}</span>
                    <span className="h-px flex-1 bg-stone-100" />
                  </div>
                ))}
                {months.map((x) => (
                  <div key={x.ym} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative flex h-40 w-full items-end justify-center gap-0.5">
                      <div title={`Esperado ${money(x.expected)}`} className="w-1/4 rounded-t bg-brand-200" style={{ height: `${(x.expected / maxM) * 100}%` }} />
                      <div title={`Facturado ${money(x.invoiced)}`} className="w-1/4 rounded-t bg-brand-400" style={{ height: `${(x.invoiced / maxM) * 100}%` }} />
                      <div title={`Cobrado ${money(x.collected)}`} className="w-1/4 rounded-t bg-emerald-500" style={{ height: `${(x.collected / maxM) * 100}%` }} />
                    </div>
                    <span className={`text-[11px] ${x.ym === today.slice(0, 7) ? 'font-semibold text-brand-800' : 'text-stone-500'}`}>{monthLabel(x.ym)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-stone-500">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Mensualidades esperadas (sin IVA)</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-400" /> Facturado (con IVA)</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Cobrado</span>
              </div>
            </Card>
            <Card
              title="Estado de resultados (base efectivo)"
              actions={<select className="input h-8 w-24 py-0 text-sm" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año">{years.map((y) => <option key={y}>{y}</option>)}</select>}
              bodyClass=""
            >
              <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">Sustituye la hoja Resumen del Excel. Utilidad = cobrado sin IVA − gastos pagados sin IVA. IVA por pagar = IVA cobrado − IVA acreditable (estimado; tu contador lo confirma).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Mes</th><th className="th text-right">Facturado</th><th className="th text-right">Cobrado</th><th className="th text-right">Gastos</th><th className="th text-right">Utilidad</th><th className="th text-right">Margen</th><th className="th text-right">IVA por pagar</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {yearRows.map((r) => (
                      <tr key={r.ym} className={r.ym === today.slice(0, 7) ? 'bg-brand-50/40' : ''}>
                        <td className="td">{monthLabel(r.ym)}</td>
                        <td className="td tnum text-right">{money(r.invoiced)}</td>
                        <td className="td tnum text-right">{money(r.collectedNet)}</td>
                        <td className="td tnum text-right">{money(r.expenses)}</td>
                        <td className={`td tnum text-right font-medium ${r.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(r.profit)}</td>
                        <td className="td tnum text-right text-stone-600">{r.collectedNet > 0 ? `${Math.round((r.profit / r.collectedNet) * 100)}%` : '—'}</td>
                        <td className="td tnum text-right">{money(Math.max(0, r.ivaCollected - r.ivaCredit))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-stone-200 font-semibold">
                    <tr>
                      <td className="td">Total {year}</td>
                      <td className="td tnum text-right">{money(yearTotal.invoiced)}</td>
                      <td className="td tnum text-right">{money(yearTotal.collectedNet)}</td>
                      <td className="td tnum text-right">{money(yearTotal.expenses)}</td>
                      <td className={`td tnum text-right ${yearTotal.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(yearTotal.profit)}</td>
                      <td className="td tnum text-right">{yearTotal.collectedNet > 0 ? `${Math.round((yearTotal.profit / yearTotal.collectedNet) * 100)}%` : '—'}</td>
                      <td className="td tnum text-right">{money(Math.max(0, yearTotal.ivaCollected - yearTotal.ivaCredit))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
            <Card title={`Gastos por categoría ${year}`} bodyClass="">
              {byCat.length === 0 ? <Empty title="Sin gastos pagados este año" /> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {byCat.map((x) => (
                      <tr key={x.category}>
                        <td className="td w-1/3">{expenseCategoryLabel(x.category)}</td>
                        <td className="td"><Progress pct={(x.amount / Math.max(1, yearTotal.expenses)) * 100} /></td>
                        <td className="td tnum w-32 text-right font-medium">{money(x.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Ingreso recurrente por cliente" bodyClass="">
              {subs.length === 0 ? <Empty title="Sin suscripciones" /> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {clients
                      .map((c) => ({ c, v: subs.filter((s) => s.client_id === c.id && s.status !== 'cancelada').reduce((a, s) => a + subMonthly(db, s, settings), 0) }))
                      .filter((x) => x.v > 0)
                      .sort((a, b) => b.v - a.v)
                      .map(({ c, v }) => (
                        <tr key={c.id}>
                          <td className="td w-1/3"><ClientLink id={c.id} /></td>
                          <td className="td"><Progress pct={(v / Math.max(1, m.active + m.committed)) * 100} /></td>
                          <td className="td tnum w-32 text-right font-medium">{money(v)}/mes</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}

        {tab === 'cobros' && (
          <Card title="Mensualidades: 60 días atrás y 2 meses adelante" bodyClass="">
            <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">Proceso (SOP 8): emitir CFDI → enviar → recordatorio día {settings.invoice_reminder_days.join(' y ')} → seguimiento → registrar el pago.</p>
            {charges.length === 0 ? <Empty title="Sin mensualidades programadas">Aparecen aquí cuando una suscripción tiene fecha de inicio de cobro.</Empty> : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Fecha</th><th className="th">Cliente</th><th className="th">Concepto</th><th className="th text-right">Monto (sin IVA)</th><th className="th">Estado</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {charges.map((ch) => {
                    const prod = byId('products', ch.sub.product_id)
                    const late = !ch.invoice && ch.date < today
                    return (
                      <tr key={ch.sub.id + ch.period} className={late ? 'bg-red-50/40' : ''}>
                        <td className="td tnum">{fdate(ch.date)}</td>
                        <td className="td"><ClientLink id={ch.sub.client_id} /></td>
                        <td className="td text-stone-600">{prod?.name} · {ch.sub.quantity} {prod?.unit} · {ch.period}</td>
                        <td className="td tnum text-right">{money(ch.amount)}</td>
                        <td className="td">{ch.invoice ? <Badge tone="green">Facturada {ch.invoice.folio ?? ''}</Badge> : late ? <Badge tone="red">Sin facturar</Badge> : ch.sub.status === 'pendiente' ? <Badge tone="amber">Depende del go-live</Badge> : <Badge>Programada</Badge>}</td>
                        <td className="td text-right">
                          {!ch.invoice && can('finance.manage') && (
                            <button className="btn-secondary btn-sm" onClick={() => quick.open('invoice', { client_id: ch.sub.client_id, subscription_id: ch.sub.id, period: ch.period, issue_date: ch.date > today ? ch.date : today, due_date: addDays(ch.date > today ? ch.date : today, 7), concept: `${prod?.name} · mensualidad ${ch.period}`, subtotal: ch.amount, tax: Math.round(ch.amount * settings.iva_rate * 100) / 100, total: Math.round(ch.amount * (1 + settings.iva_rate) * 100) / 100 })}>Registrar CFDI</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {tab === 'facturas' && (
          <Card title="Facturas (CFDI registrados a mano)" bodyClass="">
            <InvoicesTable rows={[...invoices].sort((a, b) => b.issue_date.localeCompare(a.issue_date))} />
          </Card>
        )}
        {tab === 'pagos' && (
          <Card title="Pagos recibidos" bodyClass="">
            <PaymentsTable rows={[...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date))} />
          </Card>
        )}
        {tab === 'gastos' && (
          <Card
            title="Gastos"
            actions={
              <div className="flex items-center gap-2">
                <select className="input h-8 w-36 py-0 text-sm" value={expFilter} onChange={(e) => setExpFilter(e.target.value as 'todos' | 'pendiente')} aria-label="Filtrar gastos">
                  <option value="todos">Todos</option>
                  <option value="pendiente">Por pagar</option>
                </select>
                {can('finance.manage') && <button className="btn-ghost btn-sm" onClick={() => setImportOpen(true)}>Importar del Excel</button>}
                {can('finance.manage') && <button className="btn-secondary btn-sm" onClick={() => quick.open('expense')}><Plus size={13} /> Gasto</button>}
              </div>
            }
            bodyClass=""
          >
            <ExpensesTable rows={expenses.filter((e) => expFilter === 'todos' || e.status === 'pendiente').sort((a, b) => b.expense_date.localeCompare(a.expense_date))} />
          </Card>
        )}
        {tab === 'servicios' && (
          <Card
            title="Servicios y renovaciones"
            actions={can('finance.manage') && <button className="btn-secondary btn-sm" onClick={() => quick.open('asset')}><Plus size={13} /> Servicio</button>}
            bodyClass=""
          >
            <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">Dominios, hosting, bases de datos, licencias y APIs (hoja Alojamiento del Excel). Costo mensual equivalente: <span className="tnum font-medium text-stone-700">{money(assetsMonthly)}</span>. Te avisa 15 días antes de cada renovación. Nunca guardes contraseñas aquí.</p>
            <AssetsTable rows={[...assets].sort((a, b) => (a.renewal_date ?? '9999').localeCompare(b.renewal_date ?? '9999'))} />
          </Card>
        )}
        {tab === 'contratos' && (
          <Card title="Contratos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('contract')}><Plus size={13} /> Contrato</button>} bodyClass="">
            <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">Socaire Pedidos: permanencia mínima de 6 meses. Si el cliente cancela antes, se cobra la parte proporcional del alta bonificada.</p>
            <ContractsTable rows={[...contracts].sort((a, b) => (b.start_date ?? b.created_at ?? '').localeCompare(a.start_date ?? a.created_at ?? ''))} />
          </Card>
        )}
        {tab === 'suscripciones' && (
          <Card title="Suscripciones" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('subscription')}><Plus size={13} /> Suscripción</button>} bodyClass="">
            <SubscriptionsTable rows={subs} />
          </Card>
        )}

        {tab === 'distribucion' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Sucursales activas" value={dist.activeBranches} sub="Con servicio cobrando" />
              <Stat label="Por arrancar" value={dist.pendingBranches} sub="Firmadas, sin go-live" />
              <Stat label="Potencial en clientes actuales" value={Math.max(0, dist.potential - dist.activeBranches - dist.pendingBranches)} sub={`de ${dist.potential} sucursales totales`} />
              <Stat label="Capacidad del paquete" value={`${dist.activeBranches + dist.pendingBranches} / ${Math.ceil(Math.max(1, dist.activeBranches + dist.pendingBranches) / settings.branches_per_package) * settings.branches_per_package}`} sub={`${settings.branches_per_package} sucursales por ${money(settings.fixed_cost_per_package)} de costo fijo`} />
            </div>
            <Card title="Distribución por cliente" bodyClass="">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Cliente</th><th className="th">Producto</th><th className="th text-right">Con servicio</th><th className="th text-right">Total</th><th className="th w-48">Penetración</th><th className="th text-right">Tarifa actual</th><th className="th">Referidos</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {subs.filter((s) => s.status !== 'cancelada').map((s) => {
                    const c = byId('clients', s.client_id)
                    const total = Math.max(c?.total_branches ?? 0, db.branches.filter((b) => b.client_id === s.client_id && !b.deleted_at).length, s.quantity)
                    const ref = referralDiscount(db, s, settings)
                    const windowEnd = s.start_date ? addMonths(s.start_date, settings.referral_window_months) : null
                    return (
                      <tr key={s.id}>
                        <td className="td"><ClientLink id={s.client_id} /></td>
                        <td className="td text-stone-600">{byId('products', s.product_id)?.name}</td>
                        <td className="td tnum text-right">{s.quantity}</td>
                        <td className="td tnum text-right">{total}</td>
                        <td className="td"><Progress pct={(s.quantity / total) * 100} /></td>
                        <td className="td tnum text-right">{money(subUnitPrice(db, s, settings))}</td>
                        <td className="td text-xs text-stone-600">{ref.count} de {settings.referral_steps.length}{windowEnd && <span className="text-stone-500"> · ventana hasta {fdate(windowEnd)}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
            <Card title="Programa de referidos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('referral')}><Plus size={13} /> Referido</button>} bodyClass="">
              <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">
                Cuenta cuando el referido firma mínimo 3 meses y paga su primer mes. Descuento por sucursal: {settings.referral_steps.map((x) => `−$${x}`).join(', ')} (piso {money(settings.referral_floor)}), si firma en los primeros {settings.referral_window_months} meses del servicio. El referido paga su alta al 50%. Si cancela, el descuento de ese escalón se retira.
              </p>
              {referrals.length === 0 ? <Empty title="Sin referidos registrados" /> : (
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Recomendó</th><th className="th">Referido</th><th className="th">Firmó</th><th className="th">Primer pago</th><th className="th">Estado</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {referrals.map((r) => (
                      <tr key={r.id} {...clickRow(() => quick.edit('referral', r))}>
                        <td className="td"><ClientLink id={r.referrer_client_id} /></td>
                        <td className="td"><ClientLink id={r.referred_client_id} /></td>
                        <td className="td tnum">{fdate(r.signed_date)}</td>
                        <td className="td tnum">{fdate(r.first_payment_date)}</td>
                        <td className="td">{r.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
