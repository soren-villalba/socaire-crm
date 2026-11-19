import { Link } from 'react-router-dom'
import { useData } from '../lib/store'
import { Avatar } from './ui'
import { fdate, relDays, todayISO } from '../lib/format'

export function ClientLink({ id }: { id?: string | null }) {
  const { byId } = useData()
  const c = byId('clients', id)
  if (!c) return <span className="text-stone-500">—</span>
  return (
    <Link to={`/clientes/${c.id}`} className="link font-medium" onClick={(e) => e.stopPropagation()}>
      {c.company_name}
    </Link>
  )
}

export function UserChip({ id, showName = true }: { id?: string | null; showName?: boolean }) {
  const { byId } = useData()
  const u = byId('profiles', id)
  if (!u) return <span className="text-stone-500">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar name={u.full_name} size={20} />
      {showName && <span className="truncate text-stone-700">{u.full_name.split(' (')[0]}</span>}
    </span>
  )
}

export function DueDate({ date, done }: { date?: string | null; done?: boolean }) {
  if (!date) return <span className="text-stone-500">—</span>
  const today = todayISO()
  const late = !done && date < today
  const isToday = !done && date === today
  return (
    <span className={`tnum whitespace-nowrap ${late ? 'font-medium text-red-600' : isToday ? 'font-medium text-amber-600' : 'text-stone-700'}`} title={relDays(date)}>
      {fdate(date)}
      {(late || isToday) && <span className="ml-1 text-xs font-normal">({relDays(date)})</span>}
    </span>
  )
}
