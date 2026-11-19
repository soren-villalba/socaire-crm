// Carga inicial con la información real de la carpeta de socaire (al 19 nov 2026):
// pipeline (04_Ventas/01_Pipeline_Prospectos.md), cotizaciones SOC-2026-001/002/003,
// ficha y roadmap VELERO de Bodega de Flores Brenda y pendientes legales/fiscales.

import type { DB, Tables, TableName } from './types'
import { emptyDB } from './types'
import { uid } from './format'
import { DEFAULT_SETTINGS } from './constants'

export function buildSeed(): DB {
  const db = emptyDB()
  const now = new Date().toISOString()
  function add<T extends TableName>(table: T, row: Partial<Tables[T]>): Tables[T] {
    const full = { id: uid(), created_at: now, updated_at: now, created_by: null, deleted_at: null, ...row } as Tables[T]
    ;(db[table] as Tables[T][]).push(full)
    return full
  }

  // Usuarios internos
  const yo = add('profiles', { full_name: 'Tú (fundador)', email: 'hola@alsocaire.com', roles: ['admin', 'direccion', 'comercial', 'desarrollo', 'soporte'], hourly_cost: 400, active: true })
  const papa = add('profiles', { full_name: 'Tu papá (alta y asesoría)', email: '', roles: ['comercial', 'soporte'], hourly_cost: 250, active: true })

  add('settings', { key: 'app', value: DEFAULT_SETTINGS })

  // Catálogo (03_Servicios/00_Catalogo_de_Servicios.md + cotizaciones)
  const pedidos = add('products', { name: 'Socaire Pedidos', kind: 'saas', billing: 'mensual', unit: 'sucursal', list_price: 1600, intro_price: 1000, setup_fee: 4500, active: true, description: 'Sistema de pedidos para florerías. Precio por sucursal; alta incluye catálogo, sucursal, configuración y capacitación.' })
  const crm = add('products', { name: 'CRM a la medida', kind: 'desarrollo', billing: 'unico', unit: 'proyecto', list_price: 0, active: true, description: 'Módulos activables según el negocio. Desarrollo + suscripción.' })
  add('products', { name: 'Automatización n8n', kind: 'desarrollo', billing: 'unico', unit: 'proyecto', list_price: 0, active: true, description: 'Flujos entre herramientas. Por proyecto + mantenimiento.' })
  add('products', { name: 'WhatsApp API', kind: 'saas', billing: 'mensual', unit: 'cuenta', list_price: 0, active: true, description: 'Atención y avisos automatizados. Setup + mensual.' })
  add('products', { name: 'Integración de herramientas', kind: 'desarrollo', billing: 'unico', unit: 'proyecto', list_price: 0, active: true })
  add('products', { name: 'Capacitación', kind: 'servicio', billing: 'unico', unit: 'sesión', list_price: 0, active: true })
  add('products', { name: 'Mantenimiento', kind: 'servicio', billing: 'mensual', unit: 'cliente', list_price: 0, active: true, description: 'Soporte y mejoras por suscripción.' })
  const diag = add('products', { name: 'Estudio y diagnóstico', kind: 'servicio', billing: 'unico', unit: 'proyecto', list_price: 0, active: true, description: 'Diagnóstico previo al desarrollo a la medida (p. ej. VIDRIO).' })
  add('products', { name: 'Actualización / cambio de alcance', kind: 'desarrollo', billing: 'por_hora', unit: 'hora', list_price: 0, active: true, description: 'Cambios fuera del plan inicial (SOP 6).' })

  // Clientes y prospectos
  const brenda = add('clients', {
    company_name: 'Bodega de Flores Brenda', industry: 'Florería', size: '5 sucursales', status: 'activo', acquisition_source: 'directo',
    account_manager_id: yo.id, importance: 'alta', relationship_start: '2026-11-12', total_branches: 5,
    peak_seasons: '12 dic, 24 dic, 14 feb, 10 may. Congelamiento 8–26 dic.',
    folder_path: '06_Clientes/Activos/Bodega_de_Flores_Brenda',
    notes: 'Arranca con 1 de sus 5 sucursales para probar. Facturación: persona física, CFDI mensual. Datos fiscales pendientes.',
  })
  const nelly = add('clients', { company_name: 'Flores Nelly', industry: 'Florería', status: 'prospecto', importance: 'media', account_manager_id: yo.id, notes: 'Cotización SOC-2026-001 emitida 9 nov; estado por confirmar.' })
  const vidriera = add('clients', { company_name: 'Vidriera Mar de Cristal', industry: 'Vidriería (manufactura)', status: 'prospecto', importance: 'alta', account_manager_id: yo.id, notes: 'Primera necesidad: control de empaque (recibido, usado, turno, quién revisa, fecha). Propuesta de diagnóstico VIDRIO.' })
  const baken = add('clients', { company_name: 'Baken Pastries', industry: 'Repostería', status: 'prospecto', importance: 'media', account_manager_id: yo.id, notes: 'En plática. Presentar copia adaptada de Socaire Pedidos.' })

  add('contacts', { client_id: brenda.id, name: 'Brenda', role: 'Dueña', is_primary: true, is_approver: true, notes: 'Falta definir la persona que da seguimiento.' })

  // Sucursales (distribución de Socaire Pedidos)
  const sub = add('subscriptions', {
    client_id: brenda.id, product_id: pedidos.id, status: 'pendiente', quantity: 1, list_price: 1600, unit_price: 1000, price_floor: 800,
    apply_referrals: true, start_date: '2026-12-04', billing_day: 4, min_term_months: 6, setup_fee: 4500, setup_fee_waived: true,
    notes: 'Precio introductorio. Alta bonificada con 6 meses de permanencia; si cancela antes se cobra proporcional. Referidos −100/−50/−50 (piso $800) si firman en los primeros 6 meses.',
  })
  add('branches', { client_id: brenda.id, name: 'Sucursal 1 (piloto)', subscription_id: sub.id, notes: 'Dirección y horario: pendientes (lista FLORES).' })
  for (let i = 2; i <= 5; i++) add('branches', { client_id: brenda.id, name: `Sucursal ${i}`, subscription_id: null })

  // Oportunidades
  const opBrenda = add('opportunities', { client_id: brenda.id, title: 'Socaire Pedidos · 1 sucursal', service_type: 'saas', product_id: pedidos.id, stage: 'ganada', estimated_value: 0, estimated_mrr: 1000, probability: 100, expected_close_date: '2026-11-12', closed_at: '2026-11-12', owner_id: yo.id })
  add('opportunities', { client_id: brenda.id, title: 'Ampliar a sucursales 2–5', description: 'Puerta de decisión en la revisión del 8 ene 2027: si la prueba fue buena, proponer sucursales 2–5 ($1,000 c/u, alta bonificada) y pedir referidos antes del 10 may.', service_type: 'saas', product_id: pedidos.id, stage: 'calificacion', estimated_value: 0, estimated_mrr: 4000, probability: 40, expected_close_date: '2027-01-15', owner_id: yo.id, next_followup_date: '2027-01-08', next_step: 'Revisión mensual H7 y propuesta de ampliación' })
  const opNelly = add('opportunities', { client_id: nelly.id, title: 'Socaire Pedidos · 1 sucursal', service_type: 'saas', product_id: pedidos.id, stage: 'propuesta', estimated_value: 0, estimated_mrr: 1000, probability: 50, expected_close_date: '2026-12-09', owner_id: yo.id, next_followup_date: '2026-11-26', next_step: 'Dar seguimiento a la cotización antes de que venza (9 dic)' })
  const opVid = add('opportunities', { client_id: vidriera.id, title: 'Diagnóstico VIDRIO + software a la medida', description: 'Propuesta de diagnóstico gratuito (2 semanas) y cotización SOC-2026-002.', service_type: 'a_medida', product_id: crm.id, stage: 'propuesta', estimated_value: 0, estimated_mrr: 0, probability: 40, owner_id: yo.id, next_followup_date: '2026-11-24', next_step: 'Agendar visita de diagnóstico VIDRIO' })
  add('opportunities', { client_id: baken.id, title: 'Socaire Pedidos adaptado para repostería', service_type: 'saas', product_id: pedidos.id, stage: 'primer_contacto', estimated_value: 0, estimated_mrr: 1000, probability: 15, owner_id: yo.id, next_followup_date: '2026-11-25', next_step: 'Presentar copia adaptada de Socaire Pedidos (demo)' })

  // Cotizaciones (mismas condiciones en las tres)
  const conditions =
    'Vigencia 30 días. Bonificación del alta con permanencia mínima de 6 meses; si cancela antes, el alta se cobra proporcional. Referidos: −$100, −$50, −$50 por sucursal (piso $800) si firman en los primeros 6 meses; el referido paga su alta con 50% de descuento ($450). Cambios fuera del plan inicial se cotizan aparte. Precios en MXN, IVA aparte.'
  const mkQuote = (folio: string, client_id: string, opportunity_id: string, status: 'enviada' | 'aceptada', file: string, accepted?: string) => {
    const q = add('quotes', { folio, version: 1, client_id, opportunity_id, issue_date: '2026-11-09', valid_until: '2026-12-09', status, title: 'Socaire Pedidos, el sistema de pedidos para tus florerías', conditions, file_path: file, accepted_at: accepted ?? null })
    add('quote_items', { quote_id: q.id, product_id: pedidos.id, description: 'Socaire Pedidos, por sucursal (precio introductorio −$600)', kind: 'mensual', quantity: 1, unit_price: 1600, discount: 600, sort: 1 })
    add('quote_items', { quote_id: q.id, product_id: pedidos.id, description: 'Alta: catálogo, sucursales, configuración y capacitación (bonificada)', kind: 'unico', quantity: 1, unit_price: 4500, discount: 4500, sort: 2 })
    return q
  }
  mkQuote('SOC-2026-001', nelly.id, opNelly.id, 'enviada', '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-001.pdf')
  mkQuote('SOC-2026-002', vidriera.id, opVid.id, 'enviada', '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-002.pdf')
  const q3 = mkQuote('SOC-2026-003', brenda.id, opBrenda.id, 'aceptada', '06_Clientes/Activos/Bodega_de_Flores_Brenda/02_Contrato_y_Cotizacion/Cotizacion_SOC-2026-003.pdf', '2026-11-12')
  db.subscriptions[0].quote_id = q3.id

  // Proyecto de implementación VELERO de Brenda (roadmap 13 nov)
  const proj = add('projects', {
    client_id: brenda.id, opportunity_id: opBrenda.id, quote_id: q3.id, name: 'Implementación Socaire Pedidos · Brenda', project_type: 'implementacion',
    status: 'en_curso', priority: 'alta', start_date: '2026-11-13', go_live_date: '2026-12-04', estimated_end_date: '2027-01-08', estimated_hours: 25, manager_id: yo.id,
    freeze_window: '8–26 dic (temporada alta). Si H5 no es antes del lun 7 dic, la salida pasa al lun 11 ene 2027.',
    notes: 'Salida en paralelo con su método actual. Brenda conserva su método como respaldo hasta pasar el 12 dic.',
  })
  const phases: [string, string, string, string, string, string, string, number, string][] = [
    ['V', 'Validar', 'H1', 'Alcance y condiciones aceptados por escrito', '2026-11-13', '2026-11-17', yo.id, 2, 'Confirmar 1 sucursal y condiciones, datos fiscales, aviso de privacidad, carpeta y ficha, kickoff.'],
    ['E', 'Entrada de datos', 'H2', 'Paquete de información completo (FLORES)', '2026-11-18', '2026-11-23', papa.id, 3, 'Kickoff 60–90 min y checklist FLORES.'],
    ['L', 'Levantar', 'H3', 'Ambiente listo y revisado', '2026-11-23', '2026-11-27', yo.id, 8, 'Depende del esquema multi-cliente.'],
    ['E', 'Ensayar', 'H4', 'Demo aprobada y equipo capacitado', '2026-11-30', '2026-12-03', papa.id, 5, '10 pedidos de prueba, capacitación, guía de 1 página.'],
    ['R', 'Rumbo a producción', 'H5', 'Primer pedido real (go-live)', '2026-12-04', '2026-12-04', papa.id, 3, 'Salida en paralelo, canal único de soporte, primer CFDI.'],
    ['O', 'Observar', 'H6', 'Acta de entrega firmada', '2026-12-04', '2026-12-18', yo.id, 3, 'Acompañamiento diario 2 semanas, bitácora de incidencias.'],
    ['O', 'Observar', 'H7', 'Revisión mensual y puerta de ampliación', '2027-01-04', '2027-01-08', yo.id, 1, 'Medir contra la línea base; pedir referidos.'],
  ]
  phases.forEach(([letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes], i) =>
    add('project_phases', { project_id: proj.id, sort: i + 1, letter, name, milestone, milestone_name, start_date, due_date, owner_id, estimated_hours, notes, status: i === 0 ? 'en_curso' : 'pendiente' }),
  )

  // Tareas (pendientes reales de roadmap, hitos y legales)
  const t = (title: string, due_date: string, assigned_to: string, client_id: string | null, related_type: Tables['tasks']['related_type'], related_id: string | null, priority: 'alta' | 'media' | 'baja' = 'media', kind: Tables['tasks']['kind'] = 'tarea', description?: string) =>
    add('tasks', { title, due_date, assigned_to, client_id, related_type, related_id, priority, kind, status: 'pendiente', description })
  t('Confirmar a Brenda por escrito: 1 sucursal, $1,000/mes desde el 4 dic', '2026-11-17', yo.id, brenda.id, 'project', proj.id, 'alta', 'compromiso')
  t('Pedir a Brenda datos fiscales para el CFDI', '2026-11-17', yo.id, brenda.id, 'client', brenda.id, 'alta', 'tarea', 'Nombre completo, RFC, CP fiscal, régimen, uso de CFDI y correo.')
  t('Definir quién da seguimiento y aprueba del lado de Brenda', '2026-11-18', papa.id, brenda.id, 'client', brenda.id, 'alta')
  t('Recibir paquete FLORES completo', '2026-11-23', papa.id, brenda.id, 'project', proj.id, 'alta', 'compromiso')
  t('Cerrar y probar el esquema multi-cliente de Socaire Pedidos', '2026-11-23', yo.id, brenda.id, 'project', proj.id, 'alta')
  t('Aviso de privacidad listo (revisión legal) antes del go-live', '2026-12-03', yo.id, brenda.id, 'client', brenda.id, 'alta')
  t('Confirmar régimen y emisión de CFDI como persona física con contador', '2026-12-03', yo.id, null, null, null, 'alta')
  t('Firmar acuerdo de colaboración y confidencialidad (papá)', '2026-11-27', yo.id, null, null, null, 'media')
  t('Emitir primer CFDI de Brenda (go-live)', '2026-12-04', yo.id, brenda.id, 'client', brenda.id, 'alta')
  t('Seguimiento a cotización SOC-2026-001', '2026-11-26', yo.id, nelly.id, 'opportunity', opNelly.id, 'media', 'llamada')
  t('Agendar visita de diagnóstico VIDRIO', '2026-11-24', yo.id, vidriera.id, 'opportunity', opVid.id, 'media', 'llamada')
  t('Constituir SAS (acta y RFC)', '2027-02-15', yo.id, null, null, null, 'media')

  // Interacciones conocidas
  const ia = (client_id: string, kind: Tables['interactions']['kind'], summary: string, date: string, opportunity_id?: string) =>
    add('interactions', { client_id, kind, summary, occurred_at: `${date}T12:00:00`, user_id: yo.id, opportunity_id: opportunity_id ?? null })
  ia(nelly.id, 'nota', 'Cotización SOC-2026-001 emitida (Socaire Pedidos, 1 sucursal, $1,000/mes).', '2026-11-09', opNelly.id)
  ia(vidriera.id, 'nota', 'Cotización SOC-2026-002 y propuesta de diagnóstico VIDRIO emitidas.', '2026-11-09', opVid.id)
  ia(brenda.id, 'nota', 'Cotización SOC-2026-003 emitida.', '2026-11-09', opBrenda.id)
  ia(brenda.id, 'whatsapp', 'Brenda acepta la cotización para 1 sucursal (de 5) para probar.', '2026-11-12', opBrenda.id)
  ia(brenda.id, 'nota', 'Roadmap VELERO armado: go-live 4 dic, congelamiento 8–26 dic, revisión 8 ene 2027.', '2026-11-13')

  // Documentos (rutas relativas a la carpeta de socaire)
  const doc = (name: string, kind: Tables['documents']['kind'], status: Tables['documents']['status'], location: string, client_id: string | null, project_id: string | null = null) =>
    add('documents', { name, kind, status, location, client_id, project_id })
  doc('Cotización SOC-2026-003', 'cotizacion', 'aprobado', '06_Clientes/Activos/Bodega_de_Flores_Brenda/02_Contrato_y_Cotizacion/Cotizacion_SOC-2026-003.pdf', brenda.id)
  doc('Roadmap de entrega VELERO v1', 'roadmap', 'borrador', '06_Clientes/Activos/Bodega_de_Flores_Brenda/03_Plan_de_Trabajo/2026-11-13_Roadmap_Entrega_Brenda_v1.md', brenda.id, proj.id)
  doc('Minuta de kickoff', 'minuta', 'borrador', '06_Clientes/Activos/Bodega_de_Flores_Brenda/08_Minutas/2026-11-18_Minuta_Kickoff_Brenda_v1.md', brenda.id, proj.id)
  doc('Acta de entrega', 'acta', 'borrador', '06_Clientes/Activos/Bodega_de_Flores_Brenda/05_Entregables/Acta_Entrega_Brenda_BORRADOR.md', brenda.id, proj.id)
  doc('Aviso de privacidad para compradores', 'aviso_privacidad', 'borrador', '07_Legal_Fiscal/Aviso_de_Privacidad/2026-11-13_Aviso_Compradores_Brenda_BORRADOR.md', brenda.id)
  doc('Cotización SOC-2026-001', 'cotizacion', 'enviado', '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-001.pdf', nelly.id)
  doc('Cotización SOC-2026-002', 'cotizacion', 'enviado', '04_Ventas/Cotizaciones/Cotizacion_SOC-2026-002.pdf', vidriera.id)
  doc('Propuesta de diagnóstico VIDRIO', 'propuesta', 'enviado', '04_Ventas/Propuestas/Socaire_Propuesta_Diagnostico_Vidriera.pdf', vidriera.id)
  doc('Acuerdo de colaboración y confidencialidad (papá)', 'contrato', 'borrador', '07_Legal_Fiscal/Contratos/2026-11-13_Acuerdo_Colaboracion_Confidencialidad_BORRADOR.md', null)
  doc('Cláusulas de tratamiento de datos', 'contrato', 'borrador', '07_Legal_Fiscal/Contratos/2026-11-13_Clausulas_Tratamiento_Datos_BORRADOR.md', null)

  void diag
  return db
}
