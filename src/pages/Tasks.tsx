import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Segmented, Card, SearchInput } from '../components/ui'
import { TaskList } from '../components/tables'
import { useQuick } from '../components/QuickCreate'
import { addDays, fdate, normalize, parseISO, todayISO, toISO } from '../lib/format'
import type { Task } from '../lib/types'

export default function Tasks() {
  const tasks = useTable('tasks')
  const users = useTable('profiles')
  const { me, db } = useData()
  const quick = useQuick()
  const [params, setParams] = useSearchParams()
  const [who, setWho] = useState<string>(me?.id ?? 'todos')
  const [view, setView] = useState<'lista' | 'semana'>('lista')
  const [q, setQ] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const d = parseISO(todayISO())
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return toISO(d)
  })
  const today = todayISO()

  useEffect(() => {
    const id = params.get('t')
    const t = id && tasks.find((x) => x.id === id)
    if (t) {
      quick.edit('task', t)
      setParams({}, { replace: true })
    }
  }, [params, tasks, quick, setParams])

  const mine = useMemo(() => {
    const nq = normalize(q)
    return tasks
      .filter((t) => who === 'todos' || t.assigned_to === who)
      .filter((t) => !nq || normalize(`${t.title} ${db.clients.find((c) => c.id === t.client_id)?.company_name ?? ''}`).includes(nq))
  }, [tasks, who, q, db.clients])
  const open = mine.filter((t) => t.status !== 'hecha')
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.priority === 'alta' ? -1 : 1)
  const groups = [
    { title: 'Vencidas', rows: open.filter((t) => t.due_date && t.due_date < today).sort(byDue), tone: 'text-red-600' },
    { title: 'Hoy', rows: open.filter((t) => t.due_date === today).sort(byDue), tone: 'text-amber-600' },
    { title: 'Próximos 7 días', rows: open.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDays(today, 7)).sort(byDue), tone: '' },
    { title: 'Más adelante', rows: open.filter((t) => t.due_date && t.due_date > addDays(today, 7)).sort(byDue), tone: '' },
    { title: 'Sin fecha', rows: open.filter((t) => !t.due_date), tone: '' },
    { title: 'Hechas (últimos 14 días)', rows: mine.filter((t) => t.status === 'hecha' && (t.completed_at ?? '') >= addDays(today, -14)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')), tone: 'text-stone-400' },
  ]

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const DN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <>
      <PageHeader
        title="Tareas"
        subtitle="Tareas, reuniones, llamadas y compromisos con clientes."
        actions={<button className="btn-primary" onClick={() => quick.open('task', { assigned_to: who !== 'todos' ? who : me?.id })}><Plus size={16} /> Nueva tarea</button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tarea o cliente…" />
        <Segmented value={who} onChange={setWho} options={[...users.map((u) => ({ value: u.id, label: u.id === me?.id ? 'Mías' : u.full_name.split(' (')[0] })), { value: 'todos', label: 'Todo el equipo' }]} />
        <Segmented value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'semana', label: 'Semana' }]} />
      </div>

      {view === 'lista' ? (
        <div className="space-y-4">
          {groups.filter((g) => g.rows.length).map((g) => (
            <Card key={g.title} title={<span className={g.tone}>{g.title} <span className="font-normal text-stone-400">({g.rows.length})</span></span>} bodyClass="">
              <TaskList rows={g.rows} />
            </Card>
          ))}
          {open.length === 0 && <Card><p className="text-center text-sm text-stone-500">Sin tareas abiertas. 🌿</p></Card>}
        </div>
      ) : (
        <Card
          title={`Semana del ${fdate(weekStart)}`}
          actions={
            <>
              <button className="btn-ghost px-1.5" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
              <button className="btn-ghost btn-sm" onClick={() => { const d = parseISO(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setWeekStart(toISO(d)) }}>Hoy</button>
              <button className="btn-ghost px-1.5" aria-label="Semana siguiente" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
            </>
          }
          bodyClass="p-0"
        >
          <div className="grid grid-cols-7 divide-x divide-stone-100">
            {days.map((d, i) => {
              const list = mine.filter((t) => t.due_date === d).sort((a, b) => (a.due_time ?? '').localeCompare(b.due_time ?? ''))
              return (
                <div key={d} className={`min-h-[360px] ${d === today ? 'bg-brand-50/50' : ''}`}>
                  <div className="flex items-center justify-between border-b border-stone-100 px-2 py-1.5 text-xs">
                    <span className={d === today ? 'font-semibold text-brand-700' : 'text-stone-500'}>{DN[i]} {parseISO(d).getDate()}</span>
                    <button aria-label="Agregar" className="text-stone-300 hover:text-brand-600" onClick={() => quick.open('task', { due_date: d, assigned_to: who !== 'todos' ? who : me?.id })}><Plus size={13} /></button>
                  </div>
                  <div className="space-y-1 p-1.5">
                    {list.map((t) => (
                      <button key={t.id} onClick={() => quick.edit('task', t)} className={`block w-full rounded-md border px-1.5 py-1 text-left text-xs ${t.status === 'hecha' ? 'border-stone-100 text-stone-400 line-through' : t.priority === 'alta' ? 'border-red-200 bg-red-50 text-red-800' : 'border-stone-200 bg-white text-stone-700'}`}>
                        {t.due_time && <span className="mr-1 font-medium">{t.due_time}</span>}
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </>
  )
}
