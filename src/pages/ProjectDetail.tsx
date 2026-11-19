import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Clock, CheckCircle2, Circle, AlertOctagon, Loader, MoreHorizontal } from 'lucide-react'
import { useData } from '../lib/store'
import { Card, KV, StatusBadge, Tabs, Empty, Badge, Progress, Menu, MenuItem } from '../components/ui'
import { ClientLink, DueDate, UserChip } from '../components/links'
import { useQuick, createVeleroPhases } from '../components/QuickCreate'
import { DriveFolderButton } from '../components/drive'
import { TaskList, DocumentsTable } from '../components/tables'
import { CHANGE_STATUS, PHASE_STATUS, PROJECT_STATUS, PRIORITY } from '../lib/constants'
import { fdate, money, todayISO } from '../lib/format'
import { projectCost, projectPhases, projectProgress } from '../lib/metrics'
import type { PhaseStatus, ProjectPhase } from '../lib/types'

type TabKey = 'plan' | 'tareas' | 'cambios' | 'horas' | 'documentos'

export default function ProjectDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { db, byId, update, insert, remove, settings, me } = useData()
  const quick = useQuick()
  const p = byId('projects', id)
  const tab = (params.get('tab') as TabKey) ?? 'plan'
  const setTab = (t: TabKey) => setParams(t === 'plan' ? {} : { tab: t }, { replace: true })

  const data = useMemo(() => {
    if (!p) return null
    const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at)
    return {
      phases: projectPhases(db, p),
      tasks: live(db.tasks).filter((t) => t.related_type === 'project' && t.related_id === p.id).sort((a, b) => Number(a.status === 'hecha') - Number(b.status === 'hecha') || (a.due_date ?? '9').localeCompare(b.due_date ?? '9')),
      changes: live(db.change_requests).filter((c) => c.project_id === p.id).sort((a, b) => b.requested_date.localeCompare(a.requested_date)),
      time: live(db.time_entries).filter((t) => t.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date)),
      docs: live(db.documents).filter((d) => d.project_id === p.id),
      prog: projectProgress(db, p),
      cost: projectCost(db, p, settings),
    }
  }, [db, p, settings])

  if (!p || !data) return <div className="text-stone-500">Proyecto no encontrado. <Link to="/proyectos" className="link">Volver</Link></div>

  const sub = db.subscriptions.find((s) => s.client_id === p.client_id && s.quote_id && s.quote_id === p.quote_id && !s.deleted_at)
  const approvedChanges = data.changes.filter((c) => c.status === 'aprobado' || c.status === 'hecho').reduce((a, c) => a + (c.amount ?? 0), 0)
  const hoursByPhase = (ph: ProjectPhase) => data.time.filter((t) => t.phase_id === ph.id).reduce((a, t) => a + t.hours, 0)
  const hoursByUser = Object.entries(
    data.time.reduce<Record<string, number>>((acc, t) => {
      acc[t.user_id] = (acc[t.user_id] ?? 0) + t.hours
      return acc
    }, {}),
  )

  const setPhase = (ph: ProjectPhase, status: PhaseStatus) => {
    const patch: Partial<ProjectPhase> = { status }
    if (status === 'hecho') patch.done_date = ph.done_date ?? todayISO()
    else patch.done_date = null
    void update('project_phases', ph.id, patch, { silent: true })
    if (status === 'hecho') {
      void insert('interactions', { client_id: p.client_id, project_id: p.id, kind: 'nota', summary: `Hito ${ph.milestone} cumplido: ${ph.milestone_name}.`, occurred_at: new Date().toISOString(), user_id: me?.id }, { silent: true })
      // Al cumplir H5 (go-live), la suscripción ligada pasa a activa
      if (ph.milestone === 'H5' && sub && sub.status === 'pendiente') void update('subscriptions', sub.id, { status: 'activa', start_date: sub.start_date ?? todayISO() })
      const next = data.phases.find((x) => x.sort > ph.sort && x.status === 'pendiente')
      if (next) void update('project_phases', next.id, { status: 'en_curso' }, { silent: true })
    }
  }

  const PhaseIcon = ({ s }: { s: PhaseStatus }) =>
    s === 'hecho' ? <CheckCircle2 size={20} className="text-emerald-600" /> : s === 'en_curso' ? <Loader size={20} className="text-brand-600" /> : s === 'bloqueado' ? <AlertOctagon size={20} className="text-red-500" /> : <Circle size={20} className="text-stone-300" />

  return (
    <>
      <div className="mb-1">
        <Link to="/proyectos" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"><ArrowLeft size={13} /> Proyectos</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h1">{p.name}</h1>
            <StatusBadge map={PROJECT_STATUS} value={p.status} />
            <StatusBadge map={PRIORITY} value={p.priority} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-stone-500">
            <ClientLink id={p.client_id} />
            <span>Responsable: <UserChip id={p.manager_id} /></span>
            <span>Go-live: <b className="font-medium text-stone-700">{fdate(p.go_live_date, { weekday: true })}</b></span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => quick.open('time', { project_id: p.id, client_id: p.client_id, phase_id: data.prog.current?.id })}><Clock size={15} /> Registrar horas</button>
          <button className="btn-secondary" onClick={() => quick.open('change', { project_id: p.id, client_id: p.client_id })}><Plus size={15} /> Cambio de alcance</button>
          <DriveFolderButton url={p.drive_url ?? byId('clients', p.client_id)?.drive_url} className="btn-secondary" label="Drive" />
          <button className="btn-secondary" onClick={() => quick.edit('project', p)}><Pencil size={15} /> Editar</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card col-span-2 px-4 py-3">
          <div className="flex justify-between text-xs text-stone-500"><span>Avance VELERO</span><span className="tnum">{data.prog.done} de {data.prog.total} hitos</span></div>
          <div className="mt-2"><Progress pct={data.prog.pct} tone={data.prog.late.length ? 'red' : 'brand'} /></div>
          <div className="mt-1.5 text-xs text-stone-500">{data.prog.current ? <>Ahora: <b className="font-medium text-stone-700">{data.prog.current.milestone} · {data.prog.current.milestone_name}</b></> : 'Todos los hitos cumplidos'}</div>
        </div>
        <Mini label="Horas reales / estimadas" value={`${data.prog.hours} / ${p.estimated_hours ?? '—'} h`} tone={p.estimated_hours && data.prog.hours > p.estimated_hours ? 'red' : undefined} />
        <Mini label="Costo interno" value={money(data.cost)} sub={p.budget ? `Margen ${money(p.budget + approvedChanges - data.cost)}` : 'Horas × costo por hora'} />
        <Mini label="Cambios aprobados" value={money(approvedChanges)} sub={`${data.changes.filter((c) => ['registrado', 'estimado', 'cotizado'].includes(c.status)).length} sin aprobar`} />
      </div>

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'plan', label: 'Plan VELERO' },
          { key: 'tareas', label: 'Tareas', count: data.tasks.filter((t) => t.status !== 'hecha').length },
          { key: 'cambios', label: 'Cambios de alcance', count: data.changes.length },
          { key: 'horas', label: 'Horas', count: data.time.length },
          { key: 'documentos', label: 'Documentos', count: data.docs.length },
        ]}
      />

      <div className="mt-4">
        {tab === 'plan' && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Fases e hitos" className="xl:col-span-2" bodyClass="" actions={data.phases.length === 0 && <button className="btn-secondary btn-sm" onClick={() => createVeleroPhases(p, insert, me?.id)}>Crear fases VELERO</button>}>
              {data.phases.length === 0 ? <Empty title="Sin fases" /> : (
                <ol className="divide-y divide-stone-100">
                  {data.phases.map((ph) => {
                    const late = ph.status !== 'hecho' && ph.due_date && ph.due_date < todayISO()
                    const hrs = hoursByPhase(ph)
                    return (
                      <li key={ph.id} className={`flex items-start gap-3 px-4 py-3 ${ph.status === 'en_curso' ? 'bg-brand-50/50' : ''}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 font-serif text-lg font-semibold text-white">{ph.letter}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-stone-800">{ph.name}</span>
                            <Badge tone="brand">{ph.milestone}</Badge>
                            <span className="text-sm text-stone-600">{ph.milestone_name}</span>
                            {late && <Badge tone="red">Retrasado</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
                            <span>{fdate(ph.start_date)} → <DueDate date={ph.due_date} done={ph.status === 'hecho'} /></span>
                            {ph.done_date && <span className="text-emerald-700">Hecho el {fdate(ph.done_date)}</span>}
                            <span className="flex items-center gap-1"><UserChip id={ph.owner_id} /></span>
                            <span className="tnum">{hrs} / {ph.estimated_hours ?? '—'} h</span>
                          </div>
                          {ph.notes && <div className="mt-1 text-xs text-stone-500">{ph.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <PhaseIcon s={ph.status} />
                          <Menu trigger={<button className="btn-ghost px-1" aria-label="Cambiar estado"><MoreHorizontal size={16} /></button>}>
                            {(close) => (
                              <>
                                {(Object.keys(PHASE_STATUS) as PhaseStatus[]).map((s) => (
                                  <MenuItem key={s} onClick={() => { setPhase(ph, s); close() }}>{PHASE_STATUS[s].label}</MenuItem>
                                ))}
                                <MenuItem onClick={() => { quick.edit('phase', ph); close() }}>Editar fechas y notas</MenuItem>
                              </>
                            )}
                          </Menu>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
            <div className="space-y-5">
              <Card title="Datos del proyecto">
                <dl>
                  <KV label="Tipo">{{ implementacion: 'Implementación de producto', desarrollo: 'Desarrollo a la medida', diagnostico: 'Diagnóstico', soporte: 'Soporte / mejora' }[p.project_type]}</KV>
                  <KV label="Inicio">{fdate(p.start_date)}</KV>
                  <KV label="Salida (H5)">{fdate(p.go_live_date)}</KV>
                  <KV label="Fin estimado">{fdate(p.estimated_end_date)}</KV>
                  <KV label="Monto">{p.budget ? money(p.budget) : '—'}</KV>
                  {p.quote_id && <KV label="Cotización"><Link className="link" to={`/cotizaciones/${p.quote_id}`}>{byId('quotes', p.quote_id)?.folio}</Link></KV>}
                  {sub && <KV label="Suscripción">{sub.status === 'pendiente' ? 'Se activa al marcar H5' : 'Activa'}</KV>}
                </dl>
              </Card>
              {p.freeze_window && (
                <Card title="Ventana de congelamiento">
                  <p className="text-sm text-stone-700">{p.freeze_window}</p>
                </Card>
              )}
              {(p.notes || p.description) && (
                <Card title="Alcance y notas">
                  <p className="whitespace-pre-wrap text-sm text-stone-700">{[p.description, p.notes].filter(Boolean).join('\n\n')}</p>
                </Card>
              )}
              <Card title="Reglas fijas (VELERO)">
                <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                  <li>Nada se construye ni se activa sin H1 por escrito.</li>
                  <li>Todo cambio fuera de alcance pasa por control de cambios.</li>
                  <li>Cada hito se confirma al cliente por su canal.</li>
                  <li>En H6: encuesta, caso de éxito y referidos.</li>
                </ul>
              </Card>
            </div>
          </div>
        )}

        {tab === 'tareas' && (
          <Card title="Tareas del proyecto" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('task', { client_id: p.client_id, related_type: 'project', related_id: p.id })}><Plus size={13} /> Tarea</button>} bodyClass="">
            <TaskList rows={data.tasks} showClient={false} />
          </Card>
        )}

        {tab === 'cambios' && (
          <Card title="Control de cambios (SOP 6): registrar → estimar → cotizar → aprobación por escrito → ejecutar" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('change', { project_id: p.id, client_id: p.client_id })}><Plus size={13} /> Cambio</button>} bodyClass="">
            {data.changes.length === 0 ? <Empty title="Sin cambios de alcance">Si el cliente pide algo fuera del plan, regístralo aquí para estimarlo y cobrarlo.</Empty> : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60">
                  <tr><th className="th">Fecha</th><th className="th">Cambio</th><th className="th text-right">Horas</th><th className="th text-right">Monto</th><th className="th">Estado</th><th className="th">Aprobación</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.changes.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-stone-50" onClick={() => quick.edit('change', c)}>
                      <td className="td tnum">{fdate(c.requested_date)}</td>
                      <td className="td"><div className="font-medium text-stone-800">{c.title}</div>{c.description && <div className="text-xs text-stone-500">{c.description}</div>}</td>
                      <td className="td tnum text-right">{c.estimated_hours ?? '—'}</td>
                      <td className="td tnum text-right">{money(c.amount)}</td>
                      <td className="td"><StatusBadge map={CHANGE_STATUS} value={c.status} /></td>
                      <td className="td text-xs text-stone-600">{c.approved_date ? `${fdate(c.approved_date)} · ${c.approval_evidence ?? ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {tab === 'horas' && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Registro de horas" className="xl:col-span-2" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('time', { project_id: p.id, client_id: p.client_id, phase_id: data.prog.current?.id })}><Plus size={13} /> Horas</button>} bodyClass="">
              {data.time.length === 0 ? <Empty title="Sin horas registradas">Registra las horas reales por fase (tuyas y de tu papá) para calibrar la estimación de ~25 h por cliente.</Empty> : (
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Fecha</th><th className="th">Quién</th><th className="th">Fase</th><th className="th">Actividad</th><th className="th text-right">Horas</th><th className="w-8"></th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.time.map((t) => (
                      <tr key={t.id} className="hover:bg-stone-50">
                        <td className="td tnum">{fdate(t.date)}</td>
                        <td className="td"><UserChip id={t.user_id} /></td>
                        <td className="td text-stone-600">
                          <select className="rounded border-0 bg-transparent p-0 text-sm focus:ring-0" value={t.phase_id ?? ''} onChange={(e) => update('time_entries', t.id, { phase_id: e.target.value || null }, { silent: true })}>
                            <option value="">—</option>
                            {data.phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.letter} · {ph.name} ({ph.milestone})</option>)}
                          </select>
                        </td>
                        <td className="td cursor-pointer text-stone-700" onClick={() => quick.edit('time', t)}>{t.activity}</td>
                        <td className="td tnum text-right font-medium">{t.hours}</td>
                        <td className="td"><button className="text-xs text-stone-300 hover:text-red-500" onClick={() => remove('time_entries', t.id, 'Registro')}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Plan vs. real">
              <table className="w-full text-sm">
                <thead><tr><th className="th pl-0">Fase</th><th className="th text-right">Plan</th><th className="th pr-0 text-right">Real</th></tr></thead>
                <tbody>
                  {data.phases.map((ph) => {
                    const real = hoursByPhase(ph)
                    return (
                      <tr key={ph.id}>
                        <td className="py-1 text-stone-700">{ph.letter} · {ph.milestone}</td>
                        <td className="tnum py-1 text-right text-stone-500">{ph.estimated_hours ?? '—'}</td>
                        <td className={`tnum py-1 text-right ${ph.estimated_hours && real > ph.estimated_hours ? 'font-medium text-red-600' : ''}`}>{real}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-stone-200 font-semibold"><td className="py-1">Total</td><td className="tnum py-1 text-right">{data.phases.reduce((a, x) => a + (x.estimated_hours ?? 0), 0)}</td><td className="tnum py-1 text-right">{data.prog.hours}</td></tr>
                </tbody>
              </table>
              <div className="mt-4 space-y-1 text-sm">
                {hoursByUser.map(([uid, h]) => (
                  <div key={uid} className="flex justify-between"><UserChip id={uid} /><span className="tnum">{h} h</span></div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'documentos' && (
          <Card title="Documentos" actions={<div className="flex gap-2"><DriveFolderButton url={p.drive_url ?? byId('clients', p.client_id)?.drive_url} label={p.drive_url ? 'Carpeta en Drive' : 'Carpeta del cliente'} /><button className="btn-secondary btn-sm" onClick={() => quick.open('document', { project_id: p.id, client_id: p.client_id })}><Plus size={13} /> Documento</button></div>} bodyClass="">
            <DocumentsTable rows={data.docs} showClient={false} />
          </Card>
        )}
      </div>
    </>
  )
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`tnum text-lg font-semibold ${tone === 'red' ? 'text-red-600' : 'text-brand-800'}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  )
}
