import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRightCircle, MoreHorizontal, Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, StatusBadge, Empty, Modal, Menu, MenuItem, SearchInput, Segmented, clickRow } from '../components/ui'
import { UserChip } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { LEAD_STATUS, SOURCES, SERVICE_TYPES } from '../lib/constants'
import { addBusinessDays, fdate, normalize, todayISO } from '../lib/format'
import type { Lead, ServiceType } from '../lib/types'
import { usePersist } from '../lib/usePersist'

export default function Leads() {
  const leads = useTable('leads')
  const quick = useQuick()
  const { remove } = useData()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = usePersist('prospectos.q', '')
  const [filter, setFilter] = usePersist<'abiertos' | 'convertido' | 'descartado' | 'todos'>('prospectos.filtro', 'abiertos')
  const [convert, setConvert] = useState<Lead | null>(null)

  useEffect(() => {
    const id = params.get('l')
    const l = id && leads.find((x) => x.id === id)
    if (l) {
      quick.edit('lead', l)
      setParams({}, { replace: true })
    }
  }, [params, leads, quick, setParams])

  const rows = useMemo(() => {
    const nq = normalize(q)
    return leads
      .filter((l) => (filter === 'todos' ? true : filter === 'abiertos' ? !['convertido', 'descartado'].includes(l.status) : l.status === filter))
      .filter((l) => !nq || normalize(`${l.name} ${l.company ?? ''} ${l.phone ?? ''} ${l.email ?? ''}`).includes(nq))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [leads, q, filter])

  return (
    <>
      <PageHeader
        title="Prospectos"
        subtitle="Contactos que aún no son oportunidad. Califícalos y conviértelos sin perder su historial."
        actions={
          <button className="btn-primary" onClick={() => quick.open('lead')}>
            <Plus size={16} /> Nuevo prospecto
          </button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nombre, negocio, teléfono…" />
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'abiertos', label: 'Abiertos' }, { value: 'convertido', label: 'Convertidos' }, { value: 'descartado', label: 'Descartados' }, { value: 'todos', label: 'Todos' }]} />
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty title={leads.length ? 'Sin resultados' : 'Aún no hay prospectos'} action={<button className="btn-secondary btn-sm" onClick={() => quick.open('lead')}>Registrar prospecto</button>}>
            Registra aquí a quien llega por referido, Instagram o contacto directo. Toma menos de 30 segundos.
          </Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/60">
              <tr>
                <th className="th">Nombre</th>
                <th className="th">Negocio</th>
                <th className="th">Contacto</th>
                <th className="th">Origen</th>
                <th className="th">Estado</th>
                <th className="th">Responsable</th>
                <th className="th">Alta</th>
                <th className="th w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((l) => (
                <tr key={l.id} {...clickRow(() => quick.edit('lead', l))}>
                  <td className="td font-medium text-stone-800">{l.name}</td>
                  <td className="td text-stone-600">{l.company ?? '—'}</td>
                  <td className="td text-stone-600">{[l.phone, l.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="td text-stone-600">{SOURCES.find((s) => s.value === l.source)?.label ?? '—'}</td>
                  <td className="td"><StatusBadge map={LEAD_STATUS} value={l.status} /></td>
                  <td className="td"><UserChip id={l.owner_id} /></td>
                  <td className="td tnum text-stone-500">{fdate(l.created_at.slice(0, 10))}</td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {l.status !== 'convertido' && l.status !== 'descartado' && (
                        <button className="btn-secondary btn-sm" onClick={() => setConvert(l)}>
                          <ArrowRightCircle size={13} /> Convertir
                        </button>
                      )}
                      <Menu trigger={<button className="btn-ghost px-1" aria-label="Más"><MoreHorizontal size={16} /></button>}>
                        {(close) => (
                          <>
                            <MenuItem onClick={() => { quick.open('interaction', { lead_id: l.id }); close() }}>Registrar interacción</MenuItem>
                            <MenuItem danger onClick={() => { void remove('leads', l.id, 'Prospecto'); close() }}>Eliminar</MenuItem>
                          </>
                        )}
                      </Menu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {convert && <ConvertLead lead={convert} onClose={() => setConvert(null)} />}
    </>
  )
}

function ConvertLead({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { insert, update, me } = useData()
  const clients = useTable('clients')
  const products = useTable('products')
  const navigate = useNavigate()
  const suggestion = clients.find((c) => lead.company && normalize(c.company_name) === normalize(lead.company))
  const [mode, setMode] = useState<'new' | 'existing'>(suggestion ? 'existing' : 'new')
  const [clientId, setClientId] = useState(suggestion?.id ?? '')
  const [company, setCompany] = useState(lead.company || lead.name)
  const [title, setTitle] = useState('')
  const [service, setService] = useState<ServiceType>('saas')
  const [mrr, setMrr] = useState(1000)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      let cid = clientId
      if (mode === 'new') {
        const c = await insert('clients', { company_name: company, status: 'prospecto', importance: 'media', acquisition_source: lead.source, account_manager_id: lead.owner_id ?? me?.id, phone: lead.phone, email: lead.email, notes: lead.notes, relationship_start: todayISO() }, { silent: true })
        cid = c.id
      }
      await insert('contacts', { client_id: cid, name: lead.name, phone: lead.phone, email: lead.email, is_primary: mode === 'new', is_approver: false }, { silent: true })
      const o = await insert('opportunities', { client_id: cid, lead_id: lead.id, title: title || `Oportunidad · ${company}`, service_type: service, product_id: service === 'saas' ? products.find((p) => p.kind === 'saas' && p.active)?.id ?? null : null, stage: 'calificacion', probability: 20, estimated_mrr: service === 'saas' ? mrr : 0, estimated_value: service === 'saas' ? 0 : mrr, owner_id: lead.owner_id ?? me?.id, next_followup_date: addBusinessDays(todayISO(), 3), next_step: 'Llamada de calificación (preguntas ICP)', description: lead.notes }, { silent: true })
      await update('leads', lead.id, { status: 'convertido', converted_client_id: cid, converted_opportunity_id: o.id, converted_at: new Date().toISOString() })
      onClose()
      navigate(`/oportunidades?o=${o.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Convertir a ${lead.name}`} width={480}>
      <div className="space-y-3 text-sm">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'new', label: 'Empresa nueva' }, { value: 'existing', label: 'Cliente existente' }]} />
        {mode === 'new' ? (
          <div>
            <label className="label">Nombre de la empresa</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="label">Asociar a</label>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Selecciona…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
            {suggestion && <p className="mt-1 text-xs text-stone-500">Ya existe “{suggestion.company_name}”: se asocia para no duplicar la empresa.</p>}
          </div>
        )}
        <div>
          <label className="label">Oportunidad</label>
          <input className="input" placeholder="Socaire Pedidos · 1 sucursal" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
              {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{service === 'saas' ? 'Mensual estimado' : 'Monto estimado'}</label>
            <input className="input tnum" type="number" value={mrr} onChange={(e) => setMrr(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-stone-500">Se crea el contacto, la oportunidad en “Calificación” con seguimiento en 3 días hábiles, y el prospecto queda marcado como convertido.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || (mode === 'existing' ? !clientId : !company)} onClick={go}>Convertir</button>
        </div>
      </div>
    </Modal>
  )
}
