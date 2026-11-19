import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, StatusBadge, Empty, SearchInput, Segmented, clickRow } from '../components/ui'
import { UserChip } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { CLIENT_STATUS } from '../lib/constants'
import { money, normalize } from '../lib/format'
import { invoiceBalance, isOpen, subMonthly } from '../lib/metrics'
import { usePersist } from '../lib/usePersist'

export default function Clients() {
  const clients = useTable('clients')
  const { db, settings } = useData()
  const quick = useQuick()
  const navigate = useNavigate()
  const [q, setQ] = usePersist('clientes.q', '')
  const [status, setStatus] = usePersist<string>('clientes.status', 'todos')

  const rows = useMemo(() => {
    const nq = normalize(q)
    const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at)
    return clients
      .filter((c) => status === 'todos' || c.status === status)
      .filter((c) => !nq || normalize(`${c.company_name} ${c.industry ?? ''} ${c.city ?? ''} ${c.tax_id ?? ''}`).includes(nq))
      .map((c) => {
        const subs = live(db.subscriptions).filter((s) => s.client_id === c.id && s.status !== 'cancelada')
        const mrr = subs.filter((s) => s.status === 'activa').reduce((a, s) => a + subMonthly(db, s, settings), 0)
        const pend = subs.filter((s) => s.status === 'pendiente').reduce((a, s) => a + subMonthly(db, s, settings), 0)
        const units = subs.reduce((a, s) => a + s.quantity, 0)
        const totalBranches = Math.max(c.total_branches ?? 0, live(db.branches).filter((b) => b.client_id === c.id).length)
        const openOpps = live(db.opportunities).filter((o) => o.client_id === c.id && isOpen(o)).length
        const projects = live(db.projects).filter((p) => p.client_id === c.id && (p.status === 'en_curso' || p.status === 'planeacion')).length
        const balance = live(db.invoices).filter((i) => i.client_id === c.id && i.status === 'emitida').reduce((a, i) => a + invoiceBalance(db, i), 0)
        return { c, mrr, pend, units, totalBranches, openOpps, projects, balance }
      })
      .sort((a, b) => b.mrr + b.pend - (a.mrr + a.pend) || a.c.company_name.localeCompare(b.c.company_name))
  }, [clients, q, status, db, settings])

  const counts = (s: string) => clients.filter((c) => c.status === s).length

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Empresas con las que tenemos relación: prospectos, activos y anteriores."
        actions={
          <button className="btn-primary" onClick={() => quick.open('client')}>
            <Plus size={16} /> Nuevo cliente
          </button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nombre, giro, ciudad, RFC…" />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[{ value: 'todos', label: `Todos (${clients.length})` }, ...Object.entries(CLIENT_STATUS).filter(([k]) => counts(k)).map(([k, v]) => ({ value: k, label: `${v.label} (${counts(k)})` }))]}
        />
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="Sin clientes" action={<button className="btn-secondary btn-sm" onClick={() => quick.open('client')}>Nuevo cliente</button>} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/60">
              <tr>
                <th className="th">Empresa</th>
                <th className="th">Giro</th>
                <th className="th">Estado</th>
                <th className="th text-right">MRR</th>
                <th className="th text-right">Sucursales con servicio</th>
                <th className="th text-right">Oport. abiertas</th>
                <th className="th text-right">Proyectos</th>
                <th className="th text-right">Saldo</th>
                <th className="th">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(({ c, mrr, pend, units, totalBranches, openOpps, projects, balance }) => (
                <tr key={c.id} {...clickRow(() => navigate(`/clientes/${c.id}`))}>
                  <td className="td font-medium text-stone-800">{c.company_name}</td>
                  <td className="td text-stone-600">{c.industry ?? '—'}</td>
                  <td className="td"><StatusBadge map={CLIENT_STATUS} value={c.status} /></td>
                  <td className="td tnum text-right">
                    {money(mrr)}
                    {pend > 0 && <div className="text-xs text-amber-600">+{money(pend)} por arrancar</div>}
                  </td>
                  <td className="td tnum text-right">{units || totalBranches ? `${units} de ${totalBranches || units}` : '—'}</td>
                  <td className="td tnum text-right">{openOpps || '—'}</td>
                  <td className="td tnum text-right">{projects || '—'}</td>
                  <td className={`td tnum text-right ${balance > 0 ? 'font-medium text-amber-700' : 'text-stone-500'}`}>{balance > 0 ? money(balance) : '—'}</td>
                  <td className="td"><UserChip id={c.account_manager_id} showName={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
