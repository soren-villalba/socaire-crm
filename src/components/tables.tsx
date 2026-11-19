// Tablas reutilizadas en varias pantallas (ficha de cliente, finanzas, proyectos, soporte…)
import { Link } from 'react-router-dom'
import { Circle, CheckCircle2, ExternalLink, FolderOpen, MoreHorizontal, Copy } from 'lucide-react'
import { useData } from '../lib/store'
import { Empty, StatusBadge, Badge, Menu, MenuItem, Progress } from './ui'
import { ClientLink, DueDate, UserChip } from './links'
import { useQuick } from './QuickCreate'
import { useToast } from './Toast'
import { DriveIcon } from './drive'
import { looksLikeUrl, parseDrive, safeHttpsUrl } from '../lib/drive'
import type { DocumentRec, Invoice, Payment, Project, Subscription, Task, Ticket } from '../lib/types'
import { DOC_KINDS, DOC_STATUS, PAY_STATUS, PAYMENT_METHODS, PRIORITY, PROJECT_STATUS, SUB_STATUS, TICKET_STATUS, TASK_KINDS } from '../lib/constants'
import { fdate, money, todayISO } from '../lib/format'
import { invoiceBalance, invoicePayState, minTermEnd, projectProgress, referralDiscount, subUnitPrice, taskOverdue } from '../lib/metrics'

export function InvoicesTable({ rows, showClient = true }: { rows: Invoice[]; showClient?: boolean }) {
  const { db, remove } = useData()
  const quick = useQuick()
  if (!rows.length) return <Empty title="Sin facturas registradas">Registra aquí cada CFDI que emitas (a mano). Los saldos se calculan con los pagos.</Empty>
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Folio</th>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Concepto</th>
          <th className="th">Emisión</th>
          <th className="th">Vence</th>
          <th className="th text-right">Total</th>
          <th className="th text-right">Saldo</th>
          <th className="th">Estado</th>
          <th className="th w-10"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((i) => {
          const bal = invoiceBalance(db, i)
          const st = invoicePayState(db, i)
          return (
            <tr key={i.id} className="hover:bg-stone-50">
              <td className="td font-medium">{i.folio ?? <span className="text-stone-400">s/folio</span>}</td>
              {showClient && <td className="td"><ClientLink id={i.client_id} /></td>}
              <td className="td max-w-[260px] truncate text-stone-600">{i.concept}{i.period && <span className="ml-1 text-xs text-stone-400">({i.period})</span>}</td>
              <td className="td tnum text-stone-600">{fdate(i.issue_date)}</td>
              <td className="td"><DueDate date={i.due_date} done={bal <= 0 || i.status !== 'emitida'} /></td>
              <td className="td tnum text-right">{money(i.total, true)}</td>
              <td className={`td tnum text-right ${bal > 0 ? 'font-medium' : 'text-stone-400'}`}>{money(bal, true)}</td>
              <td className="td"><StatusBadge map={PAY_STATUS} value={st} /></td>
              <td className="td">
                <Menu trigger={<button className="btn-ghost px-1" aria-label="Acciones"><MoreHorizontal size={16} /></button>}>
                  {(close) => (
                    <>
                      {bal > 0 && i.status === 'emitida' && <MenuItem onClick={() => { quick.open('payment', { invoice_id: i.id, client_id: i.client_id, amount: bal }); close() }}>Registrar pago</MenuItem>}
                      <MenuItem onClick={() => { quick.edit('invoice', i); close() }}>Editar</MenuItem>
                      <MenuItem danger onClick={() => { void remove('invoices', i.id, 'Factura'); close() }}>Eliminar</MenuItem>
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

export function PaymentsTable({ rows, showClient = true }: { rows: Payment[]; showClient?: boolean }) {
  const { byId } = useData()
  const quick = useQuick()
  if (!rows.length) return <Empty title="Sin pagos registrados" />
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Fecha</th>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Factura</th>
          <th className="th">Forma</th>
          <th className="th">Referencia</th>
          <th className="th text-right">Monto</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-stone-50" onClick={() => quick.edit('payment', p)}>
            <td className="td tnum">{fdate(p.payment_date)}</td>
            {showClient && <td className="td"><ClientLink id={p.client_id} /></td>}
            <td className="td text-stone-600">{byId('invoices', p.invoice_id)?.folio ?? (p.invoice_id ? 's/folio' : 'Sin factura')}</td>
            <td className="td text-stone-600">{PAYMENT_METHODS.find((m) => m.value === p.method)?.label}</td>
            <td className="td text-stone-600">{p.reference ?? '—'}</td>
            <td className="td tnum text-right font-medium text-emerald-700">{money(p.amount, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SubscriptionsTable({ rows, showClient = true }: { rows: Subscription[]; showClient?: boolean }) {
  const { db, byId, settings, update } = useData()
  const quick = useQuick()
  if (!rows.length) return <Empty title="Sin suscripciones" />
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Producto</th>
          <th className="th text-right">Unidades</th>
          <th className="th text-right">Precio unidad</th>
          <th className="th text-right">Mensual</th>
          <th className="th">Inicio de cobro</th>
          <th className="th">Permanencia hasta</th>
          <th className="th">Estado</th>
          <th className="th w-10"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((s) => {
          const unit = subUnitPrice(db, s, settings)
          const ref = referralDiscount(db, s, settings)
          return (
            <tr key={s.id} className="hover:bg-stone-50">
              {showClient && <td className="td"><ClientLink id={s.client_id} /></td>}
              <td className="td font-medium">{byId('products', s.product_id)?.name}</td>
              <td className="td tnum text-right">{s.quantity}</td>
              <td className="td tnum text-right">
                {money(unit)}
                {s.list_price > unit && <div className="text-xs text-stone-400 line-through">{money(s.list_price)}</div>}
                {ref.count > 0 && <div className="text-xs text-emerald-600">−{money(ref.discount)} por {ref.count} referido(s)</div>}
              </td>
              <td className="td tnum text-right font-semibold">{money(unit * s.quantity)}</td>
              <td className="td tnum">{fdate(s.start_date)}</td>
              <td className="td tnum">{fdate(minTermEnd(s))}</td>
              <td className="td"><StatusBadge map={SUB_STATUS} value={s.status} /></td>
              <td className="td">
                <Menu trigger={<button className="btn-ghost px-1" aria-label="Acciones"><MoreHorizontal size={16} /></button>}>
                  {(close) => (
                    <>
                      {s.status === 'pendiente' && <MenuItem onClick={() => { void update('subscriptions', s.id, { status: 'activa', start_date: s.start_date ?? todayISO() }); close() }}>Activar (go-live)</MenuItem>}
                      {s.status === 'activa' && <MenuItem onClick={() => { void update('subscriptions', s.id, { status: 'pausada' }); close() }}>Pausar</MenuItem>}
                      {s.status === 'pausada' && <MenuItem onClick={() => { void update('subscriptions', s.id, { status: 'activa' }); close() }}>Reactivar</MenuItem>}
                      <MenuItem onClick={() => { quick.open('invoice', { client_id: s.client_id, subscription_id: s.id, concept: `${byId('products', s.product_id)?.name} · ${s.quantity} ${byId('products', s.product_id)?.unit ?? ''}(es)`, period: todayISO().slice(0, 7), subtotal: unit * s.quantity, tax: Math.round(unit * s.quantity * settings.iva_rate * 100) / 100, total: Math.round(unit * s.quantity * (1 + settings.iva_rate) * 100) / 100 }); close() }}>Registrar factura del mes</MenuItem>
                      <MenuItem onClick={() => { quick.edit('subscription', s); close() }}>Editar</MenuItem>
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

export function TaskList({ rows, showClient = true, empty = 'Sin tareas' }: { rows: Task[]; showClient?: boolean; empty?: string }) {
  const { update, db } = useData()
  const quick = useQuick()
  if (!rows.length) return <Empty title={empty} />
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((t) => {
        const done = t.status === 'hecha'
        const related =
          t.related_type === 'project' ? db.projects.find((p) => p.id === t.related_id)?.name : t.related_type === 'opportunity' ? db.opportunities.find((o) => o.id === t.related_id)?.title : null
        return (
          <li key={t.id} className="flex items-start gap-3 px-4 py-2 hover:bg-stone-50">
            <button aria-label={done ? 'Reabrir' : 'Marcar como hecha'} className={`mt-0.5 ${done ? 'text-emerald-600' : 'text-stone-300 hover:text-emerald-600'}`} onClick={() => update('tasks', t.id, done ? { status: 'pendiente', completed_at: null } : { status: 'hecha', completed_at: new Date().toISOString() }, { silent: true })}>
              {done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
            </button>
            <button className="min-w-0 flex-1 text-left" onClick={() => quick.edit('task', t)}>
              <div className={`text-sm ${done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{t.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                {t.kind !== 'tarea' && <span>{TASK_KINDS.find((k) => k.value === t.kind)?.label}</span>}
                {showClient && t.client_id && <span>{db.clients.find((c) => c.id === t.client_id)?.company_name}</span>}
                {related && <span className="truncate">· {related}</span>}
              </div>
            </button>
            {t.priority === 'alta' && !done && <Badge tone={taskOverdue(t) ? 'red' : 'amber'}>{PRIORITY.alta.label}</Badge>}
            <UserChip id={t.assigned_to} showName={false} />
            <span className="w-28 text-right text-xs"><DueDate date={t.due_date} done={done} /></span>
          </li>
        )
      })}
    </ul>
  )
}

export function ProjectsTable({ rows, showClient = true }: { rows: Project[]; showClient?: boolean }) {
  const { db } = useData()
  if (!rows.length) return <Empty title="Sin proyectos" />
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Proyecto</th>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Estado</th>
          <th className="th w-48">Avance</th>
          <th className="th">Fase actual</th>
          <th className="th">Go-live</th>
          <th className="th text-right">Horas</th>
          <th className="th">Resp.</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((p) => {
          const pr = projectProgress(db, p)
          return (
            <tr key={p.id} className="hover:bg-stone-50">
              <td className="td"><Link to={`/proyectos/${p.id}`} className="link font-medium">{p.name}</Link></td>
              {showClient && <td className="td"><ClientLink id={p.client_id} /></td>}
              <td className="td"><StatusBadge map={PROJECT_STATUS} value={p.status} /></td>
              <td className="td">
                <div className="flex items-center gap-2">
                  <Progress pct={pr.pct} tone={pr.late.length ? 'red' : 'brand'} />
                  <span className="tnum w-14 text-right text-xs text-stone-500">{pr.done}/{pr.total}</span>
                </div>
              </td>
              <td className="td text-stone-600">
                {pr.current ? <>{pr.current.milestone} · {pr.current.name}</> : '—'}
                {pr.late.length > 0 && <Badge tone="red" className="ml-1">{pr.late.length} retrasado(s)</Badge>}
              </td>
              <td className="td tnum">{fdate(p.go_live_date)}</td>
              <td className="td tnum text-right">{pr.hours} / {p.estimated_hours ?? '—'}</td>
              <td className="td"><UserChip id={p.manager_id} showName={false} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function TicketsTable({ rows, showClient = true }: { rows: Ticket[]; showClient?: boolean }) {
  const quick = useQuick()
  if (!rows.length) return <Empty title="Sin tickets">Registra incidencias, dudas y solicitudes de clientes. Si es una mejora, pásala a cambio de alcance (SOP 6).</Empty>
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Asunto</th>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Categoría</th>
          <th className="th">Prioridad</th>
          <th className="th">Estado</th>
          <th className="th">Abierto</th>
          <th className="th">Resp.</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((t) => (
          <tr key={t.id} className="cursor-pointer hover:bg-stone-50" onClick={() => quick.edit('ticket', t)}>
            <td className="td font-medium text-stone-800">{t.title}</td>
            {showClient && <td className="td"><ClientLink id={t.client_id} /></td>}
            <td className="td capitalize text-stone-600">{t.category}</td>
            <td className="td"><StatusBadge map={PRIORITY} value={t.priority} /></td>
            <td className="td"><StatusBadge map={TICKET_STATUS} value={t.status} /></td>
            <td className="td tnum text-stone-600">{fdate(t.created_at.slice(0, 10))}</td>
            <td className="td"><UserChip id={t.assigned_to} showName={false} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DocumentsTable({ rows, showClient = true }: { rows: DocumentRec[]; showClient?: boolean }) {
  const quick = useQuick()
  const toast = useToast()
  if (!rows.length) return <Empty title="Sin documentos">Los archivos viven en Google Drive: pega aquí su liga para abrirlos desde la ficha.</Empty>
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-stone-200 bg-stone-50/60">
        <tr>
          <th className="th">Documento</th>
          <th className="th">Tipo</th>
          {showClient && <th className="th">Cliente</th>}
          <th className="th">Estado</th>
          <th className="th">Ubicación</th>
          <th className="th">Actualizado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((d) => (
          <tr key={d.id} className="cursor-pointer hover:bg-stone-50" onClick={() => quick.edit('document', d)}>
            <td className="td font-medium text-stone-800">{d.name}</td>
            <td className="td text-stone-600">{DOC_KINDS.find((k) => k.value === d.kind)?.label}</td>
            {showClient && <td className="td">{d.client_id ? <ClientLink id={d.client_id} /> : <span className="text-stone-400">Interno</span>}</td>}
            <td className="td"><StatusBadge map={DOC_STATUS} value={d.status} /></td>
            <td className="td max-w-[320px]" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const drive = parseDrive(d.location)
                if (drive)
                  return (
                    <a href={drive.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1" title={`${drive.label} · abrir en Drive`}>
                      <DriveIcon kind={drive.kind} size={13} /> Abrir en Drive <ExternalLink size={12} />
                    </a>
                  )
                const web = safeHttpsUrl(d.location)
                if (web)
                  return (
                    <a href={web} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1" title={`Liga fuera de Drive: ${new URL(web).hostname}`}>
                      Abrir enlace <ExternalLink size={12} />
                    </a>
                  )
                if (looksLikeUrl(d.location)) return <span className="text-xs text-amber-600" title={d.location}>Liga no válida</span>
                return (
                <button
                  title="Copiar ruta"
                  className="inline-flex max-w-full items-center gap-1 truncate text-xs text-stone-500 hover:text-brand-700"
                  onClick={() => {
                    void navigator.clipboard?.writeText(d.location)
                    toast.success('Ruta copiada')
                  }}
                >
                  <FolderOpen size={12} className="shrink-0" />
                  <span className="truncate">{d.location}</span>
                  <Copy size={11} className="shrink-0" />
                </button>
                )
              })()}
            </td>
            <td className="td tnum text-stone-500">{fdate(d.updated_at.slice(0, 10))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
