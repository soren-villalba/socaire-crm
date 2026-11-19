import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTable } from '../lib/store'
import { PageHeader, Segmented, Card } from '../components/ui'
import { TicketsTable } from '../components/tables'
import { useQuick } from '../components/QuickCreate'
import { usePersist } from '../lib/usePersist'

export default function Support() {
  const tickets = useTable('tickets')
  const quick = useQuick()
  const [params, setParams] = useSearchParams()
  const [f, setF] = usePersist<'abiertos' | 'todos'>('soporte.filtro', 'abiertos')

  useEffect(() => {
    const id = params.get('t')
    const t = id && tickets.find((x) => x.id === id)
    if (t) {
      quick.edit('ticket', t)
      setParams({}, { replace: true })
    }
  }, [params, tickets, quick, setParams])

  const rows = useMemo(() => {
    const rank = { alta: 0, media: 1, baja: 2 }
    return tickets.filter((t) => f === 'todos' || (t.status !== 'resuelto' && t.status !== 'cerrado')).sort((a, b) => rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at))
  }, [tickets, f])

  return (
    <>
      <PageHeader
        title="Soporte"
        subtitle="Bandeja de incidencias, dudas y solicitudes. Canal único por cliente; bitácora para la revisión mensual."
        actions={<button className="btn-primary" onClick={() => quick.open('ticket')}><Plus size={16} /> Nuevo ticket</button>}
      />
      <div className="mb-3">
        <Segmented value={f} onChange={setF} options={[{ value: 'abiertos', label: 'Abiertos' }, { value: 'todos', label: 'Todos' }]} />
      </div>
      <Card bodyClass="">
        <TicketsTable rows={rows} />
      </Card>
    </>
  )
}
