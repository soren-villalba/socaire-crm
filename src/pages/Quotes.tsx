import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, StatusBadge, Empty, SearchInput, Segmented, clickRow } from '../components/ui'
import { ClientLink } from '../components/links'
import { QUOTE_STATUS } from '../lib/constants'
import { fdate, money, normalize } from '../lib/format'
import { quoteEffectiveStatus, quoteTotals } from '../lib/metrics'
import { usePersist } from '../lib/usePersist'

export default function Quotes() {
  const quotes = useTable('quotes')
  const { db } = useData()
  const navigate = useNavigate()
  const [q, setQ] = usePersist('cotizaciones.q', '')
  const [filter, setFilter] = usePersist<'vigentes' | 'todas'>('cotizaciones.filtro', 'vigentes')

  const rows = useMemo(() => {
    const nq = normalize(q)
    return quotes
      .filter((x) => filter === 'todas' || x.status !== 'reemplazada')
      .filter((x) => !nq || normalize(`${x.folio} ${db.clients.find((c) => c.id === x.client_id)?.company_name ?? ''} ${x.title ?? ''}`).includes(nq))
      .sort((a, b) => b.folio.localeCompare(a.folio) || b.version - a.version)
  }, [quotes, q, filter, db.clients])

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle="Cada cambio se guarda como nueva versión; las anteriores se conservan."
        actions={
          <button className="btn-primary" onClick={() => navigate('/cotizaciones/nueva')}>
            <Plus size={16} /> Nueva cotización
          </button>
        }
      />
      <div className="mb-3 flex items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar folio o cliente…" />
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'vigentes', label: 'Última versión' }, { value: 'todas', label: 'Todas las versiones' }]} />
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="Sin cotizaciones" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/60">
              <tr>
                <th className="th">Folio</th>
                <th className="th">Cliente</th>
                <th className="th">Concepto</th>
                <th className="th">Emitida</th>
                <th className="th">Vigencia</th>
                <th className="th text-right">Mensual</th>
                <th className="th text-right">Pago único</th>
                <th className="th">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((x) => {
                const t = quoteTotals(db.quote_items.filter((i) => i.quote_id === x.id))
                return (
                  <tr key={x.id} {...clickRow(() => navigate(`/cotizaciones/${x.id}`))}>
                    <td className="td font-medium text-stone-800">
                      {x.folio} <span className="text-xs font-normal text-stone-500">v{x.version}</span>
                    </td>
                    <td className="td"><ClientLink id={x.client_id} /></td>
                    <td className="td max-w-[280px] truncate text-stone-600">{x.title ?? '—'}</td>
                    <td className="td tnum text-stone-600">{fdate(x.issue_date)}</td>
                    <td className="td tnum text-stone-600">{fdate(x.valid_until)}</td>
                    <td className="td tnum text-right">{money(t.monthly)}</td>
                    <td className="td tnum text-right">{money(t.once)}</td>
                    <td className="td"><StatusBadge map={QUOTE_STATUS} value={quoteEffectiveStatus(x)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
