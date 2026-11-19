import type { Stage } from './types'

export type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'violet'

export const STAGES: { key: Stage; label: string; hint: string; probability: number }[] = [
  { key: 'nuevo', label: 'Nuevo prospecto', hint: 'Contacto identificado', probability: 5 },
  { key: 'primer_contacto', label: 'Primer contacto', hint: 'Se inició comunicación', probability: 10 },
  { key: 'calificacion', label: 'Calificación', hint: 'Necesidad y presupuesto', probability: 20 },
  { key: 'diagnostico', label: 'Diagnóstico', hint: 'Alcance de la solución', probability: 40 },
  { key: 'propuesta', label: 'Propuesta enviada', hint: 'Cotización presentada', probability: 50 },
  { key: 'negociacion', label: 'Negociación', hint: 'Ajustes y condiciones', probability: 70 },
  { key: 'ganada', label: 'Ganada', hint: 'Venta cerrada', probability: 100 },
  { key: 'perdida', label: 'Perdida', hint: 'Motivo documentado', probability: 0 },
]
export const OPEN_STAGES: Stage[] = ['nuevo', 'primer_contacto', 'calificacion', 'diagnostico', 'propuesta', 'negociacion']
export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)?.label ?? s

type LabelMap = Record<string, { label: string; tone: Tone }>

export const CLIENT_STATUS: LabelMap = {
  prospecto: { label: 'Prospecto', tone: 'blue' },
  activo: { label: 'Activo', tone: 'green' },
  en_riesgo: { label: 'En riesgo', tone: 'amber' },
  inactivo: { label: 'Inactivo', tone: 'neutral' },
  perdido: { label: 'Perdido', tone: 'red' },
}
export const LEAD_STATUS: LabelMap = {
  nuevo: { label: 'Nuevo', tone: 'blue' },
  contactado: { label: 'Contactado', tone: 'brand' },
  calificado: { label: 'Calificado', tone: 'green' },
  descartado: { label: 'Descartado', tone: 'neutral' },
  convertido: { label: 'Convertido', tone: 'violet' },
}
export const QUOTE_STATUS: LabelMap = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  enviada: { label: 'Enviada', tone: 'blue' },
  aceptada: { label: 'Aceptada', tone: 'green' },
  rechazada: { label: 'Rechazada', tone: 'red' },
  vencida: { label: 'Vencida', tone: 'amber' },
  reemplazada: { label: 'Reemplazada', tone: 'neutral' },
}
export const SUB_STATUS: LabelMap = {
  pendiente: { label: 'Por arrancar', tone: 'amber' },
  activa: { label: 'Activa', tone: 'green' },
  pausada: { label: 'Pausada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'red' },
}
export const INVOICE_STATUS: LabelMap = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  emitida: { label: 'Emitida', tone: 'blue' },
  cancelada: { label: 'Cancelada', tone: 'red' },
}
export const PAY_STATUS: LabelMap = {
  pagada: { label: 'Pagada', tone: 'green' },
  parcial: { label: 'Pago parcial', tone: 'amber' },
  pendiente: { label: 'Por cobrar', tone: 'blue' },
  vencida: { label: 'Vencida', tone: 'red' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
  borrador: { label: 'Borrador', tone: 'neutral' },
}
export const PROJECT_STATUS: LabelMap = {
  planeacion: { label: 'Planeación', tone: 'blue' },
  en_curso: { label: 'En curso', tone: 'brand' },
  en_pausa: { label: 'En pausa', tone: 'amber' },
  completado: { label: 'Completado', tone: 'green' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
}
export const PHASE_STATUS: LabelMap = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'brand' },
  hecho: { label: 'Hecho', tone: 'green' },
  bloqueado: { label: 'Bloqueado', tone: 'red' },
}
export const CHANGE_STATUS: LabelMap = {
  registrado: { label: 'Registrado', tone: 'neutral' },
  estimado: { label: 'Estimado', tone: 'blue' },
  cotizado: { label: 'Cotizado', tone: 'brand' },
  aprobado: { label: 'Aprobado', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
  hecho: { label: 'Hecho', tone: 'violet' },
}
export const TASK_STATUS: LabelMap = {
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'brand' },
  hecha: { label: 'Hecha', tone: 'green' },
}
export const PRIORITY: LabelMap = {
  alta: { label: 'Alta', tone: 'red' },
  media: { label: 'Media', tone: 'amber' },
  baja: { label: 'Baja', tone: 'neutral' },
}
export const TICKET_STATUS: LabelMap = {
  nuevo: { label: 'Nuevo', tone: 'blue' },
  asignado: { label: 'Asignado', tone: 'brand' },
  en_proceso: { label: 'En proceso', tone: 'brand' },
  esperando_cliente: { label: 'Esperando al cliente', tone: 'amber' },
  resuelto: { label: 'Resuelto', tone: 'green' },
  cerrado: { label: 'Cerrado', tone: 'neutral' },
}

export const SERVICE_TYPES = [
  { value: 'saas', label: 'Suscripción SaaS' },
  { value: 'a_medida', label: 'Desarrollo a la medida' },
  { value: 'consultoria', label: 'Consultoría / diagnóstico' },
  { value: 'otro', label: 'Otro' },
]
export const SOURCES = [
  { value: 'referido', label: 'Referido' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'directo', label: 'Contacto directo' },
  { value: 'red_personal', label: 'Red personal' },
  { value: 'otro', label: 'Otro' },
]
export const INTERACTION_KINDS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'reunion', label: 'Reunión' },
  { value: 'visita', label: 'Visita' },
  { value: 'correo', label: 'Correo' },
  { value: 'nota', label: 'Nota interna' },
]
export const TASK_KINDS = [
  { value: 'tarea', label: 'Tarea' },
  { value: 'reunion', label: 'Reunión' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'compromiso', label: 'Compromiso con cliente' },
  { value: 'recordatorio', label: 'Recordatorio' },
]
export const PAYMENT_METHODS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
]
export const DOC_KINDS = [
  { value: 'cotizacion', label: 'Cotización' },
  { value: 'propuesta', label: 'Propuesta' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'nda', label: 'NDA' },
  { value: 'aviso_privacidad', label: 'Aviso de privacidad' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'minuta', label: 'Minuta' },
  { value: 'acta', label: 'Acta de entrega' },
  { value: 'factura', label: 'Factura' },
  { value: 'tecnico', label: 'Documentación técnica' },
  { value: 'otro', label: 'Otro' },
]
export const DOC_STATUS: LabelMap = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  enviado: { label: 'Enviado', tone: 'blue' },
  aprobado: { label: 'Aprobado', tone: 'green' },
  firmado: { label: 'Firmado', tone: 'green' },
  cerrado: { label: 'Cerrado', tone: 'neutral' },
}
export const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'direccion', label: 'Dirección' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'desarrollo', label: 'Desarrollo' },
  { value: 'soporte', label: 'Soporte' },
]

// Plantilla del método VELERO (05_Procesos/10_Plantilla_Roadmap_VELERO.md)
export const VELERO = [
  { letter: 'V', name: 'Validar', milestone: 'H1', milestone_name: 'Alcance aceptado por escrito', days: 3, hours: 2 },
  { letter: 'E', name: 'Entrada de datos', milestone: 'H2', milestone_name: 'Paquete de información completo', days: 4, hours: 3 },
  { letter: 'L', name: 'Levantar', milestone: 'H3', milestone_name: 'Ambiente listo y revisado', days: 5, hours: 8 },
  { letter: 'E', name: 'Ensayar', milestone: 'H4', milestone_name: 'Demo aprobada y equipo capacitado', days: 4, hours: 5 },
  { letter: 'R', name: 'Rumbo a producción', milestone: 'H5', milestone_name: 'Primer uso real (go-live)', days: 1, hours: 3 },
  { letter: 'O', name: 'Observar', milestone: 'H6', milestone_name: 'Acta de entrega firmada', days: 14, hours: 3 },
  { letter: 'O', name: 'Observar', milestone: 'H7', milestone_name: 'Primera revisión mensual', days: 21, hours: 1 },
]

export const DEFAULT_SETTINGS = {
  iva_rate: 0.16,
  referral_steps: [100, 50, 50],
  referral_floor: 800,
  referral_window_months: 6,
  weekly_capacity_hours: 15,
  default_hourly_cost: 400,
  followup_stale_days: 7,
  quote_expiry_warning_days: 7,
  invoice_reminder_days: [3, 7],
  fixed_cost_per_package: 1000,
  branches_per_package: 5,
  // SLA de soporte en horas hábiles (lun–vie, horario de abajo). Aprobado el 19 nov 2026.
  sla_alta_hours: 4,
  sla_media_hours: 24,
  sla_baja_hours: 72,
  business_start_hour: 9,
  business_end_hour: 18,
}
export type Settings = typeof DEFAULT_SETTINGS

// ---------- Gastos, servicios, contratos y metas (Entrega B) ----------
// Mismas categorías que la hoja Catálogos del Excel de ingresos y egresos.
export const EXPENSE_CATEGORIES = [
  { value: 'software', label: 'Software y suscripciones' },
  { value: 'hosting', label: 'Hosting y dominios' },
  { value: 'marketing', label: 'Publicidad y marketing' },
  { value: 'honorarios', label: 'Honorarios profesionales' },
  { value: 'equipo', label: 'Equipo y mobiliario' },
  { value: 'viaticos', label: 'Transporte y viáticos' },
  { value: 'comisiones', label: 'Comisiones bancarias' },
  { value: 'impuestos', label: 'Impuestos y contribuciones' },
  { value: 'capacitacion', label: 'Capacitación' },
  { value: 'telefonia', label: 'Internet y telefonía' },
  { value: 'otros', label: 'Otros' },
]
export const expenseCategoryLabel = (v?: string | null) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v ?? '—'
export const EXPENSE_KINDS = [
  { value: 'operativo', label: 'Gasto operativo' },
  { value: 'directo', label: 'Costo directo (de un cliente o proyecto)' },
]
export const EXPENSE_STATUS: LabelMap = {
  pagado: { label: 'Pagado', tone: 'green' },
  pendiente: { label: 'Por pagar', tone: 'amber' },
}
export const ASSET_KINDS = [
  { value: 'dominio', label: 'Dominio' },
  { value: 'hosting', label: 'Hosting / servidor' },
  { value: 'base_datos', label: 'Base de datos' },
  { value: 'repositorio', label: 'Repositorio de código' },
  { value: 'correo', label: 'Correo / workspace' },
  { value: 'software', label: 'Software / licencia' },
  { value: 'api', label: 'Automatización / API' },
  { value: 'diseno', label: 'Diseño / contenido' },
  { value: 'otro', label: 'Otro' },
]
export const COST_TYPES = [
  { value: 'mensual', label: 'Fijo mensual' },
  { value: 'anual', label: 'Fijo anual' },
  { value: 'por_cliente', label: 'Por cliente (mensual)' },
  { value: 'unico', label: 'Pago único' },
  { value: 'gratis', label: 'Gratis' },
]
export const CONTRACT_KINDS = [
  { value: 'servicio_saas', label: 'Servicio SaaS (suscripción)' },
  { value: 'desarrollo', label: 'Desarrollo a la medida' },
  { value: 'nda', label: 'Confidencialidad (NDA)' },
  { value: 'datos', label: 'Tratamiento de datos' },
  { value: 'otro', label: 'Otro' },
]
export const CONTRACT_STATUS: LabelMap = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  enviado: { label: 'Enviado, sin firma', tone: 'amber' },
  firmado: { label: 'Firmado', tone: 'green' },
  terminado: { label: 'Terminado', tone: 'neutral' },
}

export type GoalMetric = 'manual' | 'clientes_activos' | 'facturas' | 'mrr' | 'sucursales' | 'usuarios_activos'
export interface Goal {
  id: string
  name: string
  metric: GoalMetric
  target: number
  due?: string | null
  done?: boolean // solo metas manuales
}
export const GOAL_METRICS: { value: GoalMetric; label: string }[] = [
  { value: 'manual', label: 'Manual (la marco al cumplirla)' },
  { value: 'clientes_activos', label: 'Clientes activos' },
  { value: 'facturas', label: 'Facturas emitidas' },
  { value: 'mrr', label: 'MRR activo ($/mes)' },
  { value: 'sucursales', label: 'Sucursales con servicio' },
  { value: 'usuarios_activos', label: 'Personas en el equipo (usuarios activos)' },
]
// Metas a 12 meses (01_Estrategia/04_Metas_12_meses.md). Se usan si aún no hay metas guardadas.
export const DEFAULT_GOALS: Goal[] = [
  { id: 'g1', name: '10 clientes activos al mismo tiempo', metric: 'clientes_activos', target: 10, due: '2027-11-30' },
  { id: 'g2', name: 'Primera factura (CFDI emitido)', metric: 'facturas', target: 1, due: '2027-03-31' },
  { id: 'g3', name: 'Constituir la SAS (acta y RFC)', metric: 'manual', target: 1, due: '2027-02-28' },
  { id: 'g4', name: 'Contrato base, NDA y aviso de privacidad listos', metric: 'manual', target: 1, due: '2027-02-28' },
  { id: 'g5', name: 'Modelo de suscripción + desarrollo con precios definidos', metric: 'manual', target: 1, due: '2027-01-31' },
  { id: 'g6', name: 'Ecosistema / app propio (MVP)', metric: 'manual', target: 1, due: '2027-11-30' },
  { id: 'g7', name: 'Equipo de 2 a 3 personas', metric: 'usuarios_activos', target: 3, due: '2027-11-30' },
]

// ---------- Checklists (Entrega C) ----------
// SOP 4 (05_Procesos/04_SOP_Onboarding_Cliente.md) y SOP 9 (09_SOP_Cierre_y_Referidos.md).
export const CHECKLIST_TEMPLATES: Record<'onboarding' | 'cierre', { phase: string; label: string }[]> = {
  onboarding: [
    { phase: 'V', label: 'Confirmar por escrito alcance, precio, inicio del cobro y permanencia' },
    { phase: 'V', label: 'Pedir datos fiscales (RFC, CP fiscal, régimen, uso de CFDI, correo)' },
    { phase: 'V', label: 'Crear la carpeta del cliente en Drive y llenar la ficha' },
    { phase: 'V', label: 'Marcar la oportunidad como ganada' },
    { phase: 'V', label: 'Definir quién da seguimiento y aprueba del lado del cliente' },
    { phase: 'V', label: 'Agendar kickoff y enviar la lista de información' },
    { phase: 'V', label: 'Registrar y enviar el contrato (permanencia de 6 meses)' },
    { phase: 'E', label: 'Kickoff de 60–90 min con minuta y línea base' },
    { phase: 'E', label: 'Recibir la información (plazo: 3 días hábiles)' },
    { phase: 'E', label: 'Abrir el canal único de comunicación (grupo de WhatsApp)' },
    { phase: 'E', label: 'Calendario de hitos H1–H7 confirmado con el cliente' },
  ],
  cierre: [
    { phase: 'Cierre', label: 'Enviar encuesta de satisfacción' },
    { phase: 'Cierre', label: 'Pedir permiso y documentar el caso de éxito' },
    { phase: 'Cierre', label: 'Solicitar referido (programa de descuentos)' },
    { phase: 'Cierre', label: 'Pasar a suscripción o soporte mensual' },
    { phase: 'Cierre', label: 'Entregar accesos, manuales y acta de cierre' },
  ],
}

export const TICKET_EVENT_KINDS: Record<string, { label: string; tone: 'brand' | 'blue' | 'neutral' | 'amber' }> = {
  respuesta: { label: 'Respuesta al cliente', tone: 'brand' },
  cliente: { label: 'Mensaje del cliente', tone: 'blue' },
  nota: { label: 'Nota interna', tone: 'amber' },
  estado: { label: 'Cambio de estado', tone: 'neutral' },
}
