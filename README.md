# Club Banco Hipotecario · Demo local

Primera versión para presentar al club. Node.js 24, Express, HTML/CSS/JavaScript y SQLite persistente. No se publica y no procesa dinero real.

## Vista previa en Vercel

`npm run build` genera `dist/` con una presentación estática. `vercel.json` publica únicamente ese directorio. Incluye portada, cuenta de ejemplo y paneles ilustrativos con datos sintéticos; no registra usuarios, no realiza cobros, no valida ingresos y no permite modificar datos ni descargar listas de la base local. El QR ilustrativo no tiene validez. La base SQLite, los secretos y las sesiones locales no se suben.

El código completo de la demo funcional local se conserva en este mismo repositorio. Para habilitar operaciones online será necesario conectar una base persistente y la autenticación de producción.

## Iniciar

```powershell
npm install
npm start
```

Abrir http://127.0.0.1:3000. Para recarga del servidor al editar: `npm run dev`.

## Recorrido para la presentación

1. Elegir una entrada, crear una cuenta con datos sintéticos y una contraseña exclusiva.
2. Elegir pago aprobado, pendiente o rechazado en el simulador.
3. Ver el QR en **Mis entradas** solamente después de una aprobación de prueba.
4. Copiar el código QR antes de abrir los paneles, o usar búsqueda manual en puerta.
5. Al pie de la página, abrir **Explorar paneles de demostración**. El acceso a un panel cierra la sesión de comprador.
6. En administración: ver estadísticas, filtrar asistentes, exportar PDF y editar los datos del evento o cerrar ventas.
7. En puerta: pegar el código, buscar por DNI/nombre o usar cámara en un navegador con BarcodeDetector. Una entrada usada rechaza otro ingreso.

## Persistencia y estructura

- `data/club.sqlite`: base privada local, creada al iniciar; no se incluye en Git.
- `migrations/001_initial.sql`: esquema versionado, aplicado automáticamente al iniciar.
- `server.js`: API, sesiones, validación, transacciones, auditoría y permisos.
- `public/`: interfaz responsive y afiche ilustrado hecho en CSS, sin fotografía o logo oficial.
- Las contraseñas se guardan con bcrypt. La sesión está en memoria y vence al reiniciar el servidor.
- Importes en centavos; reglas de demo: una entrada nominativa activa por DNI, sin reservas temporales ni reingreso.

API: `GET /api/event`, `POST /api/register`, `/api/login`, `/api/logout`, `GET /api/mine`, `POST /api/purchases`, `/api/purchases/:id/simulate`, `GET /api/staff/list`, `/api/admin/stats`, `/api/admin/export.pdf`, `PUT /api/admin/event`, `POST /api/check-in`, `/api/admin/revoke`.

Configuración opcional en `.env.example`. Para cargar `.env`: `node --env-file=.env server.js`. El servidor siempre escucha en 127.0.0.1. Las fuentes de Google son opcionales; hay fuentes locales de respaldo.

## Alcance real y pendientes

Esta es una demo funcional local, no el sistema de producción completo del texto de referencia. Los accesos de personal se eligen sin contraseña **solo para demostrar roles**; no exponer este servidor, usar un túnel ni publicarlo. Los precios, categorías, cupos y colores son propuestas de muestra.

Pendiente: logo y recursos autorizados, datos definitivos del evento, precios y condiciones; gestión de precios/cupos desde el panel; credenciales y cuentas de personal reales; proveedor de correo y recuperación de contraseña; Mercado Pago con checkout, webhooks y conciliación; reservas y pagos tardíos; devoluciones; migración a PostgreSQL, sesiones persistentes, HTTPS, copias privadas y pruebas de producción. Las pantallas no sustituyen estas integraciones.

Las listas y los QR corresponden exclusivamente a esta demo. La sincronización de puerta usa consultas cada cinco segundos al mismo servidor; sin conexión no se validan ingresos. La cámara depende del navegador y siempre hay búsqueda manual.

## Verificación

`npm test` ejecuta un recorrido API sobre una base temporal separada: registro, sesión, compra pendiente sin QR, aprobación idempotente, permisos, doble ingreso, filtros PDF y cierre de ventas.

## Mejoras sugeridas para la siguiente etapa

- UX: recuperación de acceso por correo, actualización de pagos reales y condiciones claras antes de comprar.
- Visual: identidad oficial del club y fotografías autorizadas del evento.
- Interacción: descarga de la entrada para tenerla a mano en el celular.
