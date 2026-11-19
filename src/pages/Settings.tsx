import { useState } from 'react'
import { Plus, Download, Upload, RotateCcw } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { PageHeader, Tabs, Card, Badge, Confirm, Empty } from '../components/ui'
import { useQuick } from '../components/QuickCreate'
import { useToast } from '../components/Toast'
import { ROLES, DEFAULT_SETTINGS, type Settings } from '../lib/constants'
import { fdatetime, money, todayISO } from '../lib/format'
import { LocalBackend, importToSupabase, supabase } from '../lib/backend'
import { TABLES, type DB } from '../lib/types'

type TabKey = 'usuarios' | 'catalogo' | 'parametros' | 'datos' | 'auditoria'

const TABLE_LABELS: Record<string, string> = {
  profiles: 'Usuarios', clients: 'Clientes', contacts: 'Contactos', branches: 'Sucursales', leads: 'Prospectos', opportunities: 'Oportunidades', products: 'Productos',
  quotes: 'Cotizaciones', quote_items: 'Conceptos de cotización', subscriptions: 'Suscripciones', referrals: 'Referidos', invoices: 'Facturas', payments: 'Pagos',
  projects: 'Proyectos', project_phases: 'Fases', change_requests: 'Cambios', time_entries: 'Horas', tasks: 'Tareas', interactions: 'Interacciones', tickets: 'Tickets',
  documents: 'Documentos', settings: 'Parámetros',
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('usuarios')
  const { db, backend, settings, insert, update, reload, can, me } = useData()
  const users = useTable('profiles')
  const products = useTable('products')
  const quick = useQuick()
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)
  const [form, setForm] = useState<Settings>(settings)
  const [pending, setPending] = useState<DB | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState('')

  const readBackup = (file: File, then: (db: DB) => void) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as DB
        if (!data.clients || !data.profiles) throw new Error('No parece un respaldo del CRM')
        then(data)
      } catch (e) {
        toast.error((e as Error).message)
      }
    }
    reader.readAsText(file)
  }
  const prepareSupabaseImport = (file: File) =>
    readBackup(file, (data) => {
      const m: Record<string, string> = {}
      for (const p of data.profiles) m[p.id] = users.find((u) => p.email && u.email.toLowerCase() === p.email.toLowerCase())?.id ?? me?.id ?? ''
      setMap(m)
      setPending(data)
    })
  const runSupabaseImport = async () => {
    if (!pending || !supabase) return
    try {
      await importToSupabase(supabase, pending, map, (s) => setProgress(`Subiendo ${s}…`))
      setProgress('')
      setPending(null)
      await reload()
      toast.success('Respaldo subido a Supabase')
    } catch (e) {
      setProgress('')
      toast.error((e as Error).message)
    }
  }

  const saveSettings = async () => {
    const row = db.settings.find((s) => s.key === 'app')
    if (row) await update('settings', row.id, { value: form })
    else await insert('settings', { key: 'app', value: form })
  }

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const exportJSON = () => download(`socaire-crm-respaldo-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json')
  const exportCSV = (table: string) => {
    const rows = (db as unknown as Record<string, Record<string, unknown>[]>)[table].filter((r) => !r.deleted_at)
    if (!rows.length) return toast.error('Esa tabla está vacía')
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const esc = (v: unknown) => {
      let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      // Evita que Excel ejecute fórmulas escritas en un campo de texto (inyección CSV)
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    download(`${table}-${todayISO()}.csv`, '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'text/csv;charset=utf-8')
  }
  const importJSON = (file: File) =>
    readBackup(file, async (data) => {
      ;(backend as LocalBackend).replace(data)
      await reload()
      toast.success('Respaldo importado')
    })

  const numField = (key: keyof Settings, label: string, hint?: string, step = 1) => (
    <div>
      <label className="label">{label}</label>
      <input className="input tnum" type="number" step={step} value={form[key] as number} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  )

  return (
    <>
      <PageHeader title="Configuración" subtitle={`Conectado en ${backend.mode === 'local' ? 'modo local (navegador)' : 'Supabase'}.`} />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'usuarios', label: 'Usuarios y roles' },
          { key: 'catalogo', label: 'Catálogo de servicios' },
          { key: 'parametros', label: 'Parámetros' },
          { key: 'datos', label: 'Datos y respaldos' },
          { key: 'auditoria', label: 'Registro de cambios' },
        ]}
      />
      <div className="mt-4">
        {tab === 'usuarios' && (
          <Card title="Usuarios internos" actions={can('users.manage') && <button className="btn-secondary btn-sm" onClick={() => quick.open('profile')}><Plus size={13} /> Usuario</button>} bodyClass="">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Nombre</th><th className="th">Correo</th><th className="th">Roles</th><th className="th text-right">Costo/hora</th><th className="th">Estado</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {users.map((u) => (
                  <tr key={u.id} className={`${can('users.manage') ? 'cursor-pointer hover:bg-stone-50' : ''}`} onClick={() => can('users.manage') && quick.edit('profile', u)}>
                    <td className="td font-medium">{u.full_name}{u.id === me?.id && <span className="ml-1 text-xs text-stone-400">(tú)</span>}</td>
                    <td className="td text-stone-600">{u.email || '—'}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'brand' : 'neutral'}>{ROLES.find((x) => x.value === r)?.label}</Badge>)}</div></td>
                    <td className="td tnum text-right">{money(u.hourly_cost)}</td>
                    <td className="td">{u.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">
              Permisos: <b>Administrador</b> todo · <b>Dirección</b> finanzas y eliminar registros · <b>Comercial, Desarrollo, Soporte</b> leen todo y editan su operación. En Supabase los permisos se validan también en la base de datos.
            </div>
          </Card>
        )}

        {tab === 'catalogo' && (
          <Card title="Productos y servicios" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('product')}><Plus size={13} /> Producto</button>} bodyClass="">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Nombre</th><th className="th">Tipo</th><th className="th">Cobro</th><th className="th text-right">Lista</th><th className="th text-right">Introductorio</th><th className="th text-right">Alta</th><th className="th">Estado</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {products.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-stone-50" onClick={() => quick.edit('product', p)}>
                    <td className="td"><div className="font-medium">{p.name}</div>{p.description && <div className="max-w-md truncate text-xs text-stone-500">{p.description}</div>}</td>
                    <td className="td capitalize text-stone-600">{p.kind}</td>
                    <td className="td text-stone-600">{{ mensual: 'Mensual', unico: 'Pago único', por_hora: 'Por hora' }[p.billing]} / {p.unit}</td>
                    <td className="td tnum text-right">{p.list_price ? money(p.list_price) : 'A cotizar'}</td>
                    <td className="td tnum text-right">{p.intro_price ? money(p.intro_price) : '—'}</td>
                    <td className="td tnum text-right">{p.setup_fee ? money(p.setup_fee) : '—'}</td>
                    <td className="td">{p.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'parametros' && (
          <Card title="Parámetros del negocio">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {numField('iva_rate', 'Tasa de IVA', '0.16 = 16%', 0.01)}
              {numField('weekly_capacity_hours', 'Capacidad semanal (h)', 'Meta de horas por semana')}
              {numField('default_hourly_cost', 'Costo por hora por defecto', 'Para margen por proyecto')}
              {numField('followup_stale_days', 'Días sin actividad para alertar')}
              {numField('quote_expiry_warning_days', 'Avisar cotización por vencer (días)')}
              {numField('referral_floor', 'Piso de tarifa con referidos')}
              {numField('referral_window_months', 'Ventana de referidos (meses)')}
              <div>
                <label className="label">Escalones de descuento por referido</label>
                <input className="input tnum" value={form.referral_steps.join(', ')} onChange={(e) => setForm({ ...form, referral_steps: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)) })} />
                <p className="mt-1 text-xs text-stone-400">Separados por coma: 100, 50, 50</p>
              </div>
              <div>
                <label className="label">Recordatorios de cobro (días)</label>
                <input className="input tnum" value={form.invoice_reminder_days.join(', ')} onChange={(e) => setForm({ ...form, invoice_reminder_days: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)) })} />
              </div>
              {numField('fixed_cost_per_package', 'Costo fijo por paquete (mensual)', 'Netlify + Supabase + dominio')}
              {numField('branches_per_package', 'Sucursales por paquete')}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary" onClick={saveSettings} disabled={!can('finance.manage')}>Guardar parámetros</button>
              <button className="btn-ghost" onClick={() => setForm(DEFAULT_SETTINGS)}>Restaurar valores originales</button>
            </div>
          </Card>
        )}

        {tab === 'datos' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Respaldo completo">
              <p className="mb-3 text-sm text-stone-600">Descarga toda la información del CRM en un archivo JSON. {backend.mode === 'local' && 'En modo local, haz respaldos seguido: los datos viven solo en este navegador.'}</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={exportJSON}><Download size={15} /> Descargar respaldo</button>
                {backend.mode === 'local' && (
                  <>
                    <label className="btn-secondary cursor-pointer">
                      <Upload size={15} /> Importar respaldo
                      <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
                    </label>
                    <button className="btn-ghost text-red-600" onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Volver a la carga inicial</button>
                  </>
                )}
              </div>
            </Card>
            {backend.mode === 'supabase' && can('users.manage') && (
              <Card title="Subir respaldo del modo local a Supabase">
                <p className="mb-3 text-sm text-stone-600">Usa el archivo que descargaste en modo local. Se conservan los ids, así que puedes repetirlo sin duplicar.</p>
                {!pending ? (
                  <label className="btn-primary cursor-pointer">
                    <Upload size={15} /> Elegir respaldo JSON
                    <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && prepareSupabaseImport(e.target.files[0])} />
                  </label>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-stone-600">¿A qué usuario real corresponde cada usuario del respaldo?</p>
                    {pending.profiles.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="w-48 truncate">{p.full_name}</span>
                        <select className="input flex-1" value={map[p.id] ?? ''} onChange={(e) => setMap({ ...map, [p.id]: e.target.value })}>
                          <option value="">— Nadie —</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>)}
                        </select>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button className="btn-primary" disabled={!!progress} onClick={runSupabaseImport}>{progress || 'Subir a Supabase'}</button>
                      <button className="btn-secondary" onClick={() => setPending(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </Card>
            )}
            <Card title="Exportar a Excel (CSV)">
              <div className="flex flex-wrap gap-1.5">
                {TABLES.filter((t) => t !== 'settings').map((t) => (
                  <button key={t} className="btn-secondary btn-sm" onClick={() => exportCSV(t)}>{TABLE_LABELS[t]}</button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'auditoria' && (
          <Card title="Registro de cambios" bodyClass="">
            {db.audit_logs.length === 0 ? <Empty title="Sin cambios registrados" /> : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50/60"><tr><th className="th">Fecha</th><th className="th">Usuario</th><th className="th">Acción</th><th className="th">Tabla</th><th className="th">Detalle</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {db.audit_logs.slice(0, 300).map((l) => (
                    <tr key={l.id}>
                      <td className="td tnum whitespace-nowrap text-stone-500">{fdatetime(l.changed_at)}</td>
                      <td className="td">{db.profiles.find((p) => p.id === l.changed_by)?.full_name.split(' (')[0] ?? 'Sistema'}</td>
                      <td className="td">{l.action === 'insert' ? <Badge tone="green">Creó</Badge> : l.action === 'delete' ? <Badge tone="red">Eliminó</Badge> : <Badge>Editó</Badge>}</td>
                      <td className="td text-stone-600">{TABLE_LABELS[l.table_name] ?? l.table_name}</td>
                      <td className="td max-w-md truncate text-stone-700">{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        danger
        title="Volver a la carga inicial"
        text="Se borran los datos de este navegador y se carga de nuevo la información inicial de ejemplo. Descarga un respaldo antes si capturaste algo."
        confirmLabel="Borrar y recargar"
        onConfirm={async () => {
          await (backend as LocalBackend).reset()
          await reload()
          toast.success('Carga inicial restaurada')
        }}
      />
    </>
  )
}
