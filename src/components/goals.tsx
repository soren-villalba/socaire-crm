// Metas a 12 meses: tarjeta del tablero y editor en Configuración.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useData } from '../lib/store'
import { Card, Progress } from './ui'
import { GOAL_METRICS, DEFAULT_GOALS, type Goal, type GoalMetric } from '../lib/constants'
import { fdate, money, todayISO } from '../lib/format'
import { goalValue } from '../lib/metrics'

const fmt = (g: Goal, v: number) => (g.metric === 'mrr' ? money(v) : v.toLocaleString('es-MX'))

export function GoalsCard({ className = '' }: { className?: string }) {
  const { db, settings, goals, saveGoals, can } = useData()
  const today = todayISO()
  const editable = can('finance.manage')
  const done = goals.filter((g) => goalValue(db, settings, g) >= g.target).length
  return (
    <Card title={`Metas a 12 meses · ${done} de ${goals.length} cumplidas`} className={className}>
      {goals.length === 0 ? (
        <p className="text-sm text-stone-500">Sin metas. Agrégalas en Configuración → Metas.</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {goals.map((g) => {
            const v = goalValue(db, settings, g)
            const pct = g.target > 0 ? Math.min(100, (v / g.target) * 100) : 0
            const ok = v >= g.target
            const late = !ok && g.due && g.due < today
            return (
              <li key={g.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {g.metric === 'manual' && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={!!g.done}
                        disabled={!editable}
                        aria-label={`Marcar cumplida: ${g.name}`}
                        onChange={(e) => saveGoals(goals.map((x) => (x.id === g.id ? { ...x, done: e.target.checked } : x)))}
                      />
                    )}
                    <span className={`truncate ${ok ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{g.name}</span>
                  </span>
                  <span className={`tnum shrink-0 text-xs ${late ? 'text-red-600' : 'text-stone-500'}`}>
                    {g.metric === 'manual' ? (ok ? 'Cumplida' : 'Pendiente') : `${fmt(g, v)} / ${fmt(g, g.target)}`}
                    {g.due && ` · ${fdate(g.due)}`}
                  </span>
                </div>
                <div className="mt-1"><Progress pct={pct} tone={ok ? 'green' : late ? 'red' : 'brand'} /></div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function GoalsEditor() {
  const { goals, saveGoals, can } = useData()
  const [items, setItems] = useState<Goal[]>(goals)
  const [saved, setSaved] = useState(false)
  const editable = can('finance.manage')
  const set = (i: number, patch: Partial<Goal>) => { setItems(items.map((g, j) => (j === i ? { ...g, ...patch } : g))); setSaved(false) }
  return (
    <Card title="Metas a 12 meses">
      <p className="mb-3 text-xs text-stone-500">Las metas con métrica se calculan solas con los datos del CRM. Las manuales se marcan en el tablero al cumplirlas.</p>
      <div className="space-y-2">
        {items.map((g, i) => (
          <div key={g.id} className="grid grid-cols-12 items-center gap-2">
            <input className="input col-span-5" value={g.name} onChange={(e) => set(i, { name: e.target.value })} disabled={!editable} aria-label="Meta" />
            <select className="input col-span-3" value={g.metric} onChange={(e) => set(i, { metric: e.target.value as GoalMetric })} disabled={!editable} aria-label="Métrica">
              {GOAL_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input className="input tnum col-span-1" type="number" min={0} value={g.target} onChange={(e) => set(i, { target: Number(e.target.value) || 0 })} disabled={!editable || g.metric === 'manual'} aria-label="Objetivo" />
            <input className="input col-span-2" type="date" value={g.due ?? ''} onChange={(e) => set(i, { due: e.target.value || undefined })} disabled={!editable} aria-label="Fecha" />
            <button className="btn-ghost col-span-1 justify-center text-stone-500 hover:text-red-600" onClick={() => { setItems(items.filter((_, j) => j !== i)); setSaved(false) }} disabled={!editable} aria-label="Quitar meta"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {editable && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setItems([...items, { id: `g${Date.now()}`, name: '', metric: 'manual', target: 1 }])}><Plus size={14} /> Meta</button>
          <button className="btn-primary" onClick={async () => { await saveGoals(items.filter((g) => g.name.trim()).map((g) => (g.metric === 'manual' ? { ...g, target: 1 } : g))); setSaved(true) }}>Guardar metas</button>
          <button className="btn-ghost" onClick={() => setItems(DEFAULT_GOALS)}>Restaurar las del plan</button>
          {saved && <span className="self-center text-sm text-emerald-700">Guardadas</span>}
        </div>
      )}
    </Card>
  )
}
