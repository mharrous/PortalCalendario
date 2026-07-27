# Portal Calendario

Agenda corporativa protegida por el inicio de sesión Microsoft y los permisos del portal central de la Cámara de Comercio de Ceuta.

## Flujo de acceso

1. Una visita sin sesión se redirige al portal central.
2. El portal autentica con Microsoft Entra y exige el permiso `calendario-eventos`.
3. El calendario canjea un código temporal mediante una comunicación Worker a Worker.
4. El calendario crea una cookie segura y mantiene Supabase Auth para acceder a sus datos.
5. Cada minuto se vuelve a comprobar el permiso. Una revocación cierra la aplicación.

Cuando el calendario está incrustado en Portal Jornadas, Jornadas genera un código central de un solo uso para el usuario ya autenticado. El calendario guarda su sesión Worker en una cookie particionada y, si Supabase todavía no tiene sesión en ese contexto, completa Microsoft en una ventana emergente segura en lugar de intentar cargarlo dentro del `iframe`.

## Configuración obligatoria

Los dos Workers deben tener el mismo secreto, configurado de forma interactiva y nunca guardado en GitHub.

En el proyecto del portal central:

```powershell
npx wrangler secret put CALENDARIO_SSO_SECRET
```

En este proyecto del calendario:

```powershell
npm install
npx wrangler secret put PORTAL_SSO_SECRET
```

Introduce exactamente el mismo valor en ambos comandos.

## Validación y despliegue

```powershell
npm install
npm run check
npm run deploy
```

El Worker configurado en `wrangler.jsonc` se llama `calendario`. Si el proyecto existente de Cloudflare utiliza otro nombre, debe ajustarse antes de desplegar para no crear un Worker distinto.

## Supabase

La autorización general procede del portal. Supabase sigue proporcionando la sesión necesaria para consultar y modificar los datos de la agenda. Azure debe continuar habilitado en Supabase y las cuentas autorizadas deben conservar un perfil activo en `public.profiles`.

### URL de retorno obligatoria

En **Supabase → Authentication → URL Configuration** configura:

- **Site URL**: `https://calendario.camaradeceuta.workers.dev`
- **Redirect URLs**: añade `https://calendario.camaradeceuta.workers.dev/**`

Si esta URL no está autorizada, Supabase ignora el retorno solicitado por el calendario y envía el acceso Microsoft a la URL local configurada por defecto.

### Reservas paralelas por departamento

Ejecuta `database_update_parallel_reservations.sql` una vez en el editor SQL de Supabase. La regla permite solapes entre departamentos distintos cuando no comparten coordinador ni ubicación. Se mantienen bloqueados los solapes del mismo departamento, con responsables compartidos, en la misma ubicación o sin departamento asignado.

## Copias de seguridad

Los administradores disponen de la pestaña **Administración → Copias**:

- **Crear copia completa** descarga un JSON con todas las reservas, perfiles internos, departamentos, recursos y registros de auditoría accesibles mediante las políticas RLS.
- **Exportar reservas CSV** genera un archivo compatible con Excel para consulta manual.
- **Validar una copia** comprueba localmente el formato y la huella SHA-256 del JSON y compara sus reservas con la agenda actual.
- **Restaurar reservas** recupera únicamente las reservas de la copia que ya no existen. Requiere confirmación expresa y nunca sobrescribe ni elimina reservas actuales.

Las copias contienen datos personales. Deben almacenarse en una ubicación corporativa protegida y verificarse periódicamente con el validador incluido.

## Seguridad

- No se confía en parámetros con correos, `Referer` ni `localStorage`.
- Los códigos de entrada duran 45 segundos y solo se pueden utilizar una vez.
- La cookie es `HttpOnly`, `Secure` y `SameSite=Lax`.
- La sesión incrustada utiliza además `SameSite=None; Partitioned` para funcionar dentro de `portal-jornadas.pages.dev`.
- La sesión puede durar hasta 180 días, pero el permiso central se vuelve a comprobar continuamente.
- El acceso local por correo y contraseña no se muestra en la interfaz.
