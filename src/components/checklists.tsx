// Checklists de onboarding (SOP 4) y cierre (SOP 9) por cliente.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { missingTables } from '../lib/backend'
import { Card, Progress } from './ui'
import { useToast } from './Toast'
import { CHECKLIST_TEMPLATES } from '../lib/constants'
import { fdate } from '../lib/format'
import type { ChecklistItem } from '../lib/types'

const TITLES = { onboarding: 'Onboarding (SOP 4: Validar y Entrada de datos)', cierre: 'Cierre y referidos (SOP 9)' }
const HINTS = {
  onboarding: 'Los primeros 3 días después de la aceptación. Sale con H1 (alcance por escrito) y H2 (información completa).',
  cierre: 'Al llegar a H6/H7: encuesta, caso de éxito, referido y paso a suscripción.',
}

export function Checklist({ clientId, projectId, list }: { clientId: string; projectId?: string | null; list: 'onboarding' | 'cierre' }) {
  const { insert, update, me } = useData()
  const toast = useToast()
  const all = useTable('checklist_items')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const items = all.filter((i) => i.client_id === clientId && i.list === list).sort((a, b) => a.sort - b.sort)
  const done = items.filter((i) => i.done).length
  const missing = missingTables.has('checklist_items')

  const create = async () => {
    setBusy(true)
    try {
      let n = 0
      for (const t of CHECKLIST_TEMPLATES[list]) await insert('checklist_items', { client_id: clientId, project_id: projectId ?? null, list, sort: ++n * 10, phase: t.phase, label: t.label, done: false }, { silent: true })
      toast.success('Checklist creado')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (i: ChecklistItem) => update('checklist_items', i.id, { done: !i.done, done_at: i.done ? null : new Date().toISOString() }, { silent: true })
  const addItem = async () => {
    if (!adding.trim()) return
    await insert('checklist_items', { client_id: clientId, project_id: projectId ?? null, list, sort: (items.at(-1)?.sort ?? 0) + 10, phase: items.at(-1)?.phase ?? null, label: adding.trim(), done: false }, { silent: true })
    setAdding('')
  }

  return (
    <Card title={`${TITLES[list]}${items.length ? ` · ${done}/${items.length}` : ''}`}>
      {missing ? (
        <p className="text-sm text-stone-500">Para usar checklists, corre el script 0006 en Supabase.</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-stone-500">{HINTS[list]}</p>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={create}>Crear checklist ({CHECKLIST_TEMPLATES[list].length} pasos)</button>
        </div>
      ) : (
        <>
          <Progress pct={(done / items.length) * 100} tone={done === items.length ? 'green' : 'brand'} />
          <ul className="mt-3 space-y-1.5">
            {items.map((i, idx) => (
              <li key={i.id}>
                {(idx === 0 || items[idx - 1].phase !== i.phase) && i.phase && list === 'onboarding' && (
                  <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600">{i.phase === 'V' ? 'V · Validar' : i.phase === 'E' ? 'E · Entrada de datos' : i.phase}</div>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={i.done} onChange={() => toggle(i)} />
                  <span className={i.done ? 'text-stone-500 line-through' : 'text-stone-800'}>{i.label}</span>
                  {i.done && i.done_at && <span className="ml-auto shrink-0 text-xs text-stone-500">{fdate(i.done_at.slice(0, 10))}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className="input h-8 text-sm" placeholder="Agregar un paso" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} aria-label="Nuevo paso" />
            <button className="btn-secondary btn-sm" onClick={addItem} disabled={!adding.trim() || !me} aria-label="Agregar paso"><Plus size={14} /></button>
          </div>
        </>
      )}
    </Card>
  )
}
