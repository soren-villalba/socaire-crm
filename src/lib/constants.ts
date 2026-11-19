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
}
export type Settings = typeof DEFAULT_SETTINGS
