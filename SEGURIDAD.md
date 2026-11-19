# Seguridad del CRM socaire

Resumen de cómo está protegido el CRM y qué hay que configurar a mano. Última revisión: 19 nov 2026.

## Cómo está protegido

| Capa | Protección |
|---|---|
| Sitio (Netlify) | Cabeceras de seguridad en `netlify.toml`: CSP estricta (solo carga código propio, Google Fonts y la API de Supabase del CRM), HSTS, sin iframes, sin cámara/micrófono/ubicación, `noindex`. |
| JavaScript público | No contiene datos del negocio. Los datos iniciales (`src/lib/seed.ts`) solo se compilan en la versión local, nunca cuando hay Supabase configurado. |
| Inicio de sesión | Supabase Auth con correo y contraseña. Registro público apagado; los usuarios se crean a mano. |
| Base de datos | RLS en todas las tablas. Sin sesión no se puede leer ni ejecutar nada. Nadie puede borrar físicamente (solo borrado lógico, auditado). Finanzas solo las escribe Dirección/Administración. |
| Usuarios | Un usuario nuevo entra **inactivo y sin roles** hasta que el administrador lo aprueba en Configuración → Usuarios y roles. Solo el administrador cambia roles, estado, correo o costo/hora. Siempre queda al menos un administrador activo. |
| Auditoría | Cada cambio queda registrado con quién lo hizo (lo fija la base, no el navegador). La app solo ve el resumen; las copias completas se consultan en el panel de Supabase. |

## Orden de los scripts SQL

En un proyecto nuevo: `supabase/instalar-todo.sql` y después `supabase/migrations/0002_seguridad.sql`.
En el proyecto actual: solo `supabase/migrations/0002_seguridad.sql` (se puede correr varias veces).

## Configuración manual (Fase C)

Los nombres de los menús de Supabase y Netlify cambian de vez en cuando; si no encuentras uno, búscalo por el nombre de la opción.

### 1. Verificación en dos pasos en las cuentas (lo más importante)
Quien entre a estas cuentas controla todo el CRM, así que cada una debe tener 2FA con una app de autenticación (Google Authenticator, 1Password, etc.):
- **Supabase**: avatar → Account preferences → Security / Multi-factor authentication.
- **GitHub**: Settings → Password and authentication → Two-factor authentication.
- **Netlify**: User settings → Security → Two-factor authentication.
- **El correo** con el que entras a las tres.

### 2. Supabase → Authentication
- **Sign In / Providers → User Signups**: "Allow new users to sign up" **apagado**.
- **Sign In / Providers → Email**: "Secure email change" y "Secure password change" encendidos.
- **Sign In / Providers → Email → Password**: largo mínimo **12** y requisitos "letras minúsculas, mayúsculas, números y símbolos".
- **URL Configuration**: *Site URL* = la liga de Netlify del CRM. En *Redirect URLs* deja solo esa liga (y `http://localhost:5173` si trabajas en tu PC). Borra cualquier otra.
- **Users**: cambia las contraseñas actuales a unas de 12 o más caracteres si son más cortas.

### 3. Supabase → Advisors → Security Advisor
Después de correr `0002_seguridad.sql`, pulsa *Rerun linter*. No debe haber errores (rojos). Si hay avisos, mándame una captura.

### 4. Respaldos
El plan gratis de Supabase **no** guarda respaldos descargables y **pausa el proyecto tras 7 días sin uso**.
- Cada viernes: CRM → Configuración → Datos y respaldos → **Descargar respaldo**. Guárdalo en la carpeta de socaire (OneDrive), en `13_CRM_Interno/respaldos/`.
- El archivo contiene **todo** el CRM (datos fiscales incluidos): no lo mandes por WhatsApp ni correo.
- Conserva al menos los últimos 4.
- Si se te pasa una semana sin usar el CRM, entra una vez para que el proyecto no se pause.

### 5. Buenas prácticas del día a día
- Nunca pegues en la app, en GitHub ni en un chat la clave `service_role` ni la contraseña de la base de datos.
- La clave `sb_publishable_…` de `netlify.toml` es pública por diseño; está bien que esté ahí.
- Los archivos `.html` de un solo archivo (versión local) guardan datos en el navegador sin cifrar: trátalos como confidenciales.
- Al dar de baja a alguien: Configuración → Usuarios y roles → Inactivo, y en Supabase → Authentication → Users → borrar o bloquear su usuario.
