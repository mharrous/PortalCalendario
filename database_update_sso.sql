-- Agenda Cámara · actualización SSO Microsoft / Entra
-- Permite que el rol se resuelva por auth.uid() o por el email del token Microsoft/Supabase.
-- Ejecutar una vez en Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.agenda_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT lower(p.rol)
      FROM public.profiles p
      WHERE p.id = auth.uid()
         OR lower(p.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      ORDER BY CASE WHEN p.id = auth.uid() THEN 0 ELSE 1 END
      LIMIT 1
    ),
    'consulta'
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agenda_user_role() IN ('admin', 'administrador');
$$;

CREATE OR REPLACE FUNCTION public.agenda_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agenda_user_role() IN ('admin', 'administrador', 'coordinador');
$$;

GRANT EXECUTE ON FUNCTION public.agenda_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_can_write() TO authenticated;

COMMIT;

-- Comprobación recomendada:
-- SELECT public.agenda_user_role(), public.agenda_is_admin(), public.agenda_can_write();
