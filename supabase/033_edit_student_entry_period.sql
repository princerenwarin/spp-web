-- Allow Admins to correct an enrollment's billing start month from the student fee form.
-- Run after 032_legacy_desktop_payment_import.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_enrollment_fees_v2(
  p_username text, p_password text, p_id_siswa text, p_tahun_ajaran text,
  p_dpp numeric, p_dsp numeric, p_seragam numeric, p_giat numeric,
  p_spp numeric, p_komp numeric, p_effective_period text,
  p_entry_period text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_old public.spp_app_enrollments%ROWTYPE;
  v_start integer;
  v_entry_date date;
BEGIN
  IF LEAST(COALESCE(p_dpp, -1), COALESCE(p_dsp, -1), COALESCE(p_seragam, -1), COALESCE(p_giat, -1),
           COALESCE(p_spp, -1), COALESCE(p_komp, -1)) < 0 THEN
    RAISE EXCEPTION 'Nominal harus diisi dan tidak boleh negatif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data siswa pada tahun ajaran tersebut tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  v_start := split_part(p_tahun_ajaran, '-', 1)::integer;
  IF COALESCE(p_entry_period, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Periode masuk tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_entry_date := to_date(p_entry_period, 'MMYYYY');
  IF v_entry_date NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode masuk harus berada dalam tahun ajaran.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.id_siswa = p_id_siswa
      AND p.nospp = v_old.nospp
      AND p.component IN ('spp', 'spp_bos', 'komp')
      AND CASE
        WHEN p.periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN to_date(p.periode, 'MMYYYY')
        ELSE NULL
      END < v_entry_date
      AND b.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Periode masuk tidak boleh melewati pembayaran SPP/Komputer yang sudah tercatat.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.update_enrollment_fees_v1(
    p_username, p_password, p_id_siswa, p_tahun_ajaran,
    p_dpp, p_dsp, p_seragam, p_giat, p_spp, p_komp, p_effective_period
  );

  UPDATE public.spp_app_enrollments
  SET periode_masuk = p_entry_period
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran;

  IF NULLIF(btrim(v_old.periode_masuk::text), '') IS DISTINCT FROM p_entry_period THEN
    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (v_actor, 'ubah_periode_masuk', p_id_siswa, jsonb_build_object(
      'tahun_ajaran', p_tahun_ajaran,
      'periode_masuk_lama', NULLIF(btrim(v_old.periode_masuk::text), ''),
      'periode_masuk_baru', p_entry_period
    ));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_enrollment_fees_v2(
  text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_enrollment_fees_v2(
  text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text
) TO anon, authenticated;

COMMIT;
