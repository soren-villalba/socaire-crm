import { ExternalLink, File, FileSpreadsheet, FileText, Folder, ClipboardList, HardDrive, Presentation, type LucideIcon } from 'lucide-react'
import { parseDrive, type DriveKind } from '../lib/drive'

const ICONS: Record<DriveKind, LucideIcon> = {
  folder: Folder,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  form: ClipboardList,
  file: File,
  drive: HardDrive,
}

export function DriveIcon({ kind, size = 14 }: { kind: DriveKind; size?: number }) {
  const Icon = ICONS[kind]
  return <Icon size={size} className="shrink-0" />
}

/** Botón "Abrir carpeta en Drive". No se muestra nada si la liga no es de Drive. */
export function DriveFolderButton({ url, className = 'btn-secondary btn-sm', label = 'Carpeta en Drive' }: { url?: string | null; className?: string; label?: string }) {
  const d = parseDrive(url)
  if (!d) return null
  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className={className} title="Abrir en Google Drive (pestaña nueva)" onClick={(e) => e.stopPropagation()}>
      <DriveIcon kind={d.kind} size={13} /> {label} <ExternalLink size={11} />
    </a>
  )
}

/** Valor para la ficha: liga de Drive con ícono, o aviso si la liga no es válida. */
export function DriveFolderValue({ url }: { url?: string | null }) {
  if (!url) return null
  const d = parseDrive(url)
  if (!d) return <span className="text-xs text-amber-600">Liga no válida de Drive</span>
  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
      <DriveIcon kind={d.kind} size={13} /> Abrir carpeta <ExternalLink size={11} />
    </a>
  )
}
