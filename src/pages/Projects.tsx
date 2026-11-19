import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTable } from '../lib/store'
import { PageHeader, Segmented } from '../components/ui'
import { ProjectsTable } from '../components/tables'
import { useQuick } from '../components/QuickCreate'

export default function Projects() {
  const projects = useTable('projects')
  const quick = useQuick()
  const [f, setF] = useState<'activos' | 'todos'>('activos')
  const rows = useMemo(
    () => projects.filter((p) => f === 'todos' || p.status === 'en_curso' || p.status === 'planeacion' || p.status === 'en_pausa').sort((a, b) => (a.go_live_date ?? '9').localeCompare(b.go_live_date ?? '9')),
    [projects, f],
  )
  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Implementaciones y desarrollos con el método VELERO: Validar · Entrada de datos · Levantar · Ensayar · Rumbo a producción · Observar."
        actions={<button className="btn-primary" onClick={() => quick.open('project')}><Plus size={16} /> Nuevo proyecto</button>}
      />
      <div className="mb-3">
        <Segmented value={f} onChange={setF} options={[{ value: 'activos', label: 'Activos' }, { value: 'todos', label: 'Todos' }]} />
      </div>
      <div className="card overflow-hidden">
        <ProjectsTable rows={rows} />
      </div>
    </>
  )
}
