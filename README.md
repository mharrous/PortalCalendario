# Portal Calendario

Agenda corporativa protegida por el inicio de sesión Microsoft y los permisos del portal central de la Cámara de Comercio de Ceuta.

## Flujo de acceso

1. Una visita sin sesión se redirige al portal central.
2. El portal autentica con Microsoft Entra y exige el permiso `calendario-eventos`.
3. El calendario canjea un código temporal mediante una comunicación Worker a Worker.
4. El calendario crea una cookie segura y mantiene Supabase Auth para acceder a sus datos.
5. Cada minuto se vuelve a comprobar el permiso. Una revocación cierra la aplicación.

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

## Seguridad

- No se confía en parámetros con correos, `Referer` ni `localStorage`.
- Los códigos de entrada duran 45 segundos y solo se pueden utilizar una vez.
- La cookie es `HttpOnly`, `Secure` y `SameSite=Lax`.
- La sesión puede durar hasta 180 días, pero el permiso central se vuelve a comprobar continuamente.
- El acceso local por correo y contraseña no se muestra en la interfaz.
