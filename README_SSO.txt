AGENDA CÁMARA - SSO DEL PORTAL CENTRAL

La documentación actual está en README.md.

Resumen:
- El portal central autentica con Microsoft y comprueba el permiso calendario-eventos.
- El calendario está alojado en otra cuenta de Cloudflare y se comunica mediante endpoints protegidos por un Worker Secret.
- Supabase continúa gestionando los datos y los perfiles internos de la agenda.
- El acceso local por correo y contraseña ya no se muestra.
- El secreto nunca debe guardarse en este repositorio.
