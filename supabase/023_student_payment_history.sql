BEGIN;

CREATE OR REPLACE FUNCTION public.spp_app_student_payment_history_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun text,
  p_periode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_billing jsonb;
  v_transactions jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_id_siswa, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_nospp, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_kdsek, '')), '') IS NULL
     OR COALESCE(p_tahun, '') !~ '^[0-9]{4}-[0-9]{4}$'
     OR COALESCE(p_periode, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Identitas siswa atau periode tagihan tidak valid.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);

  IF NOT EXISTS (
    SELECT 1
    FROM public.spp_app_enrollments AS enrollment
    WHERE enrollment.id_siswa = p_id_siswa
      AND enrollment.nospp = p_nospp
      AND enrollment.kdsek = p_kdsek
      AND enrollment.tahun_ajaran = p_tahun
  ) THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada unit dan tahun ajaran tersebut.' USING ERRCODE = '42501';
  END IF;

  v_billing := public.spp_app_student_billing_v1(p_id_siswa, p_tahun, p_periode);
  IF v_billing IS NULL THEN
    RAISE EXCEPTION 'Status periode pembayaran siswa tidak tersedia.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'batch_id', batch.id,
    'payment_id', payment.id,
    'receipt_no', batch.receipt_no,
    'tglbyr', batch.tglbyr,
    'created_at', batch.created_at,
    'component', payment.component,
    'periode', payment.periode,
    'nominal', payment.nominal,
    'source', batch.source,
    'voided_at', batch.voided_at,
    'void_reason', batch.void_reason
  ) ORDER BY batch.tglbyr DESC, batch.id DESC, payment.id DESC), '[]'::jsonb)
  INTO v_transactions
  FROM public.spp_app_payments AS payment
  JOIN public.spp_app_payment_batches AS batch ON batch.id = payment.batch_id
  WHERE payment.id_siswa = p_id_siswa
    AND payment.nospp = p_nospp
    AND payment.kdsek = p_kdsek;

  RETURN jsonb_build_object(
    'billing', v_billing,
    'transactions', v_transactions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text) TO anon, authenticated;

COMMIT;
