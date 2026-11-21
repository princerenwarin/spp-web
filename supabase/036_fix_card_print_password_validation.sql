BEGIN;

CREATE OR REPLACE FUNCTION public.spp_app_assert_card_print_access(
  p_username text,
  p_password text,
  p_kdsek text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text;
  v_role text;
  v_unit text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kdsek, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Unit siswa tidak valid.' USING ERRCODE = '22023';
  END IF;

  SELECT account.idpemakai,
    lower(btrim(COALESCE(account.role, 'unit'))),
    COALESCE(NULLIF(btrim(account.id_sekolah), ''), 'ALL')
  INTO v_actor, v_role, v_unit
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND account.is_active
    AND public.spp_app_password_matches(p_password, account.password_hash);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Username/password salah atau akun diblokir.' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('superadmin', 'yayasan')
     AND (v_unit = 'ALL' OR v_unit <> btrim(p_kdsek)) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke kartu siswa dari unit lain.' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_assert_card_print_access(text, text, text)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
