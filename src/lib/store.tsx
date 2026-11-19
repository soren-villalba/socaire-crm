import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Backend } from './backend'
import { LocalBackend, SupabaseBackend, supabase } from './backend'
import type { DB, Profile, TableName, Tables } from './types'
import { emptyDB } from './types'
import { DEFAULT_SETTINGS, type Settings } from './constants'
import { useToast } from '../components/Toast'

interface Ctx {
  db: DB
  loading: boolean
  error: string | null
  backend: Backend
  me: Profile | null
  setMe: (id: string) => void
  settings: Settings
  byId: <T extends TableName>(table: T, id?: string | null) => Tables[T] | undefined
  insert: <T extends TableName>(table: T, row: Partial<Tables[T]>, opts?: { silent?: boolean }) => Promise<Tables[T]>
  update: <T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>, opts?: { silent?: boolean }) => Promise<Tables[T]>
  remove: (table: TableName, id: string, label?: string) => Promise<void>
  reload: () => Promise<void>
  can: (perm: Perm) => boolean
}

export type Perm = 'finance.manage' | 'users.manage' | 'audit.read' | 'records.delete'

const DataCtx = createContext<Ctx | null>(null)

export function useData(): Ctx {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData fuera de DataProvider')
  return c
}

/** Registros vivos (sin eliminación lógica) de una tabla. */
export function useTable<T extends TableName>(table: T): Tables[T][] {
  const { db } = useData()
  return useMemo(() => (db[table] as Tables[T][]).filter((r) => !(r as { deleted_at?: string | null }).deleted_at), [db, table])
}

const ME_KEY = 'socaire-crm-me'

export function DataProvider({ children, authUserId }: { children: ReactNode; authUserId?: string | null }) {
  const backendRef = useRef<Backend>(supabase ? new SupabaseBackend(supabase) : new LocalBackend())
  const backend = backendRef.current
  const [db, setDb] = useState<DB>(emptyDB())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ME_KEY)
    } catch {
      return null
    }
  })
  const toast = useToast()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await backend.loadAll()
      setDb(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backend])

  useEffect(() => {
    void reload()
  }, [reload])

  const profiles = db.profiles.filter((p) => !p.deleted_at)
  const me = useMemo(() => {
    if (backend.mode === 'supabase') return profiles.find((p) => p.id === authUserId) ?? null
    return profiles.find((p) => p.id === meId) ?? profiles[0] ?? null
  }, [profiles, meId, authUserId, backend.mode])

  const setMe = useCallback((id: string) => {
    setMeId(id)
    try {
      localStorage.setItem(ME_KEY, id)
    } catch {
      /* noop */
    }
  }, [])

  const settings = useMemo<Settings>(() => {
    const row = db.settings.find((s) => s.key === 'app')
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
  }, [db.settings])

  const index = useMemo(() => {
    const m = new Map<string, unknown>()
    for (const k of Object.keys(db) as (keyof DB)[]) for (const r of db[k] as { id: string }[]) m.set(`${k}:${r.id}`, r)
    return m
  }, [db])

  const byId = useCallback(
    <T extends TableName>(table: T, id?: string | null) => (id ? (index.get(`${table}:${id}`) as Tables[T] | undefined) : undefined),
    [index],
  )

  const insert = useCallback(
    async <T extends TableName>(table: T, row: Partial<Tables[T]>, opts?: { silent?: boolean }) => {
      try {
        const saved = await backend.insert(table, row, me?.id)
        setDb((prev) => ({ ...prev, [table]: [...(prev[table] as Tables[T][]), saved] }))
        if (!opts?.silent) toast.success('Guardado')
        return saved
      } catch (e) {
        toast.error(`No se pudo guardar: ${(e as Error).message}`)
        throw e
      }
    },
    [backend, me?.id, toast],
  )

  const update = useCallback(
    async <T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>, opts?: { silent?: boolean }) => {
      // Actualización optimista: la pantalla cambia al instante y se revierte si falla.
      let before: Tables[T] | undefined
      setDb((prev) => {
        const list = prev[table] as Tables[T][]
        before = list.find((r) => r.id === id)
        return { ...prev, [table]: list.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
      })
      try {
        const saved = await backend.update(table, id, patch, me?.id)
        setDb((prev) => ({ ...prev, [table]: (prev[table] as Tables[T][]).map((r) => (r.id === id ? saved : r)) }))
        if (!opts?.silent) toast.success('Cambios guardados')
        return saved
      } catch (e) {
        if (before) {
          const b = before
          setDb((prev) => ({ ...prev, [table]: (prev[table] as Tables[T][]).map((r) => (r.id === id ? b : r)) }))
        }
        toast.error(`No se pudo guardar: ${(e as Error).message}`)
        throw e
      }
    },
    [backend, me?.id, toast],
  )

  const remove = useCallback(
    async (table: TableName, id: string, label = 'Registro') => {
      const stamp = new Date().toISOString()
      const mark = (val: string | null) =>
        setDb((prev) => ({ ...prev, [table]: (prev[table] as { id: string }[]).map((r) => (r.id === id ? { ...r, deleted_at: val } : r)) }))
      mark(stamp)
      try {
        await backend.remove(table, id, me?.id)
        toast.success(`${label} eliminado`, {
          label: 'Deshacer',
          onClick: async () => {
            mark(null)
            await backend.restore(table, id, me?.id)
          },
        })
      } catch (e) {
        mark(null)
        toast.error(`No se pudo eliminar: ${(e as Error).message}`)
      }
    },
    [backend, me?.id, toast],
  )

  const can = useCallback(
    (perm: Perm) => {
      const roles = me?.roles ?? []
      if (roles.includes('admin')) return true
      switch (perm) {
        case 'finance.manage':
          return roles.includes('direccion')
        case 'users.manage':
        case 'audit.read':
          return false
        case 'records.delete':
          return roles.includes('direccion')
      }
    },
    [me],
  )

  const value: Ctx = { db, loading, error, backend, me, setMe, settings, byId, insert, update, remove, reload, can }
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}
