// Cronograma (Gantt sencillo) de fases VELERO por proyecto.
import { Link } from 'react-router-dom'
import { useData } from '../lib/store'
import { Empty } from './ui'
import { addDays, addMonths, diffDays, fdate, monthLabel, todayISO } from '../lib/format'
import type { Project, ProjectPhase } from '../lib/types'

const COLOR: Record<ProjectPhase['status'], string> = {
  hecho: 'bg-emerald-500',
  en_curso: 'bg-brand-600',
  pendiente: 'bg-brand-200',
  bloqueado: 'bg-red-400',
}

export function ProjectTimeline({ projects, showProjectName = true }: { projects: Project[]; showProjectName?: boolean }) {
  const { db } = useData()
  const today = todayISO()
  const rows = projects.map((p) => ({
    p,
    phases: db.project_phases.filter((x) => x.project_id === p.id && !x.deleted_at).sort((a, b) => a.sort - b.sort),
  }))
  const dates = rows.flatMap((r) => r.phases.flatMap((x) => [x.start_date, x.due_date, x.done_date])).filter((d): d is string => !!d)
  if (!dates.length) return <Empty title="Sin fechas en las fases">Pon fecha de inicio y fecha límite a las fases VELERO para ver el cronograma.</Empty>
  const min = [...dates, today].sort()[0]
  const max = [...dates, today].sort().at(-1)!
  const start = `${min.slice(0, 7)}-01`
  const end = addDays(addMonths(`${max.slice(0, 7)}-01`, 1), -1)
  const span = Math.max(1, diffDays(end, start) + 1)
  const pos = (d: string) => (Math.max(0, Math.min(span, diffDays(d, start))) / span) * 100
  const months: string[] = []
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="flex border-b border-stone-200 bg-stone-50/60 text-[11px] text-stone-500">
          <div className="w-56 shrink-0 px-4 py-2 font-medium uppercase tracking-wide">Fase / hito</div>
          <div className="relative flex-1">
            {months.map((m) => (
              <span key={m} className="absolute top-0 border-l border-stone-200 px-1 py-2" style={{ left: `${pos(m)}%` }}>{monthLabel(m.slice(0, 7))}</span>
            ))}
          </div>
        </div>
        {rows.map(({ p, phases }) => (
          <div key={p.id} className="border-b border-stone-100 last:border-0">
            {showProjectName && (
              <div className="bg-stone-50/40 px-4 py-1.5 text-sm font-medium"><Link className="link" to={`/proyectos/${p.id}`}>{p.name}</Link></div>
            )}
            {phases.map((ph) => {
              const s = ph.start_date ?? ph.due_date
              const e = ph.done_date ?? ph.due_date ?? ph.start_date
              const late = ph.status !== 'hecho' && ph.due_date && ph.due_date < today
              return (
                <div key={ph.id} className="flex items-center text-sm">
                  <div className="w-56 shrink-0 truncate px-4 py-1.5 text-stone-700" title={`${ph.name} · ${ph.milestone} ${ph.milestone_name}`}>
                    <span className="mr-1.5 font-serif font-semibold text-brand-600">{ph.letter}</span>{ph.name}
                  </div>
                  <div className="relative h-7 flex-1">
                    {months.map((m) => <span key={m} className="absolute inset-y-0 border-l border-stone-100" style={{ left: `${pos(m)}%` }} />)}
                    {s && e && (
                      <div
                        className={`absolute top-1.5 h-4 rounded ${COLOR[ph.status]} ${late ? 'ring-2 ring-red-500' : ''}`}
                        style={{ left: `${pos(s)}%`, width: `max(6px, ${pos(addDays(e, 1)) - pos(s)}%)` }}
                        title={`${ph.milestone} ${ph.milestone_name}: ${fdate(s)} → ${fdate(e)}${late ? ' · retrasado' : ''}`}
                      />
                    )}
                    <span className="absolute inset-y-0 w-px bg-red-500/70" style={{ left: `${pos(today)}%` }} title="Hoy" />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div className="flex flex-wrap gap-4 px-4 py-2 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Hecho</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> En curso</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Pendiente</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Bloqueado</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm ring-2 ring-red-500" /> Retrasado</span>
          <span className="flex items-center gap-1"><span className="h-3 w-px bg-red-500" /> Hoy</span>
        </div>
      </div>
    </div>
  )
}
