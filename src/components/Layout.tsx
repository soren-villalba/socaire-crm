import logo from '../logo.svg'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, UserPlus, Target, FileSpreadsheet, Building2, FolderKanban, CheckSquare, LifeBuoy, Wallet, FileText,
  Settings, Search, Plus, PanelLeftClose, PanelLeftOpen, LogOut, ChevronDown, RefreshCw, BarChart3, CalendarCheck,
} from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { CommandPalette } from './CommandPalette'
import { useQuick } from './QuickCreate'
import { Avatar, Menu, MenuItem } from './ui'
import { buildAlerts, taskOverdue } from '../lib/metrics'
import { missingTables, supabase } from '../lib/backend'

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-4">
      <img src={logo} alt="" className="h-7 w-7" />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-serif text-[22px] font-semibold text-brand-800">socaire</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-brand-600">CRM interno</div>
        </div>
      )}
    </div>
  )
}

// Posición de scroll por pantalla: al regresar a una lista, queda donde la dejaste.
const scrollPos = new Map<string, number>()

function SyncStatus() {
  const { lastSync, syncing, refresh } = useData()
  const [, setNow] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setNow((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const mins = lastSync ? Math.floor((Date.now() - lastSync) / 60_000) : null
  const label = syncing ? 'Actualizando…' : mins == null ? '' : mins < 1 ? 'Al día' : `Actualizado hace ${mins} min`
  return (
    <button
      onClick={() => void refresh()}
      title="Traer los cambios más recientes (se actualiza solo cada minuto y al volver a esta pestaña)"
      className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700 md:flex"
    >
      <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
      {label}
    </button>
  )
}

export function Layout() {
  const { me, setMe, backend, db, settings, error } = useData()
  const users = useTable('profiles')
  const tasks = useTable('tasks')
  const tickets = useTable('tickets')
  const quick = useQuick()
  const location = useLocation()
  const [palette, setPalette] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = mainRef.current
    if (el) el.scrollTop = scrollPos.get(location.pathname) ?? 0
  }, [location.pathname])
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('socaire-crm-collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('socaire-crm-collapsed', c ? '0' : '1')
      } catch {
        /* noop */
      }
      return !c
    })
  }

  const alerts = useMemo(() => buildAlerts(db, settings), [db, settings])
  const myOverdue = tasks.filter((t) => taskOverdue(t) && t.assigned_to === me?.id).length
  const openTickets = tickets.filter((t) => t.status !== 'resuelto' && t.status !== 'cerrado').length

  const groups: { title?: string; items: { to: string; label: string; icon: React.ReactNode; badge?: number; end?: boolean }[] }[] = [
    { items: [{ to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} />, badge: alerts.filter((a) => a.level === 'alta').length, end: true }] },
    {
      title: 'Comercial',
      items: [
        { to: '/prospectos', label: 'Prospectos', icon: <UserPlus size={17} /> },
        { to: '/oportunidades', label: 'Oportunidades', icon: <Target size={17} /> },
        { to: '/cotizaciones', label: 'Cotizaciones', icon: <FileSpreadsheet size={17} /> },
        { to: '/clientes', label: 'Clientes', icon: <Building2 size={17} /> },
      ],
    },
    {
      title: 'Operación',
      items: [
        { to: '/proyectos', label: 'Proyectos', icon: <FolderKanban size={17} /> },
        { to: '/tareas', label: 'Tareas', icon: <CheckSquare size={17} />, badge: myOverdue },
        { to: '/soporte', label: 'Soporte', icon: <LifeBuoy size={17} />, badge: openTickets },
        { to: '/revision', label: 'Revisión semanal', icon: <CalendarCheck size={17} /> },
      ],
    },
    {
      title: 'Administración',
      items: [
        { to: '/finanzas', label: 'Finanzas', icon: <Wallet size={17} /> },
        { to: '/reportes', label: 'Reportes', icon: <BarChart3 size={17} /> },
        { to: '/documentos', label: 'Documentos', icon: <FileText size={17} /> },
      ],
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <aside className={`flex shrink-0 flex-col border-r border-stone-200 bg-stone-50/60 transition-all ${collapsed ? 'w-[60px]' : 'w-[220px]'}`}>
        <Logo collapsed={collapsed} />
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.title && !collapsed && <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-stone-500">{g.title}</div>}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.end}
                      title={collapsed ? it.label : undefined}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition ${isActive ? 'bg-white text-brand-800 shadow-card ring-1 ring-stone-200' : 'text-stone-600 hover:bg-white hover:text-stone-900'}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={isActive ? 'text-brand-600' : 'text-stone-500 group-hover:text-stone-600'}>{it.icon}</span>
                          {!collapsed && <span className="flex-1">{it.label}</span>}
                          {!!it.badge && <span className={`tnum rounded-full px-1.5 text-[11px] font-semibold ${collapsed ? 'absolute ml-5 -mt-4' : ''} ${it.to === '/' || it.to === '/tareas' ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-600'}`}>{it.badge}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-2">
          <NavLink to="/configuracion" title="Configuración" className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium ${isActive ? 'bg-white text-brand-800 shadow-card ring-1 ring-stone-200' : 'text-stone-600 hover:bg-white'}`}>
            <Settings size={17} className="text-stone-500" />
            {!collapsed && 'Configuración'}
          </NavLink>
          <Menu
            trigger={
              <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white">
                <Avatar name={me?.full_name} size={26} />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-stone-800">{me?.full_name ?? 'Sin usuario'}</span>
                      <span className="block truncate text-[11px] text-stone-500">{backend.mode === 'local' ? 'Modo local' : 'Supabase'}</span>
                    </span>
                    <ChevronDown size={14} className="text-stone-500" />
                  </>
                )}
              </button>
            }
          >
            {(close) => (
              <>
                {backend.mode === 'local' && (
                  <>
                    <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-stone-500">Trabajar como</div>
                    {users.map((u) => (
                      <MenuItem key={u.id} onClick={() => { setMe(u.id); close() }}>
                        <Avatar name={u.full_name} size={20} /> {u.full_name}
                      </MenuItem>
                    ))}
                  </>
                )}
                {backend.mode === 'supabase' && supabase && (
                  <MenuItem onClick={() => { void supabase!.auth.signOut(); close() }}>
                    <LogOut size={14} /> Cerrar sesión
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-5">
          <button onClick={toggle} className="btn-ghost px-1.5" aria-label="Contraer menú">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button onClick={() => setPalette(true)} className="flex h-9 w-[420px] max-w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm text-stone-500 hover:border-stone-300">
            <Search size={15} />
            <span className="flex-1 text-left">Buscar o ejecutar una acción…</span>
            <kbd className="rounded border border-stone-200 bg-white px-1.5 text-[10px]">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            {backend.mode === 'local' && <span className="hidden rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 ring-1 ring-amber-200 lg:inline">Modo local: los datos viven en este navegador</span>}
            <Menu
              trigger={
                <button className="btn-primary">
                  <Plus size={16} /> Nuevo
                </button>
              }
            >
              {(close) => (
                <>
                  {(
                    [
                      ['task', 'Tarea'],
                      ['interaction', 'Interacción'],
                      ['lead', 'Prospecto'],
                      ['opportunity', 'Oportunidad'],
                      ['client', 'Cliente'],
                      ['project', 'Proyecto'],
                      ['payment', 'Pago recibido'],
                      ['invoice', 'Factura (CFDI)'],
                      ['expense', 'Gasto'],
                      ['contract', 'Contrato'],
                      ['asset', 'Servicio (dominio, hosting…)'],
                      ['time', 'Horas'],
                      ['ticket', 'Ticket de soporte'],
                    ] as const
                  ).map(([k, l]) => (
                    <MenuItem key={k} onClick={() => { quick.open(k); close() }}>
                      {l}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </div>
        </header>
        {backend.mode === 'supabase' && missingTables.size > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
            Falta preparar la base de datos: corre {[...new Set([...missingTables].map((t) => (['expenses', 'assets', 'contracts'].includes(t) ? '0005_finanzas_contratos_metas.sql' : '0006_soporte_checklists_revision.sql')))].sort().map((f, i) => <span key={f}>{i > 0 && ' y luego '}<code className="rounded bg-amber-100 px-1">{f}</code></span>)} en el SQL Editor de Supabase. Lo demás funciona normal.
          </div>
        )}
        {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">Error al cargar datos: {error}</div>}
        <main key={location.pathname} ref={mainRef} onScroll={(e) => scrollPos.set(location.pathname, e.currentTarget.scrollTop)} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
