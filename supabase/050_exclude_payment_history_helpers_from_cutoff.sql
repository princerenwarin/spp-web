-- Keep desktop payment-history helper enrollments out of SPP/Komputer cutoff.
-- Run after 049_resolve_mapped_ids_during_student_import.sql.
BEGIN;

ALTER TABLE public.spp_app_enrollments
  ADD COLUMN IF NOT EXISTS cutoff_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.spp_app_enrollments.cutoff_exempt IS
  'Enrollment penunjang yang dibuat oleh impor pembayaran historis; tidak menghasilkan tunggakan cut-off.';

UPDATE public.spp_app_enrollments enrollment
SET cutoff_exempt = true
WHERE EXISTS (
  SELECT 1
  FROM public.spp_app_student_log log
  WHERE log.action = 'enrollment_import_desktop_otomatis'
    AND log.id_siswa = enrollment.id_siswa
    AND log.detail->>'tahun_ajaran' = enrollment.tahun_ajaran
);

CREATE OR REPLACE FUNCTION public.spp_app_mark_desktop_enrollment_cutoff_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_year text;
BEGIN
  v_year := NEW.detail->>'tahun_ajaran';
  IF NEW.action <> 'enrollment_import_desktop_otomatis'
     OR NEW.id_siswa IS NULL
     OR COALESCE(v_year, '') !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RETURN NEW;
  END IF;

  UPDATE public.spp_app_enrollments
  SET cutoff_exempt = true
  WHERE id_siswa = NEW.id_siswa AND tahun_ajaran = v_year;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_mark_desktop_enrollment_cutoff_exempt()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS spp_app_mark_desktop_enrollment_cutoff_exempt
  ON public.spp_app_student_log;
CREATE TRIGGER spp_app_mark_desktop_enrollment_cutoff_exempt
AFTER INSERT ON public.spp_app_student_log
FOR EACH ROW
EXECUTE FUNCTION public.spp_app_mark_desktop_enrollment_cutoff_exempt();

CREATE OR REPLACE FUNCTION public.cutoff_academic_year_v1(
  p_username text,
  p_password text,
  p_tahun_ajaran text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_start_year integer;
  v_first_month date;
  v_end_month date;
  v_month date;
  v_period text;
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_spp_target numeric;
  v_komp_target numeric;
  v_spp_paid numeric;
  v_komp_paid numeric;
  v_spp_credit numeric;
  v_komp_credit numeric;
  v_spp_remaining numeric;
  v_komp_remaining numeric;
  v_manual_spp numeric;
  v_manual_komp numeric;
  v_offset numeric;
  v_processed_students integer := 0;
  v_period_count integer := 0;
  v_spp_total numeric := 0;
  v_komputer_total numeric := 0;
  v_inserted integer;
  v_existing public.spp_app_year_cutoffs%ROWTYPE;
BEGIN
  IF p_tahun_ajaran IS NULL OR p_tahun_ajaran !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(p_tahun_ajaran, '-', 2)::integer <> split_part(p_tahun_ajaran, '-', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start_year := split_part(p_tahun_ajaran, '-', 1)::integer;
  v_first_month := make_date(v_start_year, 7, 1);
  v_end_month := make_date(v_start_year + 1, 6, 1);
  IF current_date < make_date(v_start_year + 1, 7, 1) THEN
    RAISE EXCEPTION 'Cut-off hanya dapat dilakukan setelah bulan Juni tahun ajaran berakhir.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.spp_app_year_cutoffs (tahun_ajaran, closed_by)
  VALUES (p_tahun_ajaran, v_actor)
  ON CONFLICT (tahun_ajaran) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT * INTO v_existing
    FROM public.spp_app_year_cutoffs
    WHERE tahun_ajaran = p_tahun_ajaran;
    RETURN jsonb_build_object(
      'tahun_ajaran', p_tahun_ajaran,
      'already_closed', true,
      'processed_students', v_existing.processed_students,
      'period_count', v_existing.period_count,
      'spp_total', v_existing.spp_total,
      'komputer_total', v_existing.komputer_total);
  END IF;

  FOR v_enr IN
    SELECT enrollment.*
    FROM public.spp_app_enrollments enrollment
    WHERE enrollment.tahun_ajaran = p_tahun_ajaran
      AND NOT enrollment.cutoff_exempt
    ORDER BY enrollment.id_siswa
  LOOP
    v_processed_students := v_processed_students + 1;
    v_spp_credit := 0;
    v_komp_credit := 0;
    SELECT COALESCE(sum(arrears.nominal), 0) INTO v_manual_spp
    FROM public.spp_app_arrears arrears
    WHERE arrears.id_siswa = v_enr.id_siswa AND arrears.tahun_ajaran = p_tahun_ajaran
      AND arrears.jenis = 'spp' AND arrears.source = 'manual' AND arrears.periode IS NULL;
    SELECT COALESCE(sum(arrears.nominal), 0) INTO v_manual_komp
    FROM public.spp_app_arrears arrears
    WHERE arrears.id_siswa = v_enr.id_siswa AND arrears.tahun_ajaran = p_tahun_ajaran
      AND arrears.jenis = 'komputer' AND arrears.source = 'manual' AND arrears.periode IS NULL;

    v_first_month := make_date(v_start_year, 7, 1);
    IF v_enr.periode_masuk IS NOT NULL THEN
      v_first_month := greatest(v_first_month, to_date(v_enr.periode_masuk, 'MMYYYY'));
    END IF;
    IF v_first_month > v_end_month THEN
      CONTINUE;
    END IF;

    FOR v_month IN
      SELECT generate_series(v_first_month, v_end_month, interval '1 month')::date
    LOOP
      v_period := to_char(v_month, 'MMYYYY');
      SELECT COALESCE(rate.spp, v_enr.spp), COALESCE(rate.komp, v_enr.komp)
      INTO v_spp_target, v_komp_target
      FROM (SELECT 1) AS seed
      LEFT JOIN LATERAL (
        SELECT history.spp, history.komp
        FROM public.spp_app_spp_history history
        WHERE history.id_siswa = v_enr.id_siswa
          AND history.tahun_ajaran = p_tahun_ajaran
          AND history.effective_date <= v_month
        ORDER BY history.effective_date DESC
        LIMIT 1
      ) AS rate ON true;

      SELECT COALESCE(sum(payment.nominal), 0) INTO v_spp_paid
      FROM public.spp_app_payments payment
      JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
      WHERE payment.id_siswa = v_enr.id_siswa AND payment.nospp = v_enr.nospp
        AND payment.component IN ('spp', 'spp_bos') AND payment.periode = v_period
        AND batch.voided_at IS NULL;
      SELECT COALESCE(sum(payment.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments payment
      JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
      WHERE payment.id_siswa = v_enr.id_siswa AND payment.nospp = v_enr.nospp
        AND payment.component = 'komp' AND payment.periode = v_period
        AND batch.voided_at IS NULL;

      v_spp_remaining := greatest(v_spp_target - v_spp_paid - v_spp_credit, 0);
      v_komp_remaining := greatest(v_komp_target - v_komp_paid - v_komp_credit, 0);
      v_spp_credit := greatest(v_spp_paid + v_spp_credit - v_spp_target, 0);
      v_komp_credit := greatest(v_komp_paid + v_komp_credit - v_komp_target, 0);

      v_offset := least(v_spp_remaining, v_manual_spp);
      v_manual_spp := greatest(v_manual_spp - v_offset, 0);
      v_spp_remaining := greatest(v_spp_remaining - v_offset, 0);
      v_offset := least(v_komp_remaining, v_manual_komp);
      v_manual_komp := greatest(v_manual_komp - v_offset, 0);
      v_komp_remaining := greatest(v_komp_remaining - v_offset, 0);

      IF v_spp_remaining > 0 THEN
        INSERT INTO public.spp_app_arrears
          (id_siswa, tahun_ajaran, jenis, keterangan, nominal, created_by, periode, source)
        VALUES
          (v_enr.id_siswa, p_tahun_ajaran, 'spp', 'Cut-off otomatis', v_spp_remaining,
            v_actor, v_period, 'cutoff');
        v_spp_total := v_spp_total + v_spp_remaining;
      END IF;
      IF v_komp_remaining > 0 THEN
        INSERT INTO public.spp_app_arrears
          (id_siswa, tahun_ajaran, jenis, keterangan, nominal, created_by, periode, source)
        VALUES
          (v_enr.id_siswa, p_tahun_ajaran, 'komputer', 'Cut-off otomatis', v_komp_remaining,
            v_actor, v_period, 'cutoff');
        v_komputer_total := v_komputer_total + v_komp_remaining;
      END IF;
      IF v_spp_remaining > 0 OR v_komp_remaining > 0 THEN
        v_period_count := v_period_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.spp_app_year_cutoffs
  SET processed_students = v_processed_students,
      period_count = v_period_count,
      spp_total = v_spp_total,
      komputer_total = v_komputer_total
  WHERE tahun_ajaran = p_tahun_ajaran;
  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'cutoff_tahun_ajaran', jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran,
    'siswa', v_processed_students,
    'rincian_periode', v_period_count,
    'spp', v_spp_total,
    'komputer', v_komputer_total));

  RETURN jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran,
    'already_closed', false,
    'processed_students', v_processed_students,
    'period_count', v_period_count,
    'spp_total', v_spp_total,
    'komputer_total', v_komputer_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.cutoff_academic_year_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cutoff_academic_year_v1(text, text, text) TO anon, authenticated;

COMMIT;
