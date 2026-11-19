import logo from './logo.svg'
import { useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { ToastProvider } from './components/Toast'
import { DataProvider, useData } from './lib/store'
import { QuickProvider } from './components/QuickCreate'
import { Layout } from './components/Layout'
import { supabase } from './lib/backend'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Opportunities from './pages/Opportunities'
import Quotes from './pages/Quotes'
import QuoteEditor from './pages/QuoteEditor'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Tasks from './pages/Tasks'
import Finance from './pages/Finance'
import Support from './pages/Support'
import Documents from './pages/Documents'
import SettingsPage from './pages/Settings'

// Versión de un solo archivo (se abre con doble clic): usa rutas con # porque no hay servidor.
const Router = import.meta.env.MODE === 'archivo' ? HashRouter : BrowserRouter

function Shell() {
  const { loading, me, backend, error, reload } = useData()
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-stone-400">
        <img src={logo} alt="" className="mr-3 h-8 w-8 animate-pulse" /> Cargando…
      </div>
    )
  if (backend.mode === 'supabase' && !me)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm text-stone-600">
        <p>Tu usuario inició sesión pero no tiene perfil activo en el CRM. Pide al administrador que te dé de alta.</p>
        {error && <p className="max-w-xl rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">Detalle técnico: {error}</p>}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => void reload()}>Reintentar</button>
          <button className="btn-ghost" onClick={() => void supabase?.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
    )
  return (
    <QuickProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="prospectos" element={<Leads />} />
          <Route path="oportunidades" element={<Opportunities />} />
          <Route path="cotizaciones" element={<Quotes />} />
          <Route path="cotizaciones/:id" element={<QuoteEditor />} />
          <Route path="clientes" element={<Clients />} />
          <Route path="clientes/:id" element={<ClientDetail />} />
          <Route path="proyectos" element={<Projects />} />
          <Route path="proyectos/:id" element={<ProjectDetail />} />
          <Route path="tareas" element={<Tasks />} />
          <Route path="finanzas" element={<Finance />} />
          <Route path="soporte" element={<Support />} />
          <Route path="documentos" element={<Documents />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="*" element={<div className="text-stone-500">Página no encontrada.</div>} />
        </Route>
      </Routes>
    </QuickProvider>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error)
      setErr(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : /fetch|network/i.test(error.message)
            ? 'No se pudo conectar con la base de datos. Revisa tu internet e inténtalo de nuevo.'
            : error.message,
      )
    setBusy(false)
  }
  return (
    <div className="flex h-screen items-center justify-center bg-brand-50">
      <form onSubmit={submit} className="card w-[360px] space-y-4 p-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="h-8 w-8" />
          <div>
            <div className="font-serif text-2xl font-semibold leading-none text-brand-800">socaire</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-brand-400">CRM interno</div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="pw">Contraseña</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return (
    <ToastProvider>
      {supabase && !session ? (
        <Login />
      ) : (
        <Router>
          <DataProvider key={session?.user.id ?? 'local'} authUserId={session?.user.id}>
            <Shell />
          </DataProvider>
        </Router>
      )}
    </ToastProvider>
  )
}
