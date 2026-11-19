// Tablas de la Entrega B: gastos, servicios (dominios, hosting, licencias) y contratos.
import { ExternalLink, MoreHorizontal } from 'lucide-react'
import { useData } from '../lib/store'
import { Badge, Empty, Menu, MenuItem, StatusBadge, clickRow } from './ui'
import { ClientLink, DueDate } from './links'
import { useQuick } from './QuickCreate'
import type { Asset, Contract, Expense } from '../lib/types'
import { ASSET_KINDS, CONTRACT_KINDS, CONTRACT_STATUS, COST_TYPES, EXPENSE_STATUS, expenseCategoryLabel } from '../lib/constants'
import { addMonths, fdate, money, todayISO } from '../lib/format'
import { assetMonthly, contractPhase, contractTermEnd, earlyTerminationFee, monthsLeft } from '../lib/metrics'
import { safeHttpsUrl } from '../lib/drive'

function OpenLink({ url, label = 'Abrir' }: { url?: string | null; label?: string }) {
  const safe = safeHttpsUrl(url ?? '')
  if (!safe) return <span className="text-stone-500">—</span>
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {label} <ExternalLink size={12} />
    </a>
  )
}

export function ExpensesTable({ rows, showClient = true }: { rows: Expense[]; showClient?: boolean }) {
  const { update, remove, byId, can } = useData()
  const quick = useQuick()
  if (!rows.length)
    return <Empty title="Sin gastos registrados">Registra cada pago a proveedores: plataforma, dominios, comisiones, publicidad. Así el CRM calcula tu utilidad real.</Empty>
  const total = rows.reduce((t, e) => t + e.total, 0)
  const subtotal = rows.reduce((t, e) => t + e.subtotal, 0)
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Fecha</th>
          <th className="th">Concepto</th>
          <th className="th">Proveedor</th>
          <th className="th">Categoría</th>
          {showClient && <th className="th">Cliente / producto</th>}
          <th className="th text-right">Sin IVA</th>
          <th className="th text-right">Total</th>
          <th className="th">Estado</th>
          <th className="th w-10"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((e) => (
          <tr key={e.id} {...clickRow(() => quick.edit('expense', e))}>
            <td className="td tnum whitespace-nowrap">{fdate(e.expense_date)}</td>
            <td className="td max-w-[260px] truncate font-medium text-stone-800">{e.concept}</td>
            <td className="td text-stone-600">{e.vendor || '—'}</td>
            <td className="td text-stone-600">
              {expenseCategoryLabel(e.category)}
              {e.kind === 'directo' && <Badge className="ml-1">Directo</Badge>}
            </td>
            {showClient && (
              <td className="td text-stone-600">
                {e.client_id ? <ClientLink id={e.client_id} /> : byId('products', e.product_id)?.name ?? <span className="text-stone-500">General</span>}
              </td>
            )}
            <td className="td tnum text-right">{money(e.subtotal, true)}</td>
            <td className="td tnum text-right font-medium">{money(e.total, true)}</td>
            <td className="td">
              <StatusBadge map={EXPENSE_STATUS} value={e.status} />
              {e.status === 'pendiente' && e.due_date && <div className="text-xs"><DueDate date={e.due_date} /></div>}
            </td>
            <td className="td">
              {can('finance.manage') && (
                <Menu trigger={<button className="btn-ghost px-1" aria-label="Acciones"><MoreHorizontal size={16} /></button>}>
                  {(close) => (
                    <>
                      {e.status === 'pendiente' && <MenuItem onClick={() => { void update('expenses', e.id, { status: 'pagado', expense_date: todayISO() }); close() }}>Marcar como pagado hoy</MenuItem>}
                      <MenuItem
                        onClick={() => {
                          const { id: _id, created_at: _c, updated_at: _u, created_by: _b, deleted_at: _d, ...rest } = e
                          void [_id, _c, _u, _b, _d]
                          quick.open('expense', { ...rest, expense_date: todayISO(), status: 'pagado', cfdi_folio: null })
                          close()
                        }}
                      >
                        Registrar de nuevo (gasto que se repite)
                      </MenuItem>
                      <MenuItem onClick={() => { quick.edit('expense', e); close() }}>Editar</MenuItem>
                      <MenuItem danger onClick={() => { void remove('expenses', e.id, 'Gasto'); close() }}>Eliminar</MenuItem>
                    </>
                  )}
                </Menu>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-stone-200 bg-stone-50/60">
        <tr>
          <td className="td text-xs font-medium uppercase tracking-wide text-stone-500" colSpan={showClient ? 5 : 4}>Total ({rows.length})</td>
          <td className="td tnum text-right font-medium">{money(subtotal, true)}</td>
          <td className="td tnum text-right font-semibold">{money(total, true)}</td>
          <td className="td" colSpan={2}></td>
        </tr>
      </tfoot>
    </table>
  )
}

export function AssetsTable({ rows }: { rows: Asset[] }) {
  const { db, update, remove, byId, can } = useData()
  const quick = useQuick()
  if (!rows.length)
    return <Empty title="Sin servicios registrados">Da de alta dominios, hosting, bases de datos y licencias con su costo y fecha de renovación. El CRM te avisa 15 días antes de que venzan.</Empty>
  const category = (a: Asset) => (a.kind === 'dominio' || a.kind === 'hosting' || a.kind === 'base_datos' ? 'hosting' : a.kind === 'correo' ? 'telefonia' : 'software')
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Servicio</th>
          <th className="th">Tipo</th>
          <th className="th">Proveedor</th>
          <th className="th">Producto / cliente</th>
          <th className="th text-right">Costo</th>
          <th className="th text-right">Al mes</th>
          <th className="th">Renovación</th>
          <th className="th">Enlace</th>
          <th className="th w-10"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((a) => (
          <tr key={a.id} {...clickRow(() => quick.edit('asset', a))} className={`row-click ${a.status === 'cancelado' ? 'opacity-60' : ''}`}>
            <td className="td">
              <div className="font-medium text-stone-800">{a.name}</div>
              {a.account && <div className="text-xs text-stone-500">{a.account}</div>}
            </td>
            <td className="td text-stone-600">{ASSET_KINDS.find((k) => k.value === a.kind)?.label}</td>
            <td className="td text-stone-600">{a.provider || '—'}</td>
            <td className="td text-stone-600">{a.client_id ? <ClientLink id={a.client_id} /> : byId('products', a.product_id)?.name ?? <span className="text-stone-500">General</span>}</td>
            <td className="td tnum text-right">
              {a.cost_type === 'gratis' ? <span className="text-stone-500">Gratis</span> : money(a.cost, true)}
              <div className="text-xs text-stone-500">{COST_TYPES.find((c) => c.value === a.cost_type)?.label}</div>
            </td>
            <td className="td tnum text-right font-medium">{money(assetMonthly(db, a), true)}</td>
            <td className="td">{a.cost_type === 'gratis' ? <span className="text-stone-500">—</span> : <DueDate date={a.renewal_date} />}</td>
            <td className="td"><OpenLink url={a.url} /></td>
            <td className="td">
              {can('finance.manage') && (
                <Menu trigger={<button className="btn-ghost px-1" aria-label="Acciones"><MoreHorizontal size={16} /></button>}>
                  {(close) => (
                    <>
                      {a.cost_type !== 'gratis' && (
                        <MenuItem
                          onClick={() => {
                            quick.open(
                              'expense',
                              { concept: a.name, vendor: a.provider, category: category(a), asset_id: a.id, product_id: a.product_id, client_id: a.client_id, kind: a.client_id ? 'directo' : 'operativo', subtotal: a.cost, tax: 0, total: a.cost },
                              () => {
                                // Pagado: la siguiente renovación se recorre un mes o un año.
                                if (a.renewal_date && (a.cost_type === 'mensual' || a.cost_type === 'anual' || a.cost_type === 'por_cliente'))
                                  void update('assets', a.id, { renewal_date: addMonths(a.renewal_date, a.cost_type === 'anual' ? 12 : 1) }, { silent: true })
                              },
                            )
                            close()
                          }}
                        >
                          Registrar pago (y recorrer la renovación)
                        </MenuItem>
                      )}
                      {a.status === 'activo' && <MenuItem onClick={() => { void update('assets', a.id, { status: 'cancelado' }); close() }}>Marcar cancelado</MenuItem>}
                      <MenuItem onClick={() => { quick.edit('asset', a); close() }}>Editar</MenuItem>
                      <MenuItem danger onClick={() => { void remove('assets', a.id, 'Servicio'); close() }}>Eliminar</MenuItem>
                    </>
                  )}
                </Menu>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const PHASE_LABEL = {
  sin_firma: { label: '', tone: 'neutral' as const },
  permanencia: { label: 'En permanencia', tone: 'brand' as const },
  mes_a_mes: { label: 'Mes a mes', tone: 'green' as const },
  vencido: { label: 'Vencido', tone: 'red' as const },
  terminado: { label: '', tone: 'neutral' as const },
}

export function ContractsTable({ rows, showClient = true }: { rows: Contract[]; showClient?: boolean }) {
  const { update, remove } = useData()
  const quick = useQuick()
  if (!rows.length)
    return <Empty title="Sin contratos registrados">Registra cada contrato con su permanencia, la alta bonificada y la liga al documento en Drive. El CRM te avisa antes de que termine.</Empty>
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Contrato</th>
          <th className="th">Estado</th>
          <th className="th">Firmado</th>
          <th className="th">Permanencia hasta</th>
          <th className="th text-right" title="Alta bonificada proporcional a los meses que faltan">Si cancela hoy</th>
          <th className="th">Documento</th>
          <th className="th w-10"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((c) => {
          const phase = contractPhase(c)
          const end = contractTermEnd(c)
          const fee = earlyTerminationFee(c)
          const left = monthsLeft(c)
          return (
            <tr key={c.id} {...clickRow(() => quick.edit('contract', c))}>
              {showClient && <td className="td"><ClientLink id={c.client_id} /></td>}
              <td className="td">
                <div className="font-medium text-stone-800">{c.title}</div>
                <div className="text-xs text-stone-500">{CONTRACT_KINDS.find((k) => k.value === c.kind)?.label}</div>
              </td>
              <td className="td">
                <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                {PHASE_LABEL[phase].label && <Badge tone={PHASE_LABEL[phase].tone} className="ml-1">{PHASE_LABEL[phase].label}</Badge>}
              </td>
              <td className="td tnum">{fdate(c.signed_date)}</td>
              <td className="td tnum">
                {end ? fdate(end) : '—'}
                {left > 0 && <div className="text-xs text-stone-500">faltan {left} {left === 1 ? 'mes' : 'meses'}</div>}
              </td>
              <td className="td tnum text-right">{fee > 0 ? <span className="font-medium">{money(fee)}</span> : <span className="text-stone-500">—</span>}</td>
              <td className="td"><OpenLink url={c.document_url} label="Abrir en Drive" /></td>
              <td className="td">
                <Menu trigger={<button className="btn-ghost px-1" aria-label="Acciones"><MoreHorizontal size={16} /></button>}>
                  {(close) => (
                    <>
                      {c.status === 'borrador' && <MenuItem onClick={() => { void update('contracts', c.id, { status: 'enviado', sent_date: todayISO() }); close() }}>Marcar enviado</MenuItem>}
                      {(c.status === 'borrador' || c.status === 'enviado') && <MenuItem onClick={() => { void update('contracts', c.id, { status: 'firmado', signed_date: todayISO() }); close() }}>Marcar firmado hoy</MenuItem>}
                      {c.status === 'firmado' && <MenuItem onClick={() => { void update('contracts', c.id, { status: 'terminado', terminated_date: todayISO() }); close() }}>Terminar contrato</MenuItem>}
                      <MenuItem onClick={() => { quick.edit('contract', c); close() }}>Editar</MenuItem>
                      <MenuItem danger onClick={() => { void remove('contracts', c.id, 'Contrato'); close() }}>Eliminar</MenuItem>
                    </>
                  )}
                </Menu>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
