// Capa de datos. Dos implementaciones con la misma interfaz:
//  - LocalBackend: guarda todo en el navegador (localStorage). Sirve para probar sin Supabase.
//  - SupabaseBackend: Postgres + Auth de Supabase; los permisos se validan en la base (RLS).
// Se elige Supabase automáticamente si existen VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuditLog, DB, TableName, Tables } from './types'
import { TABLES, emptyDB } from './types'
import { uid } from './format'
import type { buildSeed as BuildSeed } from './seed'

// Los datos iniciales (clientes reales, precios, notas) SOLO se incluyen en la versión local.
// Si el build tiene Supabase configurado, Vite reemplaza la condición por un valor fijo y el
// archivo seed.ts queda fuera del JavaScript público (no se publica en Netlify).
const HAS_SUPABASE_ENV = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
async function loadSeed(): Promise<DB> {
  if (HAS_SUPABASE_ENV) return emptyDB()
  const mod: { buildSeed: typeof BuildSeed } = await import('./seed')
  return mod.buildSeed()
}

export interface Backend {
  mode: 'local' | 'supabase'
  loadAll(): Promise<DB>
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>, userId?: string | null): Promise<Tables[T]>
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>, userId?: string | null): Promise<Tables[T]>
  remove(table: TableName, id: string, userId?: string | null): Promise<void>
  restore(table: TableName, id: string, userId?: string | null): Promise<void>
}

const LS_KEY = 'socaire-crm-db-v1'

/** Tablas nuevas que dependen de correr un script SQL (0005). Si faltan, no se cae todo el CRM. */
export const OPTIONAL_TABLES: TableName[] = ['expenses', 'assets', 'contracts']
export const missingTables = new Set<TableName>()


function summarize(_table: string, row: Record<string, unknown>): string {
  return String(row.title ?? row.company_name ?? row.name ?? row.folio ?? row.concept ?? row.summary ?? row.milestone_name ?? row.key ?? '')
}

export class LocalBackend implements Backend {
  mode = 'local' as const
  private db: DB = emptyDB()

  private persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.db))
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }

  async loadAll(): Promise<DB> {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(LS_KEY)
    } catch {
      raw = null
    }
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      this.db = { ...emptyDB(), ...parsed }
    } else {
      this.db = await loadSeed()
      this.persist()
    }
    return structuredClone(this.db)
  }

  private log(table: string, id: string, action: AuditLog['action'], userId?: string | null, summary?: string) {
    this.db.audit_logs.unshift({ id: uid(), table_name: table, record_id: id, action, changed_by: userId ?? null, changed_at: new Date().toISOString(), summary })
    if (this.db.audit_logs.length > 2000) this.db.audit_logs.length = 2000
  }

  async insert<T extends TableName>(table: T, row: Partial<Tables[T]>, userId?: string | null): Promise<Tables[T]> {
    const now = new Date().toISOString()
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined))
    const full = { id: uid(), created_at: now, updated_at: now, created_by: userId ?? null, deleted_at: null, ...clean } as Tables[T]
    ;(this.db[table] as Tables[T][]).push(full)
    this.log(table, full.id, 'insert', userId, summarize(table, full as unknown as Record<string, unknown>))
    this.persist()
    return structuredClone(full)
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>, userId?: string | null): Promise<Tables[T]> {
    const list = this.db[table] as Tables[T][]
    const i = list.findIndex((r) => r.id === id)
    if (i < 0) throw new Error('Registro no encontrado')
    const changed = Object.keys(patch).filter((k) => k !== 'updated_at')
    list[i] = { ...list[i], ...patch, updated_at: new Date().toISOString() }
    this.log(table, id, 'update', userId, `${summarize(table, list[i] as unknown as Record<string, unknown>)} · ${changed.join(', ')}`)
    this.persist()
    return structuredClone(list[i])
  }

  async remove(table: TableName, id: string, userId?: string | null) {
    const list = this.db[table] as { id: string; deleted_at?: string | null }[]
    const r = list.find((x) => x.id === id)
    if (r) r.deleted_at = new Date().toISOString()
    this.log(table, id, 'delete', userId, r ? summarize(table, r as Record<string, unknown>) : '')
    this.persist()
  }

  async restore(table: TableName, id: string, userId?: string | null) {
    const list = this.db[table] as { id: string; deleted_at?: string | null }[]
    const r = list.find((x) => x.id === id)
    if (r) r.deleted_at = null
    this.log(table, id, 'update', userId, 'restaurado')
    this.persist()
  }

  // Utilidades exclusivas del modo local
  async reset() {
    this.db = await loadSeed()
    this.persist()
  }
  replace(db: DB) {
    this.db = { ...emptyDB(), ...db }
    this.persist()
  }
}

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export class SupabaseBackend implements Backend {
  mode = 'supabase' as const
  constructor(private sb: SupabaseClient) {}

  async loadAll(): Promise<DB> {
    const db = emptyDB()
    missingTables.clear()
    await Promise.all(
      TABLES.map(async (t) => {
        const { data, error } = await this.sb.from(t).select('*').limit(10000)
        // Tablas de una entrega cuyo script SQL aún no se corre: el CRM sigue funcionando sin ellas.
        if (error && OPTIONAL_TABLES.includes(t)) {
          missingTables.add(t)
          return
        }
        if (error) throw new Error(`${t}: ${error.message}`)
        ;(db as Record<string, unknown[]>)[t] = data ?? []
      }),
    )
    const { data: logs } = await this.sb.from('audit_logs').select('id, table_name, record_id, action, changed_by, changed_at, summary').order('changed_at', { ascending: false }).limit(1000)
    db.audit_logs = (logs ?? []) as AuditLog[]
    return db
  }

  async insert<T extends TableName>(table: T, row: Partial<Tables[T]>, userId?: string | null): Promise<Tables[T]> {
    const { data, error } = await this.sb
      .from(table)
      .insert({ ...Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && !k.startsWith('__'))), created_by: userId ?? null })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as Tables[T]
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]> {
    const clean = { ...patch } as Record<string, unknown>
    delete clean.id
    delete clean.created_at
    delete clean.updated_at
    for (const k of Object.keys(clean)) if (k.startsWith('__')) delete clean[k]
    const { data, error } = await this.sb.from(table).update(clean).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data as Tables[T]
  }

  async remove(table: TableName, id: string) {
    const { error } = await this.sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
  }

  async restore(table: TableName, id: string) {
    const { error } = await this.sb.from(table).update({ deleted_at: null }).eq('id', id)
    if (error) throw new Error(error.message)
  }
}

/**
 * Sube un respaldo JSON (por ejemplo, el del modo local) a Supabase conservando los ids.
 * Los usuarios del respaldo se asignan a usuarios reales de Supabase con `profileMap`.
 */
export async function importToSupabase(sb: SupabaseClient, data: DB, profileMap: Record<string, string>, onStep?: (msg: string) => void) {
  const PROFILE_FIELDS = ['created_by', 'account_manager_id', 'owner_id', 'assigned_to', 'manager_id', 'user_id']
  const fix = (row: Record<string, unknown>) => {
    const r: Record<string, unknown> = { ...row }
    for (const f of PROFILE_FIELDS) if (typeof r[f] === 'string') r[f] = profileMap[r[f] as string] ?? null
    for (const k of Object.keys(r)) if (k.startsWith('__')) delete r[k]
    return r
  }
  const up = async (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return
    onStep?.(`${table} (${rows.length})`)
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 200).map(fix))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }
  const d = data as unknown as Record<string, Record<string, unknown>[]>
  await up('products', d.products)
  await up('clients', d.clients.map((c) => ({ ...c, referred_by_client_id: null })))
  await up('clients', d.clients.filter((c) => c.referred_by_client_id))
  await up('contacts', d.contacts)
  await up('leads', d.leads.map((l) => ({ ...l, converted_opportunity_id: null })))
  await up('opportunities', d.opportunities)
  await up('leads', d.leads.filter((l) => l.converted_opportunity_id))
  const quotes = [...d.quotes].sort((a, b) => Number(a.version) - Number(b.version))
  await up('quotes', quotes.map((q) => ({ ...q, previous_version_id: null })))
  await up('quotes', quotes.filter((q) => q.previous_version_id))
  await up('quote_items', d.quote_items)
  await up('subscriptions', d.subscriptions)
  await up('branches', d.branches)
  await up('referrals', d.referrals)
  await up('projects', d.projects)
  await up('project_phases', d.project_phases)
  await up('change_requests', d.change_requests)
  await up('time_entries', d.time_entries.filter((t) => profileMap[t.user_id as string]))
  await up('invoices', d.invoices)
  await up('payments', d.payments)
  await up('tasks', d.tasks)
  await up('interactions', d.interactions)
  await up('tickets', d.tickets)
  await up('documents', d.documents)
  await up('assets', d.assets ?? [])
  await up('expenses', d.expenses ?? [])
  await up('contracts', d.contracts ?? [])
  const app = d.settings.find((s) => s.key === 'app')
  if (app) {
    const { error } = await sb.from('settings').update({ value: app.value }).eq('key', 'app')
    if (error) throw new Error(`settings: ${error.message}`)
  }
}
