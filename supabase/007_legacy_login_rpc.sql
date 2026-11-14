ALTER TABLE public.mastusr
  ADD COLUMN IF NOT EXISTS id_sekolah VARCHAR(10),
  ADD COLUMN IF NOT EXISTS nama_lengkap VARCHAR(100),
  ADD COLUMN IF NOT EXISTS role VARCHAR(20);

CREATE OR REPLACE FUNCTION public.login_mastusr(p_username text, p_password text)
RETURNS TABLE (
  idpemakai text,
  jabatan text,
  role text,
  id_sekolah text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    m.idpemakai::text,
    COALESCE(NULLIF(BTRIM(m.jabatan), ''), NULLIF(BTRIM(m.nama_lengkap), ''), 'Admin')::text,
    COALESCE(NULLIF(LOWER(BTRIM(m.role)), ''), 'unit')::text,
    COALESCE(NULLIF(BTRIM(m.id_sekolah), ''), 'ALL')::text
  FROM public.mastusr AS m
  WHERE LOWER(BTRIM(m.idpemakai)) = LOWER(BTRIM(p_username))
    AND BTRIM(COALESCE(m.password, '')) = BTRIM(COALESCE(p_password, ''))
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.login_mastusr(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_mastusr(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_mastusr(text, text) TO anon, authenticated;
