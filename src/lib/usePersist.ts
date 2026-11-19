import { useCallback, useState } from 'react'

// Estado de pantalla (búsquedas, filtros, vistas) que se conserva al salir y volver a una
// pantalla. Vive en memoria y en sessionStorage: sobrevive a recargar la pestaña, pero cada
// pestaña o ventana tiene el suyo y se olvida al cerrarla.
const mem = new Map<string, unknown>()
const PREFIX = 'socaire-crm-ui:'

function read<T>(key: string, initial: T): T {
  if (mem.has(key)) return mem.get(key) as T
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (raw != null) {
      const v = JSON.parse(raw) as T
      mem.set(key, v)
      return v
    }
  } catch {
    /* almacenamiento bloqueado */
  }
  return initial
}

export function usePersist<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, typeof initial === 'function' ? (initial as () => T)() : initial))
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        mem.set(key, next)
        try {
          sessionStorage.setItem(PREFIX + key, JSON.stringify(next))
        } catch {
          /* noop */
        }
        return next
      })
    },
    [key],
  )
  return [value, set]
}
