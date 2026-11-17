-- Cast legacy account columns to the exact types declared by the operator RPC.
-- Run after 025_user_management_and_hashed_passwords.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_payment_operator_codes_v1(
  p_username text,
  p_password text
)
RETURNS TABLE (
  idpemakai text,
  jabatan text,
  role text,
  kode_operator text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  RETURN QUERY
  SELECT
    account.idpemakai::text,
    account.jabatan::text,
    account.role::text,
    operator_code.kode_operator::text,
    operator_code.updated_at::timestamptz
  FROM public.mastusr account
  LEFT JOIN public.spp_app_operator_codes operator_code
    ON lower(operator_code.idpemakai) = lower(account.idpemakai)
  ORDER BY lower(account.idpemakai);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_payment_operator_codes_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_operator_codes_v1(text, text) TO anon, authenticated;

COMMIT;
