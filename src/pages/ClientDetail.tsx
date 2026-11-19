import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageSquarePlus, CheckSquare, Target, Pencil, Plus, Phone, Mail, Star, ShieldCheck, MoreHorizontal, FileSpreadsheet, Receipt } from 'lucide-react'
import { useData } from '../lib/store'
import { Card, KV, StatusBadge, Tabs, Empty, Badge, Avatar, Menu, MenuItem } from '../components/ui'
import { DueDate, UserChip } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { InvoicesTable, PaymentsTable, ProjectsTable, SubscriptionsTable, TaskList, TicketsTable, DocumentsTable } from '../components/tables'
import { CLIENT_STATUS, INTERACTION_KINDS, PRIORITY, SOURCES, QUOTE_STATUS } from '../lib/constants'
import { addDays, fdate, fdatetime, money, todayISO } from '../lib/format'
import { expectedCharges, invoiceBalance, isOpen, quoteEffectiveStatus, subMonthly, clientRevenue } from '../lib/metrics'
import { StageBadge } from './Opportunities'

type TabKey = 'resumen' | 'actividad' | 'contactos' | 'servicios' | 'proyectos' | 'finanzas' | 'soporte' | 'documentos'

export default function ClientDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { db, byId, settings, update, remove } = useData()
  const quick = useQuick()
  const navigate = useNavigate()
  const c = byId('clients', id)
  const tab = (params.get('tab') as TabKey) ?? 'resumen'
  const setTab = (t: TabKey) => setParams(t === 'resumen' ? {} : { tab: t }, { replace: true })

  const data = useMemo(() => {
    const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at)
    const mine = <T extends { client_id?: string | null; deleted_at?: string | null }>(a: T[]) => live(a).filter((x) => x.client_id === id)
    const subs = mine(db.subscriptions)
    const invoices = mine(db.invoices).sort((a, b) => b.issue_date.localeCompare(a.issue_date))
    const payments = mine(db.payments).sort((a, b) => b.payment_date.localeCompare(a.payment_date))
    return {
      contacts: mine(db.contacts).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
      branches: mine(db.branches),
      subs,
      opps: mine(db.opportunities),
      quotes: mine(db.quotes).filter((q) => q.status !== 'reemplazada').sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
      projects: mine(db.projects),
      tasks: mine(db.tasks).sort((a, b) => Number(a.status === 'hecha') - Number(b.status === 'hecha') || (a.due_date ?? '9').localeCompare(b.due_date ?? '9')),
      interactions: mine(db.interactions),
      invoices,
      payments,
      tickets: mine(db.tickets),
      documents: mine(db.documents),
      referralsOut: live(db.referrals).filter((r) => r.referrer_client_id === id),
      referredBy: live(db.referrals).find((r) => r.referred_client_id === id),
      mrr: subs.filter((s) => s.status === 'activa').reduce((a, s) => a + subMonthly(db, s, settings), 0),
      mrrPending: subs.filter((s) => s.status === 'pendiente').reduce((a, s) => a + subMonthly(db, s, settings), 0),
      balance: invoices.filter((i) => i.status === 'emitida').reduce((a, i) => a + invoiceBalance(db, i), 0),
      charges: expectedCharges(db, settings, addDays(todayISO(), -90), addDays(todayISO(), 90)).filter((ch) => ch.sub.client_id === id),
    }
  }, [db, id, settings])

  if (!c) return <div className="text-stone-500">Cliente no encontrado. <Link to="/clientes" className="link">Volver</Link></div>

  const primary = data.contacts.find((x) => x.is_primary) ?? data.contacts[0]
  const approver = data.contacts.find((x) => x.is_approver)
  const activeUnits = data.subs.filter((s) => s.status !== 'cancelada').reduce((a, s) => a + s.quantity, 0)
  const totalBranches = Math.max(c.total_branches ?? 0, data.branches.length)
  const openTasks = data.tasks.filter((t) => t.status !== 'hecha')
  const fiscalMissing = !c.tax_id || !c.tax_regime || !c.tax_zip || !c.cfdi_use

  // Línea de tiempo: interacciones, tareas hechas, pagos, facturas, hitos y cotizaciones
  const timeline = [
    ...data.interactions.map((i) => ({ id: i.id, date: i.occurred_at, kind: INTERACTION_KINDS.find((k) => k.value === i.kind)?.label ?? 'Nota', text: i.summary, user: i.user_id, tone: 'brand' as const })),
    ...data.tasks.filter((t) => t.completed_at).map((t) => ({ id: t.id, date: t.completed_at!, kind: 'Tarea hecha', text: t.title, user: t.assigned_to, tone: 'green' as const })),
    ...data.payments.map((p) => ({ id: p.id, date: `${p.payment_date}T12:00:00`, kind: 'Pago recibido', text: money(p.amount, true), user: null, tone: 'green' as const })),
    ...data.invoices.map((i) => ({ id: i.id, date: `${i.issue_date}T11:00:00`, kind: 'Factura', text: `${i.folio ?? ''} ${i.concept} · ${money(i.total, true)}`, user: null, tone: 'blue' as const })),
    ...db.project_phases.filter((ph) => ph.done_date && data.projects.some((p) => p.id === ph.project_id)).map((ph) => ({ id: ph.id, date: `${ph.done_date}T18:00:00`, kind: `Hito ${ph.milestone}`, text: ph.milestone_name, user: ph.owner_id, tone: 'violet' as const })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const dot = { brand: 'bg-brand-400', green: 'bg-emerald-500', blue: 'bg-sky-500', violet: 'bg-violet-500' }

  return (
    <>
      <div className="mb-1">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Clientes</Link>
      </div>
      {/* Encabezado permanente */}
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 font-serif text-2xl font-semibold text-brand-700">{c.company_name[0]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h1">{c.company_name}</h1>
            <Menu trigger={<button title="Cambiar estado"><StatusBadge map={CLIENT_STATUS} value={c.status} /></button>}>
              {(close) => Object.entries(CLIENT_STATUS).map(([k, v]) => <MenuItem key={k} onClick={() => { void update('clients', c.id, { status: k as typeof c.status }); close() }}>{v.label}</MenuItem>)}
            </Menu>
            {c.importance === 'alta' && <Badge tone="brand"><Star size={11} /> Importante</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
            {c.industry && <span>{c.industry}</span>}
            <span className="flex items-center gap-1">Cuenta: <UserChip id={c.account_manager_id} /></span>
            {primary && (
              <span className="flex items-center gap-1.5">
                Contacto: <b className="font-medium text-stone-700">{primary.name}</b>
                {primary.phone && <a href={`https://wa.me/${primary.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-0.5"><Phone size={12} />{primary.phone}</a>}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => quick.open('interaction', { client_id: c.id })}><MessageSquarePlus size={15} /> Interacción</button>
          <button className="btn-secondary" onClick={() => quick.open('task', { client_id: c.id, related_type: 'client', related_id: c.id })}><CheckSquare size={15} /> Tarea</button>
          <button className="btn-secondary" onClick={() => quick.open('opportunity', { client_id: c.id })}><Target size={15} /> Oportunidad</button>
          <Menu trigger={<button className="btn-secondary px-2" aria-label="Más acciones"><MoreHorizontal size={16} /></button>}>
            {(close) => (
              <>
                <MenuItem onClick={() => { quick.edit('client', c); close() }}><Pencil size={14} /> Editar datos</MenuItem>
                <MenuItem onClick={() => { navigate(`/cotizaciones/nueva?client=${c.id}`); close() }}><FileSpreadsheet size={14} /> Nueva cotización</MenuItem>
                <MenuItem onClick={() => { quick.open('invoice', { client_id: c.id }); close() }}><Receipt size={14} /> Registrar factura</MenuItem>
                <MenuItem onClick={() => { quick.open('payment', { client_id: c.id }); close() }}><Receipt size={14} /> Registrar pago</MenuItem>
                <MenuItem danger onClick={() => { void remove('clients', c.id, 'Cliente'); close(); navigate('/clientes') }}>Eliminar cliente</MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {/* Resumen financiero y operativo */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="Ingreso recurrente" value={money(data.mrr)} sub={data.mrrPending ? `+${money(data.mrrPending)} por arrancar` : '/mes'} />
        <MiniStat label="Sucursales con servicio" value={activeUnits || totalBranches ? `${activeUnits} de ${totalBranches || activeUnits}` : '—'} sub={totalBranches > activeUnits ? `${totalBranches - activeUnits} por ganar` : undefined} />
        <MiniStat label="Proyectos activos" value={String(data.projects.filter((p) => p.status === 'en_curso' || p.status === 'planeacion').length)} />
        <MiniStat label="Saldo pendiente" value={money(data.balance)} tone={data.balance > 0 ? 'amber' : undefined} sub={`Cobrado total ${money(clientRevenue(db, c))}`} />
        <MiniStat label="Cliente desde" value={fdate(c.relationship_start, { year: true })} sub={SOURCES.find((s) => s.value === c.acquisition_source)?.label} />
      </div>

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'actividad', label: 'Actividad', count: timeline.length },
          { key: 'contactos', label: 'Contactos', count: data.contacts.length },
          { key: 'servicios', label: 'Servicios y sucursales', count: data.subs.length },
          { key: 'proyectos', label: 'Proyectos', count: data.projects.length },
          { key: 'finanzas', label: 'Finanzas', count: data.invoices.length },
          { key: 'soporte', label: 'Soporte', count: data.tickets.filter((t) => t.status !== 'cerrado' && t.status !== 'resuelto').length },
          { key: 'documentos', label: 'Documentos', count: data.documents.length },
        ]}
      />

      <div className="mt-4">
        {tab === 'resumen' && (
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <Card title="Pendientes" actions={<button className="btn-ghost btn-sm" onClick={() => quick.open('task', { client_id: c.id, related_type: 'client', related_id: c.id })}><Plus size={13} /> Tarea</button>} bodyClass="">
                <TaskList rows={openTasks} showClient={false} empty="Sin pendientes con este cliente" />
              </Card>
              <Card title="Oportunidades" actions={<button className="btn-ghost btn-sm" onClick={() => quick.open('opportunity', { client_id: c.id })}><Plus size={13} /> Oportunidad</button>} bodyClass="">
                {data.opps.length === 0 ? <Empty title="Sin oportunidades" /> : (
                  <ul className="divide-y divide-stone-100">
                    {data.opps.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a))).map((o) => (
                      <li key={o.id}>
                        <Link to={`/oportunidades?o=${o.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-stone-50">
                          <span className="flex-1 font-medium text-stone-800">{o.title}</span>
                          <span className="tnum text-stone-600">{o.estimated_mrr ? `${money(o.estimated_mrr)}/mes` : money(o.estimated_value)}</span>
                          <StageBadge stage={o.stage} />
                          {isOpen(o) && <span className="w-32 text-right text-xs"><DueDate date={o.next_followup_date} /></span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {data.quotes.length > 0 && (
                <Card title="Cotizaciones" bodyClass="">
                  <ul className="divide-y divide-stone-100">
                    {data.quotes.map((q) => (
                      <li key={q.id}>
                        <Link to={`/cotizaciones/${q.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-stone-50">
                          <span className="font-medium">{q.folio}</span><span className="text-stone-400">v{q.version}</span>
                          <span className="flex-1 truncate text-stone-600">{q.title}</span>
                          <StatusBadge map={QUOTE_STATUS} value={quoteEffectiveStatus(q)} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card title="Actividad reciente" actions={<button className="btn-ghost btn-sm" onClick={() => setTab('actividad')}>Ver todo</button>}>
                <Timeline items={timeline.slice(0, 5)} dot={dot} />
              </Card>
            </div>
            <div className="space-y-5">
              <Card title="Datos generales" actions={<button className="btn-ghost btn-sm" onClick={() => quick.edit('client', c)}><Pencil size={13} /> Editar</button>}>
                <dl>
                  <KV label="Giro">{c.industry}</KV>
                  <KV label="Tamaño">{c.size}</KV>
                  <KV label="Teléfono">{c.phone}</KV>
                  <KV label="Correo">{c.email}</KV>
                  <KV label="Ciudad">{c.city}</KV>
                  <KV label="Importancia"><StatusBadge map={PRIORITY} value={c.importance} /></KV>
                  <KV label="Temporadas altas">{c.peak_seasons}</KV>
                  <KV label="Aprueba">{approver ? approver.name : <span className="text-amber-600">Sin definir</span>}</KV>
                  {data.referredBy && <KV label="Referido por"><Link className="link" to={`/clientes/${data.referredBy.referrer_client_id}`}>{byId('clients', data.referredBy.referrer_client_id)?.company_name}</Link></KV>}
                  <KV label="Carpeta">{c.folder_path ? <span className="break-all text-xs">{c.folder_path}</span> : null}</KV>
                </dl>
              </Card>
              <Card title={<span className="flex items-center gap-1.5">Datos fiscales {fiscalMissing && <Badge tone="amber">Incompletos</Badge>}</span>}>
                <dl>
                  <KV label="Razón social">{c.legal_name}</KV>
                  <KV label="RFC">{c.tax_id}</KV>
                  <KV label="Régimen">{c.tax_regime}</KV>
                  <KV label="CP fiscal">{c.tax_zip}</KV>
                  <KV label="Uso de CFDI">{c.cfdi_use}</KV>
                  <KV label="Correo factura">{c.billing_email}</KV>
                </dl>
              </Card>
              {c.notes && (
                <Card title="Notas internas">
                  <p className="whitespace-pre-wrap text-sm text-stone-700">{c.notes}</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {tab === 'actividad' && (
          <Card title="Línea de tiempo" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('interaction', { client_id: c.id })}><Plus size={13} /> Registrar interacción</button>}>
            <Timeline items={timeline} dot={dot} />
          </Card>
        )}

        {tab === 'contactos' && (
          <Card title="Contactos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('contact', { client_id: c.id })}><Plus size={13} /> Contacto</button>} bodyClass="">
            {data.contacts.length === 0 ? <Empty title="Sin contactos" /> : (
              <ul className="divide-y divide-stone-100">
                {data.contacts.map((ct) => (
                  <li key={ct.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={ct.name} size={32} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => quick.edit('contact', ct)}>
                      <div className="flex items-center gap-2 font-medium text-stone-800">
                        {ct.name}
                        {ct.is_primary && <Badge tone="brand">Principal</Badge>}
                        {ct.is_approver && <Badge tone="green"><ShieldCheck size={11} /> Aprueba</Badge>}
                      </div>
                      <div className="text-xs text-stone-500">{ct.role ?? '—'}{ct.notes ? ` · ${ct.notes}` : ''}</div>
                    </button>
                    {ct.phone && <a className="btn-ghost btn-sm" href={`https://wa.me/${ct.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Phone size={13} /> {ct.phone}</a>}
                    {ct.email && <a className="btn-ghost btn-sm" href={`mailto:${ct.email}`}><Mail size={13} /> {ct.email}</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'servicios' && (
          <div className="space-y-5">
            <Card title="Servicios contratados" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('subscription', { client_id: c.id })}><Plus size={13} /> Suscripción</button>} bodyClass="">
              <SubscriptionsTable rows={data.subs} showClient={false} />
              {data.subs.some((s) => s.notes) && <div className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">{data.subs.map((s) => s.notes).filter(Boolean).join(' · ')}</div>}
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title={`Sucursales (${activeUnits} de ${totalBranches || data.branches.length} con servicio)`} actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('branch', { client_id: c.id })}><Plus size={13} /> Sucursal</button>} bodyClass="">
                {data.branches.length === 0 ? <Empty title="Sin sucursales registradas" /> : (
                  <ul className="divide-y divide-stone-100">
                    {data.branches.map((b) => (
                      <li key={b.id}>
                        <button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50" onClick={() => quick.edit('branch', b)}>
                          <span className={`h-2 w-2 rounded-full ${b.subscription_id ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                          <span className="flex-1 font-medium text-stone-800">{b.name}</span>
                          <span className="truncate text-xs text-stone-500">{b.address ?? b.notes ?? ''}</span>
                          {b.subscription_id ? <Badge tone="green">Con servicio</Badge> : <Badge>Por ganar</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Referidos que ha traído" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('referral', { referrer_client_id: c.id })}><Plus size={13} /> Referido</button>} bodyClass="">
                {data.referralsOut.length === 0 ? (
                  <Empty title="Sin referidos todavía">Cada referido que firme en los primeros {settings.referral_window_months} meses baja su tarifa: {settings.referral_steps.map((s) => `−$${s}`).join(', ')} (piso ${money(settings.referral_floor)}).</Empty>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {data.referralsOut.map((r) => (
                      <li key={r.id}>
                        <button className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50" onClick={() => quick.edit('referral', r)}>
                          <span className="flex-1 font-medium">{byId('clients', r.referred_client_id)?.company_name}</span>
                          <span className="text-xs text-stone-500">firmó {fdate(r.signed_date)}</span>
                          {r.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === 'proyectos' && (
          <Card title="Proyectos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('project', { client_id: c.id })}><Plus size={13} /> Proyecto</button>} bodyClass="">
            <ProjectsTable rows={data.projects} showClient={false} />
          </Card>
        )}

        {tab === 'finanzas' && (
          <div className="space-y-5">
            {data.charges.length > 0 && (
              <Card title="Mensualidades (90 días atrás y adelante)" bodyClass="">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {data.charges.map((ch) => (
                      <tr key={ch.period + ch.sub.id}>
                        <td className="td tnum">{fdate(ch.date)}</td>
                        <td className="td text-stone-600">{byId('products', ch.sub.product_id)?.name} · periodo {ch.period}</td>
                        <td className="td tnum text-right">{money(ch.amount)}</td>
                        <td className="td text-right">
                          {ch.invoice ? <Badge tone="green">Facturada {ch.invoice.folio ?? ''}</Badge> : (
                            <button className="btn-secondary btn-sm" onClick={() => quick.open('invoice', { client_id: c.id, subscription_id: ch.sub.id, period: ch.period, issue_date: ch.date > todayISO() ? ch.date : todayISO(), due_date: addDays(ch.date, 7), concept: `${byId('products', ch.sub.product_id)?.name} · mensualidad ${ch.period}`, subtotal: ch.amount, tax: Math.round(ch.amount * settings.iva_rate * 100) / 100, total: Math.round(ch.amount * (1 + settings.iva_rate) * 100) / 100 })}>Registrar CFDI</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <Card title="Facturas" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('invoice', { client_id: c.id })}><Plus size={13} /> Factura</button>} bodyClass="">
              <InvoicesTable rows={data.invoices} showClient={false} />
            </Card>
            <Card title="Pagos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('payment', { client_id: c.id })}><Plus size={13} /> Pago</button>} bodyClass="">
              <PaymentsTable rows={data.payments} showClient={false} />
            </Card>
          </div>
        )}

        {tab === 'soporte' && (
          <Card title="Tickets" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('ticket', { client_id: c.id })}><Plus size={13} /> Ticket</button>} bodyClass="">
            <TicketsTable rows={data.tickets} showClient={false} />
          </Card>
        )}

        {tab === 'documentos' && (
          <Card title="Documentos" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('document', { client_id: c.id })}><Plus size={13} /> Documento</button>} bodyClass="">
            <DocumentsTable rows={data.documents} showClient={false} />
          </Card>
        )}
      </div>
    </>
  )
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' }) {
  return (
    <div className="card px-4 py-2.5">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`tnum text-lg font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-brand-800'}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  )
}

function Timeline({ items, dot }: { items: { id: string; date: string; kind: string; text: string; user?: string | null; tone: 'brand' | 'green' | 'blue' | 'violet' }[]; dot: Record<string, string> }) {
  const { byId } = useData()
  if (!items.length) return <Empty title="Sin actividad registrada" />
  return (
    <ol className="relative ml-1 space-y-4 border-l border-stone-200 pl-5">
      {items.map((i) => (
        <li key={i.id + i.kind} className="relative">
          <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${dot[i.tone]}`} />
          <div className="text-xs text-stone-500">
            {fdatetime(i.date)} · <span className="font-medium text-stone-600">{i.kind}</span>
            {i.user && <> · {byId('profiles', i.user)?.full_name.split(' (')[0]}</>}
          </div>
          <div className="whitespace-pre-wrap text-sm text-stone-800">{i.text}</div>
        </li>
      ))}
    </ol>
  )
}
