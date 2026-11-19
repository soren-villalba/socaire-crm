# socaire · CRM interno

CRM + centro de operación de clientes para socaire: comercial, clientes, proyectos (método VELERO), finanzas y actividades en un solo lugar. Pensado para 2 personas y para crecer a 5 sin rehacer la arquitectura.

## Qué responde en menos de un minuto

1. **¿A quién le estamos vendiendo?** → Prospectos, Oportunidades (pipeline), Cotizaciones
2. **¿Qué nos está comprando?** → Ficha de cliente: servicios, sucursales y referidos
3. **¿Qué tenemos que entregar?** → Proyectos VELERO (H1–H7), cambios de alcance, horas
4. **¿Cuánto ganamos y cobramos?** → Finanzas: MRR, cobranza, CFDI, pagos, distribución
5. **¿Qué requiere atención hoy?** → Dashboard: “Atención requerida” y mis tareas

## Usarlo sin instalar nada

En `13_CRM_Interno/` (junto a esta carpeta):

- **`CRM-socaire.html`**: doble clic, entra con tu correo. Está conectado a Supabase y es la versión de trabajo.
- **`CRM-socaire-pruebas-local.html`**: versión de pruebas; guarda solo en el navegador.

Ambos se regeneran con `npm run build:archivo` (con o sin `.env.local`).

## Cómo abrirlo en tu PC como proyecto (modo local)

Requisito: [Node.js 20 o más nuevo](https://nodejs.org) (descarga la versión LTS e instálala).

```bash
cd "13_CRM_Interno/socaire-crm"
npm install        # solo la primera vez
npm run dev        # abre http://localhost:5173
```

En **modo local** los datos viven en el navegador donde lo abres (Chrome/Edge). Sirve para probarlo y empezar a usarlo; descarga un respaldo seguido desde **Configuración → Datos y respaldos**. Ya trae cargados a Brenda, Nelly, la Vidriera y Baken con la información de la carpeta (cotizaciones, roadmap VELERO, pendientes legales y fiscales).

Arriba a la izquierda, en tu nombre, puedes cambiar entre “Tú” y “Tu papá” para ver el CRM como cada uno.

## Supabase (ya instalado)

El CRM usa el proyecto de Supabase `hadvkwynsgznwbpwprtv`. Para instalarlo desde cero en otro proyecto:

1. Authentication → Sign In / Providers → Email: apagar "Allow new users to sign up".
2. Authentication → Users → Add user: primero el administrador, después los demás ("Auto Confirm User").
3. SQL Editor → pegar `supabase/instalar-todo.sql` → Run (esquema, permisos, auditoría y datos iniciales).
4. SQL Editor → pegar `supabase/migrations/0002_seguridad.sql` → Run (refuerzo de seguridad).
5. Si alguien entra y ve "no tiene perfil activo", correr `supabase/reparar-acceso.sql`.
6. Para dar de alta a alguien nuevo: crearlo en Authentication → Users. Entra **inactivo y sin roles**; actívalo y dale roles en Configuración → Usuarios y roles.

Seguridad y configuración manual del panel: ver [`SEGURIDAD.md`](SEGURIDAD.md).

Para trabajar en tu PC conectado a Supabase, crea `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave publishable). Nunca uses la clave `service_role` en la app.

## Publicarlo en Netlify (con GitHub)

Todo está en `netlify.toml`: comando `npm run build`, carpeta `dist`, Node 20, rutas y variables públicas de Supabase.

1. Sube esta carpeta a un repositorio privado de GitHub.
2. En Netlify: Add new site → Import an existing project → GitHub → elige el repositorio → Deploy. No hay que capturar nada más.
3. Cada cambio que se suba a la rama `main` se publica solo en 1–2 minutos. Cada pull request genera una vista previa con su propia liga.
4. Opcional: Site configuration → Domain management para usar un dominio propio (por ejemplo `crm.alsocaire.com`).

## Estructura

```
src/
  lib/types.ts        Modelo de datos (una interfaz por tabla)
  lib/metrics.ts      Reglas de negocio: MRR, referidos, saldos, cobros esperados, alertas
  lib/seed.ts         Carga inicial con la información real de la carpeta
  lib/backend.ts      Capa de datos: modo local (navegador) o Supabase
  lib/store.tsx       Estado global, guardado optimista, deshacer, permisos
  components/         Menú lateral, Ctrl+K, formularios, tablas reutilizables
  pages/              Una pantalla por módulo
supabase/migrations/  Esquema SQL, auditoría y permisos (RLS)
```

## Reglas de negocio que ya aplica

- Toda oportunidad abierta tiene responsable y próximo seguimiento; si vence o pasa 7 días sin actividad, aparece en “Atención requerida”.
- Una oportunidad perdida exige motivo. Una ganada crea suscripción, proyecto VELERO y las tareas de la fase V.
- Prospecto ≠ cliente ≠ contacto: al convertir un prospecto se puede asociar a un cliente existente para no duplicar la empresa.
- Las cotizaciones conservan sus versiones: una enviada o aceptada no se edita, se crea “Nueva versión”.
- Referidos: −$100, −$50, −$50 por sucursal (piso $800) si firman en los primeros 6 meses y siguen activos.
- Factura ≠ pago: una factura puede tener pagos parciales; los saldos y vencidos se calculan solos. Recordatorios día 3 y 7.
- Al marcar H5 (go-live) la suscripción ligada pasa a activa. Cambios de alcance no se ejecutan sin aprobación por escrito.
- Horas plan vs. real por fase y por persona; margen = monto − horas × costo por hora.

## Siguientes pasos sugeridos (P2–P3)

Alertas por WhatsApp/correo con n8n, encuesta y caso de éxito al cerrar H6, reportes de conversión y churn, subir archivos a Supabase Storage.
