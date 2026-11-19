import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Building2, Target, FolderKanban, CheckSquare, FileText, User, FileSpreadsheet, Plus, LifeBuoy, UserPlus } from 'lucide-react'
import { useData } from '../lib/store'
import { useQuick, type Kind } from './QuickCreate'
import { normalize } from '../lib/format'

interface Item {
  id: string
  group: string
  label: string
  sub?: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useData()
  const quick = useQuick()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      navigate(to)
      onClose()
    }
    const mk = (kind: Kind) => () => {
      onClose()
      quick.open(kind)
    }
    const cname = (id?: string | null) => db.clients.find((c) => c.id === id)?.company_name ?? ''
    const actions: Item[] = [
      { id: 'a-task', group: 'Acciones rápidas', label: 'Nueva tarea', icon: <Plus size={15} />, run: mk('task') },
      { id: 'a-int', group: 'Acciones rápidas', label: 'Registrar interacción', icon: <Plus size={15} />, run: mk('interaction') },
      { id: 'a-opp', group: 'Acciones rápidas', label: 'Nueva oportunidad', icon: <Plus size={15} />, run: mk('opportunity') },
      { id: 'a-lead', group: 'Acciones rápidas', label: 'Nuevo prospecto', icon: <UserPlus size={15} />, run: mk('lead') },
      { id: 'a-cli', group: 'Acciones rápidas', label: 'Nuevo cliente', icon: <Plus size={15} />, run: mk('client') },
      { id: 'a-pay', group: 'Acciones rápidas', label: 'Registrar pago', icon: <Plus size={15} />, run: mk('payment') },
      { id: 'a-time', group: 'Acciones rápidas', label: 'Registrar horas', icon: <Plus size={15} />, run: mk('time') },
      { id: 'a-tk', group: 'Acciones rápidas', label: 'Nuevo ticket de soporte', icon: <Plus size={15} />, run: mk('ticket') },
    ]
    const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at)
    const records: Item[] = [
      ...live(db.clients).map((c) => ({ id: c.id, group: 'Clientes', label: c.company_name, sub: [c.industry, c.status].filter(Boolean).join(' · '), icon: <Building2 size={15} />, run: go(`/clientes/${c.id}`) })),
      ...live(db.contacts).map((c) => ({ id: c.id, group: 'Contactos', label: c.name, sub: `${cname(c.client_id)} ${c.phone ?? ''}`, icon: <User size={15} />, run: go(`/clientes/${c.client_id}?tab=contactos`) })),
      ...live(db.leads).map((l) => ({ id: l.id, group: 'Prospectos', label: l.name, sub: l.company ?? '', icon: <UserPlus size={15} />, run: go(`/prospectos?l=${l.id}`) })),
      ...live(db.opportunities).map((o) => ({ id: o.id, group: 'Oportunidades', label: o.title, sub: cname(o.client_id), icon: <Target size={15} />, run: go(`/oportunidades?o=${o.id}`) })),
      ...live(db.quotes).map((x) => ({ id: x.id, group: 'Cotizaciones', label: `${x.folio} v${x.version}`, sub: cname(x.client_id), icon: <FileSpreadsheet size={15} />, run: go(`/cotizaciones/${x.id}`) })),
      ...live(db.projects).map((p) => ({ id: p.id, group: 'Proyectos', label: p.name, sub: cname(p.client_id), icon: <FolderKanban size={15} />, run: go(`/proyectos/${p.id}`) })),
      ...live(db.tasks).filter((t) => t.status !== 'hecha').map((t) => ({ id: t.id, group: 'Tareas', label: t.title, sub: cname(t.client_id), icon: <CheckSquare size={15} />, run: go(`/tareas?t=${t.id}`) })),
      ...live(db.tickets).map((t) => ({ id: t.id, group: 'Soporte', label: t.title, sub: cname(t.client_id), icon: <LifeBuoy size={15} />, run: go(`/soporte?t=${t.id}`) })),
      ...live(db.documents).map((d) => ({ id: d.id, group: 'Documentos', label: d.name, sub: cname(d.client_id), icon: <FileText size={15} />, run: go(`/documentos?d=${d.id}`) })),
    ]
    const nq = normalize(q.trim())
    if (!nq) return [...actions, ...records.filter((r) => r.group === 'Clientes')]
    const match = (i: Item) => normalize(`${i.label} ${i.sub ?? ''}`).includes(nq)
    return [...records.filter(match).slice(0, 40), ...actions.filter(match)]
  }, [db, q, navigate, onClose, quick])

  useEffect(() => setSel(0), [q])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[sel]?.run()
    } else if (e.key === 'Escape') onClose()
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-stone-900/25" onClick={onClose} />
      <div role="dialog" aria-label="Buscar" className="relative w-[620px] max-w-[95vw] overflow-hidden rounded-xl bg-white shadow-pop">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4">
          <Search size={16} className="text-stone-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Busca clientes, contactos, oportunidades, proyectos, tareas… o escribe una acción" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" />
          <kbd className="rounded border border-stone-200 px-1.5 text-[10px] text-stone-400">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-stone-500">Sin resultados para “{q}”.</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <li key={it.group + it.id}>
                {header && <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{header}</div>}
                <button onMouseEnter={() => setSel(i)} onClick={it.run} className={`flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-sm ${i === sel ? 'bg-brand-50 text-brand-800' : 'text-stone-700'}`}>
                  <span className="text-stone-400">{it.icon}</span>
                  <span className="truncate">{it.label}</span>
                  {it.sub && <span className="ml-auto truncate pl-3 text-xs text-stone-400">{it.sub}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
