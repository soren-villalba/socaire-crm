import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Segmented, Card, Stat } from '../components/ui'
import { TicketsTable } from '../components/tables'
import { TicketDrawer } from '../components/support'
import { useQuick } from '../components/QuickCreate'
import { usePersist } from '../lib/usePersist'
import { addDays, todayISO } from '../lib/format'
import { fmtHours, ticketSla } from '../lib/sla'
import type { Ticket } from '../lib/types'

export default function Support() {
  const { settings } = useData()
  const tickets = useTable('tickets')
  const quick = useQuick()
  const [params, setParams] = useSearchParams()
  const [f, setF] = usePersist<'abiertos' | 'todos'>('soporte.filtro', 'abiertos')
  const [open, setOpen] = useState<Ticket | null>(null)

  useEffect(() => {
    const id = params.get('t')
    const t = id && tickets.find((x) => x.id === id)
    if (t) {
      setOpen(t)
      setParams({}, { replace: true })
    }
  }, [params, tickets, setParams])

  const rows = useMemo(() => {
    const rank = { alta: 0, media: 1, baja: 2 }
    return tickets.filter((t) => f === 'todos' || (t.status !== 'resuelto' && t.status !== 'cerrado')).sort((a, b) => rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at))
  }, [tickets, f])

  const stats = useMemo(() => {
    const since = addDays(todayISO(), -30)
    const openT = tickets.filter((t) => t.status !== 'resuelto' && t.status !== 'cerrado')
    const slas = openT.map((t) => ticketSla(t, settings))
    const recent = tickets.filter((t) => t.created_at.slice(0, 10) >= since).map((t) => ticketSla(t, settings))
    const measured = recent.filter((x) => x.state === 'cumplido' || x.state === 'incumplido' || x.state === 'vencido')
    const ok = measured.filter((x) => x.state === 'cumplido').length
    const resp = recent.filter((x) => x.responseHours != null).map((x) => x.responseHours!)
    return {
      open: openT.length,
      late: slas.filter((x) => x.state === 'vencido').length,
      soon: slas.filter((x) => x.state === 'por_vencer').length,
      compliance: measured.length ? Math.round((ok / measured.length) * 100) : null,
      measured: measured.length,
      avg: resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null,
      resolved: tickets.filter((t) => t.resolved_at && t.resolved_at.slice(0, 10) >= since).length,
    }
  }, [tickets, settings])

  return (
    <>
      <PageHeader
        title="Soporte"
        subtitle={`Canal único por cliente. SLA de primera respuesta en horas hábiles: alta ${settings.sla_alta_hours} h · media ${settings.sla_media_hours} h · baja ${settings.sla_baja_hours} h.`}
        actions={<button className="btn-primary" onClick={() => quick.open('ticket')}><Plus size={16} /> Nuevo ticket</button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Abiertos" value={stats.open} sub={stats.late || stats.soon ? `${stats.late} vencidos · ${stats.soon} por vencer` : 'Todo en tiempo'} tone={stats.late ? 'red' : stats.soon ? 'amber' : undefined} />
        <Stat label="Cumplimiento de SLA (30 días)" value={stats.compliance == null ? '—' : `${stats.compliance}%`} sub={stats.measured ? `${stats.measured} tickets medidos` : 'Aún sin tickets medidos'} tone={stats.compliance == null ? undefined : stats.compliance >= 90 ? 'green' : stats.compliance >= 75 ? 'amber' : 'red'} />
        <Stat label="Primera respuesta promedio" value={stats.avg == null ? '—' : fmtHours(stats.avg)} sub="Horas hábiles, últimos 30 días" />
        <Stat label="Resueltos (30 días)" value={stats.resolved} />
      </div>
      <div className="mb-3">
        <Segmented value={f} onChange={setF} options={[{ value: 'abiertos', label: 'Abiertos' }, { value: 'todos', label: 'Todos' }]} />
      </div>
      <Card bodyClass="">
        <TicketsTable rows={rows} onOpen={setOpen} />
      </Card>
      <TicketDrawer key={open?.id ?? 'none'} ticket={open} onClose={() => setOpen(null)} />
    </>
  )
}
