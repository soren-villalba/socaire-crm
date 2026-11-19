// Formularios de todas las entidades en un solo lugar. Cualquier pantalla (o Ctrl+K)
// puede abrir "crear" o "editar" con quick.open(kind, valores) / quick.edit(kind, registro).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer } from './ui'
import { RecordForm, type FieldDef, type Option } from './Form'
import { useData, useTable } from '../lib/store'
import type { TableName, Tables, Stage } from '../lib/types'
import {
  STAGES, SERVICE_TYPES, SOURCES, INTERACTION_KINDS, TASK_KINDS, PAYMENT_METHODS, DOC_KINDS, ROLES,
  CLIENT_STATUS, LEAD_STATUS, PRIORITY, TICKET_STATUS, CHANGE_STATUS, SUB_STATUS, PROJECT_STATUS, DOC_STATUS, VELERO,
} from '../lib/constants'
import { addDays, addBusinessDays, todayISO } from '../lib/format'

export type Kind =
  | 'lead' | 'client' | 'contact' | 'branch' | 'opportunity' | 'task' | 'interaction' | 'ticket' | 'time' | 'change'
  | 'document' | 'payment' | 'invoice' | 'subscription' | 'product' | 'referral' | 'project' | 'profile' | 'phase'

const TABLE: Record<Kind, TableName> = {
  lead: 'leads', client: 'clients', contact: 'contacts', branch: 'branches', opportunity: 'opportunities', task: 'tasks',
  interaction: 'interactions', ticket: 'tickets', time: 'time_entries', change: 'change_requests', document: 'documents',
  payment: 'payments', invoice: 'invoices', subscription: 'subscriptions', product: 'products', referral: 'referrals',
  project: 'projects', profile: 'profiles', phase: 'project_phases',
}
const TITLES: Record<Kind, string> = {
  lead: 'prospecto', client: 'cliente', contact: 'contacto', branch: 'sucursal', opportunity: 'oportunidad', task: 'tarea',
  interaction: 'interacción', ticket: 'ticket de soporte', time: 'registro de horas', change: 'cambio de alcance', document: 'documento',
  payment: 'pago', invoice: 'factura (CFDI)', subscription: 'suscripción', product: 'producto o servicio', referral: 'referido',
  project: 'proyecto', profile: 'usuario', phase: 'fase / hito',
}
const FEM = new Set<Kind>(['opportunity', 'task', 'interaction', 'branch', 'invoice', 'subscription', 'phase'])

const toOpts = (m: Record<string, { label: string }>): Option[] => Object.entries(m).map(([value, { label }]) => ({ value, label }))

interface OpenState {
  kind: Kind
  record?: Record<string, unknown> & { id?: string }
  defaults?: Record<string, unknown>
  onSaved?: (r: unknown) => void
}

interface QuickApi {
  open: (kind: Kind, defaults?: Record<string, unknown>, onSaved?: (r: unknown) => void) => void
  edit: (kind: Kind, record: object, onSaved?: (r: unknown) => void) => void
}
const Ctx = createContext<QuickApi | null>(null)
export const useQuick = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useQuick fuera de QuickProvider')
  return c
}

export function QuickProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null)
  const api = useMemo<QuickApi>(
    () => ({
      open: (kind, defaults, onSaved) => setState({ kind, defaults, onSaved }),
      edit: (kind, record, onSaved) => setState({ kind, record: record as OpenState['record'], onSaved }),
    }),
    [],
  )
  return (
    <Ctx.Provider value={api}>
      {children}
      {state && <QuickDrawer state={state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  )
}

function QuickDrawer({ state, onClose }: { state: OpenState; onClose: () => void }) {
  const { insert, update, me, settings } = useData()
  const navigate = useNavigate()
  const clients = useTable('clients')
  const users = useTable('profiles')
  const products = useTable('products')
  const projects = useTable('projects')
  const opps = useTable('opportunities')
  const invoices = useTable('invoices')
  const subs = useTable('subscriptions')

  const clientOpts = clients.map((c) => ({ value: c.id, label: c.company_name })).sort((a, b) => a.label.localeCompare(b.label))
  const userOpts = users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.full_name }))
  const productOpts = products.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }))
  const { kind, record } = state
  const isEdit = !!record?.id
  const today = todayISO()

  const fields: FieldDef[] = useMemo(() => {
    switch (kind) {
      case 'lead':
        return [
          { name: 'name', label: 'Nombre', required: true, autoFocus: true },
          { name: 'company', label: 'Negocio / empresa' },
          { name: 'phone', label: 'WhatsApp / teléfono', type: 'tel', span: 1 },
          { name: 'email', label: 'Correo', type: 'email', span: 1 },
          { name: 'source', label: 'Origen', type: 'select', options: SOURCES, span: 1 },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(LEAD_STATUS), required: true, span: 1 },
          { name: 'owner_id', label: 'Responsable', type: 'select', options: userOpts, span: 1 },
          { name: 'notes', label: 'Notas (necesidad, giro, cómo llegó)', type: 'textarea' },
        ]
      case 'client':
        return [
          { name: 'company_name', label: 'Nombre comercial', required: true, autoFocus: true },
          { name: 'industry', label: 'Giro / industria', span: 1, placeholder: 'Florería, vidriería…' },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(CLIENT_STATUS), required: true, span: 1 },
          { name: 'phone', label: 'Teléfono / WhatsApp', type: 'tel', span: 1 },
          { name: 'email', label: 'Correo', type: 'email', span: 1 },
          { name: 'city', label: 'Ciudad', span: 1 },
          { name: 'size', label: 'Tamaño', span: 1, placeholder: '5 sucursales, 20 empleados…' },
          { name: 'total_branches', label: 'Sucursales que tiene en total', type: 'number', min: 0, span: 1, hint: 'Para medir distribución' },
          { name: 'acquisition_source', label: 'Origen', type: 'select', options: SOURCES, span: 1 },
          { name: 'referred_by_client_id', label: 'Referido por', type: 'select', options: clientOpts, span: 1, show: (v) => v.acquisition_source === 'referido' },
          { name: 'account_manager_id', label: 'Responsable de cuenta', type: 'select', options: userOpts, span: 1 },
          { name: 'importance', label: 'Importancia', type: 'select', options: toOpts(PRIORITY), required: true, span: 1 },
          { name: 'relationship_start', label: 'Inicio de relación', type: 'date', span: 1 },
          { name: 'peak_seasons', label: 'Temporadas altas / fechas críticas del giro', hint: 'Se evita salir a producción en ellas' },
          { name: 'legal_name', label: 'Razón social / nombre fiscal', span: 1 },
          { name: 'tax_id', label: 'RFC', span: 1 },
          { name: 'tax_regime', label: 'Régimen fiscal', span: 1 },
          { name: 'tax_zip', label: 'CP fiscal', span: 1 },
          { name: 'cfdi_use', label: 'Uso de CFDI', span: 1 },
          { name: 'billing_email', label: 'Correo de facturación', type: 'email', span: 1 },
          { name: 'folder_path', label: 'Carpeta en socaire', placeholder: '06_Clientes/Activos/…' },
          { name: 'notes', label: 'Notas internas', type: 'textarea' },
        ]
      case 'contact':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true },
          { name: 'name', label: 'Nombre', required: true, autoFocus: true, span: 1 },
          { name: 'role', label: 'Puesto / rol', span: 1 },
          { name: 'phone', label: 'WhatsApp / teléfono', type: 'tel', span: 1 },
          { name: 'email', label: 'Correo', type: 'email', span: 1 },
          { name: 'is_primary', label: 'Contacto principal', type: 'checkbox', span: 1 },
          { name: 'is_approver', label: 'Aprueba y da seguimiento', type: 'checkbox', span: 1 },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'branch':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true },
          { name: 'name', label: 'Nombre de la sucursal', required: true, autoFocus: true },
          { name: 'address', label: 'Dirección' },
          { name: 'phone', label: 'Teléfono / WhatsApp de pedidos', type: 'tel', span: 1 },
          { name: 'subscription_id', label: 'Dada de alta en', type: 'select', span: 1, emptyLabel: 'Sin servicio', options: subs.filter((s) => s.client_id === (record?.client_id ?? state.defaults?.client_id)).map((s) => ({ value: s.id, label: products.find((p) => p.id === s.product_id)?.name ?? 'Suscripción' })) },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'opportunity':
        return [
          { name: 'title', label: 'Nombre de la oportunidad', required: true, autoFocus: true, placeholder: 'Socaire Pedidos · 2 sucursales' },
          { name: 'client_id', label: 'Empresa', type: 'select', options: clientOpts, required: true, hint: '¿No existe? Créala primero como cliente prospecto' },
          { name: 'service_type', label: 'Tipo de servicio', type: 'select', options: SERVICE_TYPES, required: true, span: 1 },
          { name: 'product_id', label: 'Producto', type: 'select', options: productOpts, span: 1 },
          { name: 'estimated_mrr', label: 'Recurrente mensual estimado', type: 'money', span: 1 },
          { name: 'estimated_value', label: 'Pago único / proyecto', type: 'money', span: 1 },
          { name: 'stage', label: 'Etapa', type: 'select', options: STAGES.map((s) => ({ value: s.key, label: s.label })), required: true, span: 1 },
          { name: 'probability', label: 'Probabilidad %', type: 'number', min: 0, span: 1 },
          { name: 'owner_id', label: 'Responsable', type: 'select', options: userOpts, required: true, span: 1 },
          { name: 'expected_close_date', label: 'Cierre esperado', type: 'date', span: 1 },
          { name: 'next_followup_date', label: 'Próximo seguimiento', type: 'date', span: 1, required: true, show: (v) => v.stage !== 'ganada' && v.stage !== 'perdida' },
          { name: 'next_step', label: 'Siguiente paso', span: 1, show: (v) => v.stage !== 'ganada' && v.stage !== 'perdida' },
          { name: 'lost_reason', label: 'Motivo de pérdida', required: true, show: (v) => v.stage === 'perdida' },
          { name: 'description', label: 'Descripción / necesidad', type: 'textarea' },
        ]
      case 'task':
        return [
          { name: 'title', label: '¿Qué hay que hacer?', required: true, autoFocus: true },
          { name: 'kind', label: 'Tipo', type: 'select', options: TASK_KINDS, required: true, span: 1 },
          { name: 'priority', label: 'Prioridad', type: 'select', options: toOpts(PRIORITY), required: true, span: 1 },
          { name: 'due_date', label: 'Fecha límite', type: 'date', span: 1 },
          { name: 'due_time', label: 'Hora', type: 'time', span: 1 },
          { name: 'assigned_to', label: 'Responsable', type: 'select', options: userOpts, required: true, span: 1 },
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, span: 1 },
          { name: 'description', label: 'Detalle', type: 'textarea' },
        ]
      case 'interaction':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true, span: 1 },
          { name: 'kind', label: 'Tipo', type: 'select', options: INTERACTION_KINDS, required: true, span: 1 },
          { name: 'summary', label: '¿Qué pasó?', type: 'textarea', required: true, autoFocus: true },
          { name: 'opportunity_id', label: 'Oportunidad', type: 'select', span: 1, options: opps.filter((o) => !state.defaults?.client_id || o.client_id === (state.defaults?.client_id ?? record?.client_id)).map((o) => ({ value: o.id, label: o.title })) },
          { name: 'occurred_at', label: 'Fecha', type: 'date', required: true, span: 1 },
        ]
      case 'ticket':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true, span: 1 },
          { name: 'project_id', label: 'Proyecto', type: 'select', options: projectOpts, span: 1 },
          { name: 'title', label: 'Asunto', required: true, autoFocus: true },
          { name: 'category', label: 'Categoría', type: 'select', required: true, span: 1, options: [
            { value: 'incidencia', label: 'Incidencia' }, { value: 'duda', label: 'Duda' }, { value: 'solicitud', label: 'Solicitud' }, { value: 'mejora', label: 'Mejora (posible cambio)' },
          ] },
          { name: 'priority', label: 'Prioridad', type: 'select', options: toOpts(PRIORITY), required: true, span: 1 },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(TICKET_STATUS), required: true, span: 1 },
          { name: 'assigned_to', label: 'Responsable', type: 'select', options: userOpts, span: 1 },
          { name: 'description', label: 'Descripción', type: 'textarea' },
          { name: 'resolution', label: 'Resolución', type: 'textarea', show: (v) => v.status === 'resuelto' || v.status === 'cerrado' },
        ]
      case 'time':
        return [
          { name: 'date', label: 'Fecha', type: 'date', required: true, span: 1 },
          { name: 'hours', label: 'Horas', type: 'number', step: 0.25, min: 0, required: true, span: 1, autoFocus: true },
          { name: 'user_id', label: 'Quién', type: 'select', options: userOpts, required: true, span: 1 },
          { name: 'project_id', label: 'Proyecto', type: 'select', options: projectOpts, span: 1 },
          { name: 'activity', label: 'Actividad', required: true },
          { name: 'billable', label: 'Cobrable', type: 'checkbox' },
        ]
      case 'change':
        return [
          { name: 'title', label: 'Cambio solicitado', required: true, autoFocus: true },
          { name: 'description', label: 'Detalle', type: 'textarea' },
          { name: 'requested_date', label: 'Fecha de solicitud', type: 'date', required: true, span: 1 },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(CHANGE_STATUS), required: true, span: 1 },
          { name: 'estimated_hours', label: 'Horas estimadas', type: 'number', step: 0.5, span: 1 },
          { name: 'amount', label: 'Monto cotizado', type: 'money', span: 1 },
          { name: 'approved_date', label: 'Aprobado el', type: 'date', span: 1, show: (v) => v.status === 'aprobado' || v.status === 'hecho' },
          { name: 'approval_evidence', label: 'Evidencia de aprobación', span: 1, placeholder: 'WhatsApp 20 nov, correo…', show: (v) => v.status === 'aprobado' || v.status === 'hecho' },
        ]
      case 'document':
        return [
          { name: 'name', label: 'Nombre', required: true, autoFocus: true },
          { name: 'kind', label: 'Tipo', type: 'select', options: DOC_KINDS, required: true, span: 1 },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(DOC_STATUS), required: true, span: 1 },
          { name: 'location', label: 'Ubicación (ruta en la carpeta de socaire o enlace)', required: true, placeholder: '06_Clientes/Activos/… o https://…' },
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, span: 1 },
          { name: 'project_id', label: 'Proyecto', type: 'select', options: projectOpts, span: 1 },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'payment':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true },
          { name: 'invoice_id', label: 'Factura', type: 'select', options: invoices.filter((i) => i.status === 'emitida').map((i) => ({ value: i.id, label: `${i.folio ?? 's/folio'} · ${i.concept} · $${i.total.toLocaleString('es-MX')}` })), emptyLabel: 'Sin factura (anticipo, efectivo…)' },
          { name: 'amount', label: 'Monto recibido', type: 'money', required: true, span: 1, autoFocus: true },
          { name: 'payment_date', label: 'Fecha', type: 'date', required: true, span: 1 },
          { name: 'method', label: 'Forma de pago', type: 'select', options: PAYMENT_METHODS, required: true, span: 1 },
          { name: 'reference', label: 'Referencia', span: 1 },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'invoice':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true },
          { name: 'concept', label: 'Concepto', required: true, autoFocus: true },
          { name: 'folio', label: 'Serie y folio', span: 1 },
          { name: 'uuid_sat', label: 'UUID (folio fiscal)', span: 1 },
          { name: 'issue_date', label: 'Fecha de emisión', type: 'date', required: true, span: 1 },
          { name: 'due_date', label: 'Fecha límite de pago', type: 'date', span: 1 },
          { name: 'subtotal', label: 'Subtotal', type: 'money', required: true, span: 1 },
          { name: 'tax', label: `IVA (${Math.round(settings.iva_rate * 100)}%)`, type: 'money', span: 1 },
          { name: 'total', label: 'Total', type: 'money', required: true, span: 1 },
          { name: 'status', label: 'Estado del CFDI', type: 'select', required: true, span: 1, options: [{ value: 'borrador', label: 'Borrador' }, { value: 'emitida', label: 'Emitida' }, { value: 'cancelada', label: 'Cancelada' }] },
          { name: 'period', label: 'Periodo (mensualidades)', span: 1, placeholder: 'AAAA-MM' },
          { name: 'subscription_id', label: 'Suscripción', type: 'select', span: 1, options: subs.map((s) => ({ value: s.id, label: `${clients.find((c) => c.id === s.client_id)?.company_name} · ${products.find((p) => p.id === s.product_id)?.name}` })) },
          { name: 'project_id', label: 'Proyecto', type: 'select', options: projectOpts },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'subscription':
        return [
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true, span: 1 },
          { name: 'product_id', label: 'Producto', type: 'select', options: productOpts, required: true, span: 1 },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(SUB_STATUS), required: true, span: 1 },
          { name: 'quantity', label: 'Unidades (sucursales)', type: 'number', min: 1, required: true, span: 1 },
          { name: 'list_price', label: 'Precio de lista por unidad', type: 'money', span: 1 },
          { name: 'unit_price', label: 'Precio pactado por unidad', type: 'money', required: true, span: 1 },
          { name: 'start_date', label: 'Inicio del cobro (go-live)', type: 'date', span: 1 },
          { name: 'min_term_months', label: 'Permanencia mínima (meses)', type: 'number', min: 0, span: 1 },
          { name: 'setup_fee', label: 'Alta (lista)', type: 'money', span: 1 },
          { name: 'setup_fee_waived', label: 'Alta bonificada', type: 'checkbox', span: 1 },
          { name: 'apply_referrals', label: 'Aplica programa de referidos', type: 'checkbox', span: 1 },
          { name: 'price_floor', label: 'Piso de tarifa con referidos', type: 'money', span: 1, show: (v) => !!v.apply_referrals },
          { name: 'cancellation_date', label: 'Fecha de cancelación', type: 'date', show: (v) => v.status === 'cancelada' },
          { name: 'notes', label: 'Condiciones / notas', type: 'textarea' },
        ]
      case 'product':
        return [
          { name: 'name', label: 'Nombre', required: true, autoFocus: true },
          { name: 'kind', label: 'Tipo', type: 'select', required: true, span: 1, options: [{ value: 'saas', label: 'SaaS (suscripción)' }, { value: 'desarrollo', label: 'Desarrollo' }, { value: 'servicio', label: 'Servicio' }] },
          { name: 'billing', label: 'Cobro', type: 'select', required: true, span: 1, options: [{ value: 'mensual', label: 'Mensual' }, { value: 'unico', label: 'Pago único' }, { value: 'por_hora', label: 'Por hora' }] },
          { name: 'unit', label: 'Unidad', span: 1, placeholder: 'sucursal, proyecto, hora…' },
          { name: 'list_price', label: 'Precio de lista', type: 'money', span: 1 },
          { name: 'intro_price', label: 'Precio introductorio', type: 'money', span: 1 },
          { name: 'setup_fee', label: 'Alta / implementación', type: 'money', span: 1 },
          { name: 'active', label: 'Activo', type: 'checkbox' },
          { name: 'description', label: 'Descripción', type: 'textarea' },
        ]
      case 'referral':
        return [
          { name: 'referrer_client_id', label: 'Cliente que recomienda', type: 'select', options: clientOpts, required: true },
          { name: 'referred_client_id', label: 'Negocio referido', type: 'select', options: clientOpts, required: true },
          { name: 'signed_date', label: 'Firmó el', type: 'date', required: true, span: 1, hint: 'Cuenta si firma ≥3 meses y paga su 1er mes' },
          { name: 'first_payment_date', label: 'Primer pago', type: 'date', span: 1 },
          { name: 'active', label: 'Sigue activo (si cancela, el descuento se retira)', type: 'checkbox' },
          { name: 'notes', label: 'Notas', type: 'textarea' },
        ]
      case 'project':
        return [
          { name: 'name', label: 'Nombre del proyecto', required: true, autoFocus: true },
          { name: 'client_id', label: 'Cliente', type: 'select', options: clientOpts, required: true, span: 1 },
          { name: 'project_type', label: 'Tipo', type: 'select', required: true, span: 1, options: [{ value: 'implementacion', label: 'Implementación de producto' }, { value: 'desarrollo', label: 'Desarrollo a la medida' }, { value: 'diagnostico', label: 'Diagnóstico' }, { value: 'soporte', label: 'Soporte / mejora' }] },
          { name: 'status', label: 'Estado', type: 'select', options: toOpts(PROJECT_STATUS), required: true, span: 1 },
          { name: 'priority', label: 'Prioridad', type: 'select', options: toOpts(PRIORITY), required: true, span: 1 },
          { name: 'start_date', label: 'Inicio', type: 'date', span: 1 },
          { name: 'go_live_date', label: 'Salida a producción (H5)', type: 'date', span: 1, hint: 'El calendario VELERO se arma hacia atrás desde aquí' },
          { name: 'estimated_hours', label: 'Horas estimadas', type: 'number', span: 1 },
          { name: 'budget', label: 'Monto del proyecto', type: 'money', span: 1 },
          { name: 'manager_id', label: 'Responsable', type: 'select', options: userOpts, span: 1 },
          { name: 'opportunity_id', label: 'Oportunidad', type: 'select', span: 1, options: opps.map((o) => ({ value: o.id, label: o.title })) },
          { name: 'freeze_window', label: 'Ventana de congelamiento', placeholder: 'Temporada alta del cliente' },
          { name: 'description', label: 'Alcance', type: 'textarea' },
          { name: 'with_velero', label: 'Crear fases VELERO (H1–H7) automáticamente', type: 'checkbox', show: () => !isEdit },
        ]
      case 'phase':
        return [
          { name: 'milestone_name', label: 'Hito de salida', required: true },
          { name: 'status', label: 'Estado', type: 'select', options: [{ value: 'pendiente', label: 'Pendiente' }, { value: 'en_curso', label: 'En curso' }, { value: 'hecho', label: 'Hecho' }, { value: 'bloqueado', label: 'Bloqueado' }], required: true, span: 1 },
          { name: 'owner_id', label: 'Responsable', type: 'select', options: userOpts, span: 1 },
          { name: 'start_date', label: 'Inicio', type: 'date', span: 1 },
          { name: 'due_date', label: 'Fecha meta', type: 'date', span: 1 },
          { name: 'done_date', label: 'Fecha real', type: 'date', span: 1 },
          { name: 'estimated_hours', label: 'Horas estimadas', type: 'number', step: 0.5, span: 1 },
          { name: 'notes', label: 'Notas / qué se hace', type: 'textarea' },
        ]
      case 'profile':
        return [
          { name: 'full_name', label: 'Nombre', required: true, autoFocus: true },
          { name: 'email', label: 'Correo (inicio de sesión)', type: 'email' },
          { name: 'roles', label: 'Roles', type: 'multiselect', options: ROLES },
          { name: 'hourly_cost', label: 'Costo interno por hora', type: 'money', span: 1, hint: 'Para margen por proyecto' },
          { name: 'active', label: 'Activo', type: 'checkbox', span: 1 },
        ]
    }
  }, [kind, clientOpts, userOpts, productOpts, projectOpts, opps, invoices, subs, clients, products, settings.iva_rate, isEdit, record, state.defaults])

  const initial = useMemo(() => {
    if (record) {
      const r = { ...record }
      if (kind === 'interaction' && typeof r.occurred_at === 'string') r.occurred_at = r.occurred_at.slice(0, 10)
      return r
    }
    const base: Record<string, unknown> = {}
    switch (kind) {
      case 'lead': Object.assign(base, { status: 'nuevo', owner_id: me?.id }); break
      case 'client': Object.assign(base, { status: 'prospecto', importance: 'media', account_manager_id: me?.id, relationship_start: today }); break
      case 'contact': Object.assign(base, { is_primary: false, is_approver: false }); break
      case 'opportunity': Object.assign(base, { stage: 'primer_contacto', probability: 10, service_type: 'saas', owner_id: me?.id, estimated_mrr: 0, estimated_value: 0, next_followup_date: addBusinessDays(today, 3) }); break
      case 'task': Object.assign(base, { kind: 'tarea', priority: 'media', status: 'pendiente', assigned_to: me?.id, due_date: today }); break
      case 'interaction': Object.assign(base, { kind: 'whatsapp', occurred_at: today, user_id: me?.id }); break
      case 'ticket': Object.assign(base, { category: 'incidencia', priority: 'media', status: 'nuevo', assigned_to: me?.id }); break
      case 'time': Object.assign(base, { date: today, user_id: me?.id, billable: true }); break
      case 'change': Object.assign(base, { requested_date: today, status: 'registrado' }); break
      case 'document': Object.assign(base, { kind: 'otro', status: 'borrador' }); break
      case 'payment': Object.assign(base, { payment_date: today, method: 'transferencia' }); break
      case 'invoice': Object.assign(base, { issue_date: today, due_date: addDays(today, 7), status: 'emitida' }); break
      case 'subscription': Object.assign(base, { status: 'pendiente', quantity: 1, apply_referrals: true, setup_fee_waived: false, min_term_months: 6, price_floor: settings.referral_floor }); break
      case 'product': Object.assign(base, { kind: 'saas', billing: 'mensual', active: true }); break
      case 'referral': Object.assign(base, { active: true, signed_date: today }); break
      case 'project': Object.assign(base, { status: 'planeacion', priority: 'media', project_type: 'implementacion', start_date: today, manager_id: me?.id, with_velero: true }); break
      case 'profile': Object.assign(base, { active: true, roles: ['comercial'], hourly_cost: settings.default_hourly_cost }); break
    }
    return { ...base, ...state.defaults }
  }, [record, kind, me?.id, today, settings, state.defaults])

  // Ajustes automáticos mientras se captura
  const onChange = (v: Record<string, unknown>) => {
    if (kind === 'opportunity') {
      const st = STAGES.find((s) => s.key === v.stage)
      if (st && v.__lastStage !== v.stage) return { ...v, probability: st.probability, __lastStage: v.stage }
    }
    if (kind === 'invoice') {
      if (v.__lastSub !== v.subtotal) {
        const sub = Number(v.subtotal) || 0
        const tax = Math.round(sub * settings.iva_rate * 100) / 100
        return { ...v, tax, total: Math.round((sub + tax) * 100) / 100, __lastSub: v.subtotal }
      }
    }
    if (kind === 'subscription' && v.product_id && v.__lastProd !== v.product_id) {
      const p = products.find((x) => x.id === v.product_id)
      if (p) return { ...v, list_price: p.list_price, unit_price: p.intro_price ?? p.list_price, setup_fee: p.setup_fee ?? 0, __lastProd: v.product_id }
    }
    if (kind === 'payment' && v.invoice_id && v.__lastInv !== v.invoice_id) {
      const inv = invoices.find((x) => x.id === v.invoice_id)
      if (inv) return { ...v, client_id: inv.client_id, amount: v.amount || inv.total, __lastInv: v.invoice_id }
    }
  }

  const save = async (vals: Record<string, unknown>) => {
    const table = TABLE[kind]
    const data = { ...vals }
    if (kind === 'interaction') data.occurred_at = `${data.occurred_at}T${new Date().toTimeString().slice(0, 8)}`
    if (kind === 'opportunity' && (data.stage === 'ganada' || data.stage === 'perdida') && !record?.closed_at) data.closed_at = today
    if (kind === 'task' && data.status === 'hecha' && !record?.completed_at) data.completed_at = new Date().toISOString()
    if (kind === 'phase' && data.status === 'hecho' && !data.done_date) data.done_date = today
    if (kind === 'change' && (data.status === 'aprobado' || data.status === 'hecho') && !data.approved_date) data.approved_date = today
    if (kind === 'ticket' && data.status !== 'nuevo' && !record?.first_response_at) data.first_response_at = new Date().toISOString()
    if (kind === 'ticket' && (data.status === 'resuelto' || data.status === 'cerrado') && !record?.resolved_at) data.resolved_at = new Date().toISOString()
    const withVelero = data.with_velero
    delete data.with_velero
    // Campos de contexto que no están en el formulario (p. ej. project_id de un cambio)
    if (!isEdit && state.defaults) for (const [k, val] of Object.entries(state.defaults)) if (!(k in data)) data[k] = val
    let saved: { id: string }
    if (isEdit) saved = await update(table, record!.id!, data as Partial<Tables[typeof table]>)
    else saved = await insert(table, data as Partial<Tables[typeof table]>)

    if (kind === 'project' && !isEdit && withVelero) await createVeleroPhases(saved as Tables['projects'], insert, me?.id)
    if (kind === 'change' && !isEdit) {
      const pr = projects.find((p) => p.id === data.project_id)
      if (pr && !data.client_id) await update('change_requests', saved.id, { client_id: pr.client_id }, { silent: true })
    }
    state.onSaved?.(saved)
    onClose()
    if (!isEdit && !state.onSaved) {
      if (kind === 'client') navigate(`/clientes/${saved.id}`)
      if (kind === 'project') navigate(`/proyectos/${saved.id}`)
    }
  }

  const title = `${isEdit ? 'Editar' : FEM.has(kind) ? 'Nueva' : 'Nuevo'} ${TITLES[kind]}`
  return (
    <Drawer open onClose={onClose} title={title} width={kind === 'client' || kind === 'invoice' || kind === 'subscription' ? 600 : 520}>
      <RecordForm fields={fields} initial={initial} onSubmit={save} onCancel={onClose} onChange={onChange} submitLabel={isEdit ? 'Guardar cambios' : 'Crear'} />
    </Drawer>
  )
}

export async function createVeleroPhases(
  p: Tables['projects'],
  insert: <T extends TableName>(t: T, r: Partial<Tables[T]>, o?: { silent?: boolean }) => Promise<Tables[T]>,
  ownerId?: string | null,
) {
  // Fecha de salida primero, hacia atrás (plantilla VELERO). Sin go-live, se arma hacia adelante.
  const start = p.start_date ?? todayISO()
  let dates: { start: string; due: string }[] = []
  if (p.go_live_date) {
    const golive = p.go_live_date
    const back = [...VELERO.slice(0, 4)].reverse()
    let cursor = addDays(golive, -1)
    const pre: { start: string; due: string }[] = []
    for (const ph of back) {
      const due = cursor
      const s = addDays(due, -(ph.days - 1))
      pre.unshift({ start: s < start ? start : s, due })
      cursor = addDays(s, -1)
    }
    if (pre[0] && pre[0].start > start) pre[0].start = start
    dates = [...pre, { start: golive, due: golive }, { start: golive, due: addDays(golive, 14) }, { start: addDays(golive, 28), due: addDays(golive, 35) }]
  } else {
    let cursor = start
    dates = VELERO.map((ph) => {
      const s = cursor
      const due = addDays(s, ph.days - 1)
      cursor = addDays(due, 1)
      return { start: s, due }
    })
  }
  for (let i = 0; i < VELERO.length; i++) {
    const ph = VELERO[i]
    await insert(
      'project_phases',
      { project_id: p.id, sort: i + 1, letter: ph.letter, name: ph.name, milestone: ph.milestone, milestone_name: ph.milestone_name, start_date: dates[i].start, due_date: dates[i].due, status: 'pendiente', owner_id: ownerId ?? null, estimated_hours: ph.hours },
      { silent: true },
    )
  }
}

export function stageOf(s: Stage) {
  return STAGES.find((x) => x.key === s)
}
