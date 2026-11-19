// Modelo de datos del CRM. Cada interfaz corresponde a una tabla de Supabase
// (ver supabase/migrations/0001_schema.sql). Los nombres de campo son idénticos.

export type ID = string
export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string

export interface Base {
  id: ID
  created_at: ISODateTime
  updated_at: ISODateTime
  created_by?: ID | null
  deleted_at?: ISODateTime | null
}

export type Role = 'admin' | 'direccion' | 'comercial' | 'desarrollo' | 'soporte'

export interface Profile extends Base {
  full_name: string
  email: string
  roles: Role[]
  hourly_cost: number
  active: boolean
  initials?: string
}

export type ClientStatus = 'prospecto' | 'activo' | 'en_riesgo' | 'inactivo' | 'perdido'
export interface Client extends Base {
  company_name: string
  legal_name?: string | null
  tax_id?: string | null
  tax_regime?: string | null
  tax_zip?: string | null
  cfdi_use?: string | null
  billing_email?: string | null
  industry?: string | null
  size?: string | null
  website?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  status: ClientStatus
  acquisition_source?: string | null
  referred_by_client_id?: ID | null
  account_manager_id?: ID | null
  importance: 'alta' | 'media' | 'baja'
  relationship_start?: ISODate | null
  total_branches?: number | null
  peak_seasons?: string | null
  folder_path?: string | null
  drive_url?: string | null // liga a la carpeta del cliente en Google Drive
  notes?: string | null
}

export interface Contact extends Base {
  client_id: ID
  name: string
  role?: string | null
  phone?: string | null
  email?: string | null
  is_primary: boolean
  is_approver: boolean
  notes?: string | null
}

export interface Branch extends Base {
  client_id: ID
  name: string
  address?: string | null
  phone?: string | null
  subscription_id?: ID | null // si está dada de alta en un servicio (distribución)
  notes?: string | null
}

export type LeadStatus = 'nuevo' | 'contactado' | 'calificado' | 'descartado' | 'convertido'
export interface Lead extends Base {
  name: string
  company?: string | null
  phone?: string | null
  email?: string | null
  source?: string | null
  status: LeadStatus
  owner_id?: ID | null
  notes?: string | null
  converted_client_id?: ID | null
  converted_opportunity_id?: ID | null
  converted_at?: ISODateTime | null
}

export type Stage =
  | 'nuevo'
  | 'primer_contacto'
  | 'calificacion'
  | 'diagnostico'
  | 'propuesta'
  | 'negociacion'
  | 'ganada'
  | 'perdida'

export type ServiceType = 'saas' | 'a_medida' | 'consultoria' | 'otro'

export interface Opportunity extends Base {
  client_id: ID
  lead_id?: ID | null
  title: string
  description?: string | null
  service_type: ServiceType
  product_id?: ID | null
  stage: Stage
  estimated_value: number // pago único / proyecto
  estimated_mrr: number // recurrente mensual
  probability: number
  expected_close_date?: ISODate | null
  owner_id?: ID | null
  next_followup_date?: ISODate | null
  next_step?: string | null
  lost_reason?: string | null
  closed_at?: ISODate | null
}

export type ProductKind = 'saas' | 'desarrollo' | 'servicio'
export interface Product extends Base {
  name: string
  kind: ProductKind
  billing: 'mensual' | 'unico' | 'por_hora'
  unit: string
  list_price: number
  intro_price?: number | null
  setup_fee?: number | null
  active: boolean
  description?: string | null
}

export type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida' | 'reemplazada'
export interface Quote extends Base {
  folio: string
  version: number
  previous_version_id?: ID | null
  opportunity_id?: ID | null
  client_id: ID
  issue_date: ISODate
  valid_until?: ISODate | null
  status: QuoteStatus
  title?: string | null
  conditions?: string | null
  notes?: string | null
  file_path?: string | null
  accepted_at?: ISODate | null
}

export interface QuoteItem extends Base {
  quote_id: ID
  product_id?: ID | null
  description: string
  kind: 'mensual' | 'unico'
  quantity: number
  unit_price: number
  discount: number // descuento total de la línea (por periodo)
  sort: number
}

export type SubscriptionStatus = 'pendiente' | 'activa' | 'pausada' | 'cancelada'
export interface Subscription extends Base {
  client_id: ID
  product_id: ID
  quote_id?: ID | null
  status: SubscriptionStatus
  quantity: number
  list_price: number
  unit_price: number // precio pactado por unidad antes de referidos
  price_floor?: number | null
  apply_referrals: boolean
  start_date?: ISODate | null // go-live / inicio del cobro
  billing_day?: number | null
  min_term_months?: number | null
  setup_fee?: number | null
  setup_fee_waived: boolean
  cancellation_date?: ISODate | null
  notes?: string | null
}

export interface Referral extends Base {
  referrer_client_id: ID
  referred_client_id: ID
  signed_date: ISODate
  first_payment_date?: ISODate | null
  active: boolean
  notes?: string | null
}

export type InvoiceStatus = 'borrador' | 'emitida' | 'cancelada'
export interface Invoice extends Base {
  client_id: ID
  subscription_id?: ID | null
  project_id?: ID | null
  folio?: string | null
  uuid_sat?: string | null
  period?: string | null // 'YYYY-MM' para mensualidades
  concept: string
  issue_date: ISODate
  due_date?: ISODate | null
  subtotal: number
  tax: number
  total: number
  status: InvoiceStatus
  notes?: string | null
}

export interface Payment extends Base {
  invoice_id?: ID | null
  client_id: ID
  amount: number
  payment_date: ISODate
  method: 'transferencia' | 'efectivo' | 'tarjeta' | 'otro'
  reference?: string | null
  notes?: string | null
}

export type ProjectStatus = 'planeacion' | 'en_curso' | 'en_pausa' | 'completado' | 'cancelado'
export interface Project extends Base {
  client_id: ID
  opportunity_id?: ID | null
  quote_id?: ID | null
  name: string
  description?: string | null
  project_type: 'implementacion' | 'desarrollo' | 'diagnostico' | 'soporte'
  status: ProjectStatus
  priority: 'alta' | 'media' | 'baja'
  start_date?: ISODate | null
  go_live_date?: ISODate | null
  estimated_end_date?: ISODate | null
  actual_end_date?: ISODate | null
  budget?: number | null
  estimated_hours?: number | null
  manager_id?: ID | null
  freeze_window?: string | null
  drive_url?: string | null // liga a la carpeta del proyecto en Google Drive
  notes?: string | null
}

export type PhaseStatus = 'pendiente' | 'en_curso' | 'hecho' | 'bloqueado'
export interface ProjectPhase extends Base {
  project_id: ID
  sort: number
  letter: string // V, E, L, E, R, O
  name: string
  milestone: string // H1..H7
  milestone_name: string
  start_date?: ISODate | null
  due_date?: ISODate | null
  done_date?: ISODate | null
  status: PhaseStatus
  owner_id?: ID | null
  estimated_hours?: number | null
  notes?: string | null
}

export type ChangeStatus = 'registrado' | 'estimado' | 'cotizado' | 'aprobado' | 'rechazado' | 'hecho'
export interface ChangeRequest extends Base {
  project_id: ID
  client_id: ID
  title: string
  description?: string | null
  requested_date: ISODate
  estimated_hours?: number | null
  amount?: number | null
  status: ChangeStatus
  approved_date?: ISODate | null
  approval_evidence?: string | null
}

export interface TimeEntry extends Base {
  project_id?: ID | null
  phase_id?: ID | null
  client_id?: ID | null
  user_id: ID
  date: ISODate
  hours: number
  activity: string
  billable: boolean
}

export type TaskStatus = 'pendiente' | 'en_curso' | 'hecha'
export type RelatedType = 'client' | 'opportunity' | 'project' | 'lead' | 'invoice' | 'ticket' | 'quote'
export interface Task extends Base {
  title: string
  description?: string | null
  kind: 'tarea' | 'reunion' | 'llamada' | 'compromiso' | 'recordatorio'
  status: TaskStatus
  priority: 'alta' | 'media' | 'baja'
  assigned_to?: ID | null
  due_date?: ISODate | null
  due_time?: string | null
  completed_at?: ISODateTime | null
  client_id?: ID | null
  related_type?: RelatedType | null
  related_id?: ID | null
}

export interface Interaction extends Base {
  client_id?: ID | null
  lead_id?: ID | null
  opportunity_id?: ID | null
  project_id?: ID | null
  kind: 'llamada' | 'whatsapp' | 'correo' | 'reunion' | 'visita' | 'nota'
  summary: string
  occurred_at: ISODateTime
  user_id?: ID | null
}

export type TicketStatus = 'nuevo' | 'asignado' | 'en_proceso' | 'esperando_cliente' | 'resuelto' | 'cerrado'
export interface Ticket extends Base {
  client_id: ID
  project_id?: ID | null
  product_id?: ID | null
  title: string
  description?: string | null
  category: 'incidencia' | 'duda' | 'solicitud' | 'mejora'
  priority: 'alta' | 'media' | 'baja'
  status: TicketStatus
  assigned_to?: ID | null
  first_response_at?: ISODateTime | null
  resolved_at?: ISODateTime | null
  resolution?: string | null
}

export interface DocumentRec extends Base {
  client_id?: ID | null
  project_id?: ID | null
  quote_id?: ID | null
  name: string
  kind: 'cotizacion' | 'contrato' | 'propuesta' | 'nda' | 'acta' | 'minuta' | 'roadmap' | 'aviso_privacidad' | 'factura' | 'tecnico' | 'otro'
  status: 'borrador' | 'enviado' | 'aprobado' | 'firmado' | 'cerrado'
  location: string // liga de Google Drive (u otra https) o ruta en la carpeta de socaire
  notes?: string | null
}

export interface AuditLog {
  id: ID
  table_name: string
  record_id: ID
  action: 'insert' | 'update' | 'delete'
  changed_by?: ID | null
  changed_at: ISODateTime
  summary?: string | null
}

export interface Setting extends Base {
  key: string
  value: unknown
}

export interface Tables {
  profiles: Profile
  clients: Client
  contacts: Contact
  branches: Branch
  leads: Lead
  opportunities: Opportunity
  products: Product
  quotes: Quote
  quote_items: QuoteItem
  subscriptions: Subscription
  referrals: Referral
  invoices: Invoice
  payments: Payment
  projects: Project
  project_phases: ProjectPhase
  change_requests: ChangeRequest
  time_entries: TimeEntry
  tasks: Task
  interactions: Interaction
  tickets: Ticket
  documents: DocumentRec
  settings: Setting
}

export type TableName = keyof Tables
export const TABLES: TableName[] = [
  'profiles', 'clients', 'contacts', 'branches', 'leads', 'opportunities', 'products', 'quotes',
  'quote_items', 'subscriptions', 'referrals', 'invoices', 'payments', 'projects', 'project_phases',
  'change_requests', 'time_entries', 'tasks', 'interactions', 'tickets', 'documents', 'settings',
]

export type DB = { [K in TableName]: Tables[K][] } & { audit_logs: AuditLog[] }

export function emptyDB(): DB {
  const db = {} as DB
  for (const t of TABLES) (db as Record<string, unknown[]>)[t] = []
  db.audit_logs = []
  return db
}
