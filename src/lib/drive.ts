// Ligas de Google Drive: el CRM no guarda archivos, solo la liga para abrirlos en Drive.
// Aquí se reconoce qué tipo de elemento es (carpeta, Doc, Hoja…) y se valida que la liga sea segura.

export type DriveKind = 'folder' | 'doc' | 'sheet' | 'slides' | 'form' | 'file' | 'drive'

export interface DriveLink {
  kind: DriveKind
  label: string
  url: string
}

const LABELS: Record<DriveKind, string> = {
  folder: 'Carpeta de Drive',
  doc: 'Documento de Google',
  sheet: 'Hoja de cálculo de Google',
  slides: 'Presentación de Google',
  form: 'Formulario de Google',
  file: 'Archivo en Drive',
  drive: 'Google Drive',
}

const DOCS_KINDS: Record<string, DriveKind> = {
  document: 'doc',
  spreadsheets: 'sheet',
  presentation: 'slides',
  forms: 'form',
}

function toUrl(raw: string | null | undefined): URL | null {
  const s = (raw ?? '').trim()
  if (!/^https?:\/\//i.test(s)) return null
  try {
    return new URL(s)
  } catch {
    return null
  }
}

/** ¿Parece una liga web (y no una ruta de la carpeta local)? */
export function looksLikeUrl(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim().toLowerCase()
  return /^[a-z][a-z0-9+.-]+:/.test(s) || s.startsWith('www.') || s.startsWith('drive.google.') || s.startsWith('docs.google.')
}

/** Liga segura para abrir en otra pestaña: solo https (nunca javascript:, data:, etc.). */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  const u = toUrl(raw)
  return u && u.protocol === 'https:' ? u.href : null
}

/** Reconoce una liga de Google Drive / Docs. Devuelve null si no es de Drive o no es https. */
export function parseDrive(raw: string | null | undefined): DriveLink | null {
  const u = toUrl(raw)
  if (!u || u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  const path = u.pathname
  let kind: DriveKind | null = null
  if (host === 'docs.google.com') {
    const first = path.split('/').filter(Boolean)[0] ?? ''
    kind = DOCS_KINDS[first] ?? 'file'
  } else if (host === 'drive.google.com') {
    if (/\/folders\//.test(path)) kind = 'folder'
    else if (/^\/file\/d\//.test(path) || u.searchParams.has('id')) kind = 'file'
    else kind = 'drive'
  }
  if (!kind) return null
  return { kind, label: LABELS[kind], url: u.href }
}

/** Validación para campos de liga de carpeta de Drive (opcional). */
export function validateDriveFolder(val: unknown): string | undefined {
  const s = String(val ?? '').trim()
  if (!s) return undefined
  const d = parseDrive(s)
  if (!d) return 'Pega la liga de Google Drive (https://drive.google.com/…)'
  if (d.kind !== 'folder' && d.kind !== 'drive') return 'Esta liga es de un archivo; aquí va la liga de una carpeta'
  return undefined
}

/** Validación para la ubicación de un documento: ruta local, liga de Drive o liga https. */
export function validateDocLocation(val: unknown): string | undefined {
  const s = String(val ?? '').trim()
  if (!s || !looksLikeUrl(s)) return undefined
  if (!safeHttpsUrl(s)) return 'La liga debe empezar con https://'
  return undefined
}
