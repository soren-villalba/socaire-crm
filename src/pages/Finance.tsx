import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Tabs, Card, Stat, Badge, Empty, Progress, clickRow } from '../components/ui'
import { ClientLink } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { InvoicesTable, PaymentsTable, SubscriptionsTable } from '../components/tables'
import { addDays, addMonths, fdate, money, monthLabel, todayISO } from '../lib/format'
import { collectedInMonth, distribution, expectedCharges, mrr, receivables, referralDiscount, subMonthly, subUnitPrice } from '../lib/metrics'

type TabKey = 'resumen' | 'cobros' | 'facturas' | 'pagos' | 'suscripciones' | 'distribucion'

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
  const fixedCost = Math.ceil(Math.max(1, dist.activeBranches + dist.pendingBranches) / settings.branches_per_package) * settings.fixed_cost_per_package

  return (
    <>
      <PageHeader
        title="Finanzas"
        subtitle="Visibilidad de cada relación comercial: no sustituye a la contabilidad. Los CFDI se registran a mano."
        actions={
          can('finance.manage') && (
            <>
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
          { key: 'suscripciones', label: 'Suscripciones', count: subs.length },
          { key: 'distribucion', label: 'Distribución y referidos' },
        ]}
      />
      <div className="mt-4">
        {tab === 'resumen' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="MRR activo" value={money(m.active)} sub={`ARR ${money(m.arr)}`} />
              <Stat label="MRR por arrancar" value={money(m.committed)} sub="Suscripciones firmadas sin go-live" />
              <Stat label="Por cobrar" value={money(rec.total)} tone={rec.overdue ? 'red' : undefined} sub={rec.overdue ? `${money(rec.overdue)} vencido` : 'Nada vencido'} onClick={() => setTab('facturas')} />
              <Stat label="Cobrado este mes" value={money(collectedInMonth(payments, today.slice(0, 7)))} tone="green" sub={monthLabel(today.slice(0, 7))} />
              <Stat label="Costo fijo de plataforma" value={money(fixedCost)} sub={`Margen MRR: ${money(m.active + m.committed - fixedCost)}/mes`} tone={m.active + m.committed - fixedCost < 0 ? 'red' : undefined} />
            </div>
            <Card title="Facturado, cobrado y esperado por mes">
              <div className="flex h-48 items-end gap-3">
                {months.map((x) => (
                  <div key={x.ym} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-40 w-full items-end justify-center gap-0.5">
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
