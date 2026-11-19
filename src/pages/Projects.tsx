import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useTable } from '../lib/store'
import { PageHeader, Segmented } from '../components/ui'
import { ProjectsTable } from '../components/tables'
import { useQuick } from '../components/QuickCreate'
import { usePersist } from '../lib/usePersist'
import { ProjectTimeline } from '../components/Timeline'

export default function Projects() {
  const projects = useTable('projects')
  const quick = useQuick()
  const [f, setF] = usePersist<'activos' | 'todos'>('proyectos.filtro', 'activos')
  const [view, setView] = usePersist<'lista' | 'cronograma'>('proyectos.vista', 'lista')
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
      <div className="mb-3 flex flex-wrap gap-2">
        <Segmented value={f} onChange={setF} options={[{ value: 'activos', label: 'Activos' }, { value: 'todos', label: 'Todos' }]} />
        <Segmented value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'cronograma', label: 'Cronograma' }]} />
      </div>
      <div className="card overflow-hidden">
        {view === 'lista' ? <ProjectsTable rows={rows} /> : <ProjectTimeline projects={rows} />}
      </div>
    </>
  )
}
