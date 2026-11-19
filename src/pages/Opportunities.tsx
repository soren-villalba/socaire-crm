import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trophy, XCircle, FileSpreadsheet, MessageSquarePlus, Pencil, CalendarClock } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Segmented, Badge, Drawer, Modal, KV, StatusBadge, SearchInput, Empty } from '../components/ui'
import { ClientLink, DueDate, UserChip } from '../components/links'
import { useQuick, createVeleroPhases } from '../components/QuickCreate'
import { STAGES, OPEN_STAGES, SERVICE_TYPES, QUOTE_STATUS, INTERACTION_KINDS, stageLabel } from '../lib/constants'
import { addBusinessDays, addMonths, fdate, fdatetime, money, normalize, todayISO } from '../lib/format'
import { lastTouch, oppValue, quoteEffectiveStatus } from '../lib/metrics'
import type { Opportunity, Stage } from '../lib/types'

export default function Opportunities() {
  const opps = useTable('opportunities')
  const { db, update, me } = useData()
  const quick = useQuick()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'kanban' | 'tabla'>(() => (localStorage.getItem('opp-view') as 'kanban' | 'tabla') ?? 'kanban')
  const [owner, setOwner] = useState<'todos' | 'mios'>('todos')
  const [showClosed, setShowClosed] = useState(false)
  const [q, setQ] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)
  const [win, setWin] = useState<Opportunity | null>(null)
  const [lose, setLose] = useState<Opportunity | null>(null)
  const openId = params.get('o')
  const open = openId ? opps.find((o) => o.id === openId) : undefined

  useEffect(() => {
    try {
      localStorage.setItem('opp-view', view)
    } catch {
      /* noop */
    }
  }, [view])

  const cname = (id: string) => db.clients.find((c) => c.id === id)?.company_name ?? ''
  const rows = useMemo(() => {
    const nq = normalize(q)
    return opps
      .filter((o) => owner === 'todos' || o.owner_id === me?.id)
      .filter((o) => !nq || normalize(`${o.title} ${cname(o.client_id)}`).includes(nq))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opps, owner, me?.id, q, db.clients])

  const stages = showClosed ? STAGES : STAGES.filter((s) => OPEN_STAGES.includes(s.key))

  const moveTo = (o: Opportunity, stage: Stage) => {
    if (o.stage === stage) return
    if (stage === 'ganada') return setWin(o)
    if (stage === 'perdida') return setLose(o)
    const st = STAGES.find((s) => s.key === stage)!
    void update('opportunities', o.id, { stage, probability: st.probability, closed_at: null }, { silent: true })
  }

  const setOpen = (id: string | null) => setParams(id ? { o: id } : {}, { replace: true })

  return (
    <>
      <PageHeader
        title="Oportunidades"
        subtitle="Toda oportunidad abierta tiene responsable y próximo seguimiento."
        actions={
          <button className="btn-primary" onClick={() => quick.open('opportunity')}>
            <Plus size={16} /> Nueva oportunidad
          </button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar oportunidad o empresa…" />
        <Segmented value={view} onChange={setView} options={[{ value: 'kanban', label: 'Pipeline' }, { value: 'tabla', label: 'Tabla' }]} />
        <Segmented value={owner} onChange={setOwner} options={[{ value: 'todos', label: 'Todas' }, { value: 'mios', label: 'Mías' }]} />
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" className="accent-brand-600" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Mostrar ganadas y perdidas
        </label>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => {
            const list = rows.filter((o) => o.stage === s.key)
            const total = list.reduce((a, o) => a + oppValue(o), 0)
            return (
              <div
                key={s.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOverStage(s.key)
                }}
                onDragLeave={() => setOverStage(null)}
                onDrop={() => {
                  const o = opps.find((x) => x.id === dragId)
                  setOverStage(null)
                  if (o) moveTo(o, s.key)
                }}
                className={`flex min-w-[185px] flex-1 flex-col rounded-xl border bg-stone-50/70 ${overStage === s.key ? 'border-brand-400 bg-brand-50' : 'border-stone-200'}`}
              >
                <div className="border-b border-stone-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-stone-800">{s.label}</span>
                    <span className="rounded bg-white px-1.5 text-xs text-stone-500 ring-1 ring-stone-200">{list.length}</span>
                  </div>
                  <div className="tnum text-xs text-stone-500">{money(total)} · {s.hint}</div>
                </div>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                  {list.map((o) => {
                    const overdue = o.next_followup_date && o.next_followup_date < todayISO() && OPEN_STAGES.includes(o.stage)
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setOpen(o.id)}
                        className={`cursor-pointer rounded-lg border bg-white p-2.5 shadow-card transition hover:border-brand-200 ${dragId === o.id ? 'opacity-50' : ''} ${overdue ? 'border-red-200' : 'border-stone-200'}`}
                      >
                        <div className="text-xs font-medium text-brand-600">{cname(o.client_id)}</div>
                        <div className="mt-0.5 text-[13px] font-medium leading-snug text-stone-800">{o.title}</div>
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="tnum text-stone-600">{o.estimated_mrr ? `${money(o.estimated_mrr)}/mes` : money(o.estimated_value)}</span>
                          <UserChip id={o.owner_id} showName={false} />
                        </div>
                        {OPEN_STAGES.includes(o.stage) && (
                          <div className="mt-1.5 flex items-center gap-1 border-t border-stone-100 pt-1.5 text-xs">
                            <CalendarClock size={12} className={overdue ? 'text-red-500' : 'text-stone-400'} />
                            {o.next_followup_date ? <DueDate date={o.next_followup_date} /> : <span className="text-amber-600">Sin seguimiento</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {rows.length === 0 ? (
            <Empty title="Sin oportunidades" />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50/60">
                <tr>
                  <th className="th">Oportunidad</th>
                  <th className="th">Empresa</th>
                  <th className="th">Etapa</th>
                  <th className="th text-right">Mensual</th>
                  <th className="th text-right">Único</th>
                  <th className="th text-right">Prob.</th>
                  <th className="th">Seguimiento</th>
                  <th className="th">Siguiente paso</th>
                  <th className="th">Resp.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows
                  .filter((o) => showClosed || OPEN_STAGES.includes(o.stage))
                  .sort((a, b) => STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage))
                  .map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setOpen(o.id)}>
                      <td className="td font-medium text-stone-800">{o.title}</td>
                      <td className="td"><ClientLink id={o.client_id} /></td>
                      <td className="td"><StageBadge stage={o.stage} /></td>
                      <td className="td tnum text-right">{money(o.estimated_mrr)}</td>
                      <td className="td tnum text-right">{money(o.estimated_value)}</td>
                      <td className="td tnum text-right">{o.probability}%</td>
                      <td className="td">{OPEN_STAGES.includes(o.stage) ? <DueDate date={o.next_followup_date} /> : '—'}</td>
                      <td className="td max-w-[240px] truncate text-stone-600">{o.next_step ?? '—'}</td>
                      <td className="td"><UserChip id={o.owner_id} showName={false} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {open && <OppPanel o={open} onClose={() => setOpen(null)} onWin={() => setWin(open)} onLose={() => setLose(open)} onMove={(s) => moveTo(open, s)} />}
      {win && <WinModal o={win} onClose={() => setWin(null)} />}
      {lose && <LoseModal o={lose} onClose={() => setLose(null)} />}
    </>
  )
}

export function StageBadge({ stage }: { stage: Stage }) {
  const tone = stage === 'ganada' ? 'green' : stage === 'perdida' ? 'red' : stage === 'negociacion' || stage === 'propuesta' ? 'brand' : 'blue'
  return <Badge tone={tone}>{stageLabel(stage)}</Badge>
}

function OppPanel({ o, onClose, onWin, onLose, onMove }: { o: Opportunity; onClose: () => void; onWin: () => void; onLose: () => void; onMove: (s: Stage) => void }) {
  const { db, update, byId } = useData()
  const quick = useQuick()
  const navigate = useNavigate()
  const quotes = db.quotes.filter((q) => !q.deleted_at && q.opportunity_id === o.id).sort((a, b) => b.version - a.version)
  const interactions = db.interactions.filter((i) => !i.deleted_at && (i.opportunity_id === o.id || (i.client_id === o.client_id && !i.opportunity_id))).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  const tasks = db.tasks.filter((t) => !t.deleted_at && t.related_type === 'opportunity' && t.related_id === o.id && t.status !== 'hecha')
  const isClosed = o.stage === 'ganada' || o.stage === 'perdida'
  const lead = byId('leads', o.lead_id)
  const product = byId('products', o.product_id)

  const newQuote = async () => {
    navigate(`/cotizaciones/nueva?opp=${o.id}`)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={o.title}
      subtitle={<span className="flex items-center gap-2"><ClientLink id={o.client_id} /> · <StageBadge stage={o.stage} /></span>}
      footer={
        <div className="flex flex-wrap gap-2">
          {!isClosed && (
            <>
              <button className="btn-primary" onClick={onWin}><Trophy size={15} /> Ganada</button>
              <button className="btn-secondary" onClick={onLose}><XCircle size={15} /> Perdida</button>
            </>
          )}
          <button className="btn-secondary" onClick={() => quick.edit('opportunity', o)}><Pencil size={14} /> Editar</button>
          <button className="btn-secondary" onClick={newQuote}><FileSpreadsheet size={14} /> Cotizar</button>
          <button className="btn-secondary" onClick={() => quick.open('interaction', { client_id: o.client_id, opportunity_id: o.id })}><MessageSquarePlus size={14} /> Interacción</button>
        </div>
      }
    >
      {!isClosed && (
        <div className="mb-4 flex flex-wrap gap-1">
          {STAGES.filter((s) => OPEN_STAGES.includes(s.key)).map((s) => (
            <button key={s.key} onClick={() => onMove(s.key)} className={`rounded-md px-2 py-1 text-xs font-medium ${o.stage === s.key ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {!isClosed && (
        <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <div className="text-xs font-medium text-stone-500">Próximo seguimiento</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input type="date" className="input w-40" value={o.next_followup_date ?? ''} onChange={(e) => update('opportunities', o.id, { next_followup_date: e.target.value || null }, { silent: true })} />
            <input className="input flex-1" placeholder="Siguiente paso" defaultValue={o.next_step ?? ''} onBlur={(e) => e.target.value !== (o.next_step ?? '') && update('opportunities', o.id, { next_step: e.target.value }, { silent: true })} />
          </div>
          <div className="mt-2 flex gap-1">
            {[1, 3, 7].map((n) => (
              <button key={n} className="btn-ghost btn-sm" onClick={() => update('opportunities', o.id, { next_followup_date: addBusinessDays(todayISO(), n) }, { silent: true })}>
                +{n} día{n > 1 ? 's' : ''} hábil{n > 1 ? 'es' : ''}
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-stone-400">Último contacto: {fdate(lastTouch(db, o))}</div>
        </div>
      )}

      <dl className="mb-4">
        <KV label="Tipo">{SERVICE_TYPES.find((s) => s.value === o.service_type)?.label}</KV>
        <KV label="Producto">{product?.name}</KV>
        <KV label="Recurrente">{o.estimated_mrr ? `${money(o.estimated_mrr)}/mes` : '—'}</KV>
        <KV label="Pago único">{money(o.estimated_value)}</KV>
        <KV label="Probabilidad">{o.probability}%</KV>
        <KV label="Cierre esperado">{fdate(o.expected_close_date)}</KV>
        <KV label="Responsable"><UserChip id={o.owner_id} /></KV>
        {lead && <KV label="Vino del prospecto">{lead.name} · {fdate(lead.created_at.slice(0, 10))}</KV>}
        {o.closed_at && <KV label="Cerrada el">{fdate(o.closed_at)}</KV>}
        {o.lost_reason && <KV label="Motivo de pérdida">{o.lost_reason}</KV>}
        {o.description && <KV label="Necesidad">{o.description}</KV>}
      </dl>

      <h3 className="h2 mb-2">Cotizaciones</h3>
      {quotes.length === 0 ? (
        <p className="mb-4 text-sm text-stone-500">Sin cotizaciones.</p>
      ) : (
        <ul className="mb-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
          {quotes.map((q) => (
            <li key={q.id}>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => navigate(`/cotizaciones/${q.id}`)}>
                <span className="font-medium">{q.folio}</span>
                <span className="text-stone-400">v{q.version}</span>
                <StatusBadge map={QUOTE_STATUS} value={quoteEffectiveStatus(q)} />
                <span className="ml-auto text-xs text-stone-500">vence {fdate(q.valid_until)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <>
          <h3 className="h2 mb-2">Tareas abiertas</h3>
          <ul className="mb-4 space-y-1 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <button className="link text-left" onClick={() => quick.edit('task', t)}>{t.title}</button>
                <DueDate date={t.due_date} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="h2 mb-2">Historial de negociación</h3>
      {interactions.length === 0 ? (
        <p className="text-sm text-stone-500">Sin interacciones registradas.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-stone-200 pl-4">
          {interactions.map((i) => (
            <li key={i.id} className="text-sm">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-400" />
              <div className="text-xs text-stone-500">{fdatetime(i.occurred_at)} · {INTERACTION_KINDS.find((k) => k.value === i.kind)?.label}</div>
              <div className="text-stone-800">{i.summary}</div>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  )
}

function WinModal({ o, onClose }: { o: Opportunity; onClose: () => void }) {
  const { update, insert, db, byId, me } = useData()
  const navigate = useNavigate()
  const products = db.products.filter((p) => !p.deleted_at && p.active && p.billing === 'mensual')
  const [productId, setProductId] = useState(o.product_id ?? products[0]?.id ?? '')
  const product = byId('products', productId)
  const client = byId('clients', o.client_id)
  const acceptedQuote = db.quotes.filter((q) => q.opportunity_id === o.id && !q.deleted_at).sort((a, b) => b.version - a.version)[0]
  const [createSub, setCreateSub] = useState(o.service_type === 'saas')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(byId('products', o.product_id ?? products[0]?.id)?.intro_price ?? o.estimated_mrr ?? 0)
  const [golive, setGolive] = useState(addBusinessDays(todayISO(), 15))
  const [createProject, setCreateProject] = useState(true)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      const today = todayISO()
      await update('opportunities', o.id, { stage: 'ganada', probability: 100, closed_at: today }, { silent: true })
      if (client && client.status === 'prospecto') await update('clients', client.id, { status: 'activo', relationship_start: client.relationship_start ?? today }, { silent: true })
      if (acceptedQuote && acceptedQuote.status !== 'aceptada') await update('quotes', acceptedQuote.id, { status: 'aceptada', accepted_at: today }, { silent: true })
      if (createSub && productId) {
        if (!o.product_id) await update('opportunities', o.id, { product_id: productId }, { silent: true })
        await insert('subscriptions', { client_id: o.client_id, product_id: productId, quote_id: acceptedQuote?.id ?? null, status: 'pendiente', quantity: qty, list_price: product?.list_price ?? price, unit_price: price, price_floor: 800, apply_referrals: true, start_date: golive, min_term_months: 6, setup_fee: product?.setup_fee ?? 0, setup_fee_waived: true }, { silent: true })
      }
      let projectId: string | null = null
      if (createProject) {
        const p = await insert('projects', { client_id: o.client_id, opportunity_id: o.id, quote_id: acceptedQuote?.id ?? null, name: `${o.service_type === 'saas' ? 'Implementación' : 'Desarrollo'} · ${client?.company_name}`, project_type: o.service_type === 'saas' ? 'implementacion' : 'desarrollo', status: 'en_curso', priority: 'alta', start_date: today, go_live_date: golive, manager_id: me?.id, estimated_hours: o.service_type === 'saas' ? 25 : null, budget: o.estimated_value || null }, { silent: true })
        await createVeleroPhases(p, insert, me?.id)
        projectId = p.id
      }
      await insert('interactions', { client_id: o.client_id, opportunity_id: o.id, kind: 'nota', summary: `Oportunidad ganada: ${o.title}.`, occurred_at: new Date().toISOString(), user_id: me?.id }, { silent: true })
      await insert('tasks', { title: 'Confirmar por escrito alcance, precio, inicio de cobro y permanencia (H1)', kind: 'compromiso', priority: 'alta', status: 'pendiente', assigned_to: me?.id, due_date: addBusinessDays(today, 3), client_id: o.client_id, related_type: projectId ? 'project' : 'client', related_id: projectId ?? o.client_id }, { silent: true })
      await insert('tasks', { title: 'Pedir datos fiscales para el CFDI', kind: 'tarea', priority: 'alta', status: 'pendiente', assigned_to: me?.id, due_date: addBusinessDays(today, 3), client_id: o.client_id, related_type: 'client', related_id: o.client_id }, { silent: true })
      onClose()
      navigate(projectId ? `/proyectos/${projectId}` : `/clientes/${o.client_id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Oportunidad ganada 🎉" width={500}>
      <div className="space-y-3 text-sm">
        <p className="text-stone-600">Se marca como ganada, {client?.status === 'prospecto' ? 'el cliente pasa a Activo, ' : ''}se registra en el historial y se crean las tareas de la fase V (confirmación por escrito y datos fiscales).</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-brand-600" checked={createSub} onChange={(e) => setCreateSub(e.target.checked)} />
          Crear suscripción de
          <select className="input w-auto py-1" value={productId} onChange={(e) => { setProductId(e.target.value); setPrice(byId('products', e.target.value)?.intro_price ?? price) }}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {createSub && (
          <div className="grid grid-cols-3 gap-2 pl-6">
            <div>
              <label className="label">Sucursales</label>
              <input className="input tnum" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Precio por unidad</label>
              <input className="input tnum" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Inicio de cobro</label>
              <input className="input" type="date" value={golive} onChange={(e) => setGolive(e.target.value)} />
            </div>
            <p className="col-span-3 text-xs text-stone-500">Permanencia 6 meses (hasta {fdate(addMonths(golive, 6))}), alta bonificada y referidos activos. Puedes ajustarlo después.</p>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-brand-600" checked={createProject} onChange={(e) => setCreateProject(e.target.checked)} />
          Crear proyecto de entrega con fases VELERO (go-live {fdate(golive)})
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy} onClick={go}>Confirmar</button>
        </div>
      </div>
    </Modal>
  )
}

function LoseModal({ o, onClose }: { o: Opportunity; onClose: () => void }) {
  const { update, insert, me } = useData()
  const [reason, setReason] = useState('')
  const reasons = ['Precio', 'Eligió otra solución', 'Sin presupuesto', 'No era el momento', 'Sin respuesta', 'No encaja con el perfil (ICP)']
  const go = async () => {
    await update('opportunities', o.id, { stage: 'perdida', probability: 0, lost_reason: reason, closed_at: todayISO() })
    await insert('interactions', { client_id: o.client_id, opportunity_id: o.id, kind: 'nota', summary: `Oportunidad perdida: ${reason}`, occurred_at: new Date().toISOString(), user_id: me?.id }, { silent: true })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Marcar como perdida">
      <label className="label">Motivo (obligatorio)</label>
      <div className="mb-2 flex flex-wrap gap-1">
        {reasons.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`rounded-md px-2 py-1 text-xs ${reason === r ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{r}</button>
        ))}
      </div>
      <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Detalle del motivo" />
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-danger" disabled={!reason.trim()} onClick={go}>Marcar perdida</button>
      </div>
    </Modal>
  )
}
