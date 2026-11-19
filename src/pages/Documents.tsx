import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Card, SearchInput } from '../components/ui'
import { DocumentsTable } from '../components/tables'
import { useQuick } from '../components/QuickCreate'
import { DOC_KINDS } from '../lib/constants'
import { normalize } from '../lib/format'

export default function Documents() {
  const docs = useTable('documents')
  const { db } = useData()
  const quick = useQuick()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')

  useEffect(() => {
    const id = params.get('d')
    const d = id && docs.find((x) => x.id === id)
    if (d) {
      quick.edit('document', d)
      setParams({}, { replace: true })
    }
  }, [params, docs, quick, setParams])

  const rows = useMemo(() => {
    const nq = normalize(q)
    return docs
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => !nq || normalize(`${d.name} ${d.location} ${db.clients.find((c) => c.id === d.client_id)?.company_name ?? ''}`).includes(nq))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [docs, q, kind, db.clients])

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Índice de contratos, cotizaciones, propuestas, actas y minutas. Los archivos siguen en la carpeta de socaire; aquí vive su ubicación y estado."
        actions={<button className="btn-primary" onClick={() => quick.open('document')}><Plus size={16} /> Nuevo documento</button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nombre, ruta o cliente…" />
        <select className="input w-52" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos los tipos</option>
          {DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <Card bodyClass="">
        <DocumentsTable rows={rows} />
      </Card>
    </>
  )
}
