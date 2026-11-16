-- Allow the arrears report to calculate through two months after the active month.
-- Run after 018_payment_receipts_bos_and_reconciliation.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.spp_app_student_billing_v1(
  p_id_siswa text,
  p_tahun text,
  p_periode text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_student public.spp_app_students%ROWTYPE;
  v_start_year integer;
  v_start_date date;
  v_active_date date;
  v_month date;
  v_period text;
  v_spp_target numeric;
  v_komp_target numeric;
  v_spp_paid numeric;
  v_komp_paid numeric;
  v_spp_credit numeric := 0;
  v_komp_credit numeric := 0;
  v_spp_credit_in numeric;
  v_komp_credit_in numeric;
  v_spp_remaining numeric;
  v_komp_remaining numeric;
  v_spp_total_remaining numeric := 0;
  v_komp_total_remaining numeric := 0;
  v_periods jsonb := '[]'::jsonb;
  v_components jsonb := '{}'::jsonb;
  v_component_row record;
  v_component_paid numeric;
  v_component_remaining numeric;
  v_one_time_total numeric := 0;
  v_unallocated numeric := 0;
  v_unallocated_count bigint := 0;
  v_last_paid date;
BEGIN
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$'
     OR p_periode IS NULL OR p_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran atau periode tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start_year := split_part(p_tahun, '-', 1)::integer;
  v_active_date := to_date(p_periode, 'MMYYYY');
  IF v_active_date < make_date(v_start_year, 7, 1)
     OR v_active_date > make_date(v_start_year + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode harus berada di tahun ajaran yang dipilih.' USING ERRCODE = '22023';
  END IF;
  IF v_active_date > (date_trunc('month', current_date) + interval '2 months')::date THEN
    RAISE EXCEPTION 'Periode tagihan maksimal dua bulan setelah bulan aktif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enr
  FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun;
  IF v_enr.id_siswa IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_student FROM public.spp_app_students WHERE id_siswa = p_id_siswa;

  v_start_date := make_date(v_start_year, 7, 1);
  IF v_enr.periode_masuk IS NOT NULL THEN
    v_start_date := greatest(v_start_date, to_date(v_enr.periode_masuk, 'MMYYYY'));
  END IF;
  IF v_start_date <= v_active_date THEN
    FOR v_month IN
      SELECT generate_series(date_trunc('month', v_start_date)::date,
        date_trunc('month', v_active_date)::date, interval '1 month')::date
    LOOP
      v_period := to_char(v_month, 'MMYYYY');
      SELECT COALESCE(rate.spp, v_enr.spp), COALESCE(rate.komp, v_enr.komp)
      INTO v_spp_target, v_komp_target
      FROM (SELECT 1) AS seed
      LEFT JOIN LATERAL (
        SELECT h.spp, h.komp
        FROM public.spp_app_spp_history h
        WHERE h.id_siswa = p_id_siswa AND h.tahun_ajaran = p_tahun
          AND h.effective_date <= v_month
        ORDER BY h.effective_date DESC LIMIT 1
      ) AS rate ON true;

      SELECT COALESCE(sum(p.nominal), 0) INTO v_spp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.nospp = v_enr.nospp AND p.component IN ('spp', 'spp_bos')
        AND p.periode = v_period AND b.voided_at IS NULL;
      SELECT COALESCE(sum(p.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.nospp = v_enr.nospp AND p.component = 'komp'
        AND p.periode = v_period AND b.voided_at IS NULL;

      v_spp_credit_in := v_spp_credit;
      v_komp_credit_in := v_komp_credit;
      v_spp_remaining := greatest(v_spp_target - v_spp_paid - v_spp_credit_in, 0);
      v_komp_remaining := greatest(v_komp_target - v_komp_paid - v_komp_credit_in, 0);
      v_spp_credit := greatest(v_spp_paid + v_spp_credit_in - v_spp_target, 0);
      v_komp_credit := greatest(v_komp_paid + v_komp_credit_in - v_komp_target, 0);
      v_spp_total_remaining := v_spp_total_remaining + v_spp_remaining;
      v_komp_total_remaining := v_komp_total_remaining + v_komp_remaining;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object(
        'periode', v_period,
        'spp', jsonb_build_object(
          'tagihan', v_spp_target, 'dibayar', v_spp_paid, 'saldo_dibawa', v_spp_credit_in,
          'sisa', v_spp_remaining,
          'status', CASE WHEN v_spp_target = 0 THEN '-'
            WHEN v_spp_remaining = 0 THEN 'Lunas'
            WHEN v_spp_paid + v_spp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END),
        'komp', jsonb_build_object(
          'tagihan', v_komp_target, 'dibayar', v_komp_paid, 'saldo_dibawa', v_komp_credit_in,
          'sisa', v_komp_remaining,
          'status', CASE WHEN v_komp_target = 0 THEN '-'
            WHEN v_komp_remaining = 0 THEN 'Lunas'
            WHEN v_komp_paid + v_komp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END)));
    END LOOP;
  END IF;

  FOR v_component_row IN
    SELECT 'dpp'::text AS component, v_enr.dpp AS target
    UNION ALL SELECT 'dpp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dpp' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'dsp', v_enr.dsp + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dsp'), 0)
    UNION ALL SELECT 'seragam', v_enr.seragam + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'seragam'), 0)
    UNION ALL SELECT 'giat', v_enr.giat + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'kegiatan'), 0)
    UNION ALL SELECT 'spp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'spp' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'komp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'komputer' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'lainnya', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'lainnya'), 0)
  LOOP
    SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.nospp = v_enr.nospp AND p.component = v_component_row.component
      AND b.voided_at IS NULL;
    v_component_remaining := greatest(v_component_row.target - v_component_paid, 0);
    v_one_time_total := v_one_time_total + v_component_remaining;
    v_components := v_components || jsonb_build_object(v_component_row.component, jsonb_build_object(
      'tagihan', v_component_row.target, 'dibayar', v_component_paid, 'sisa', v_component_remaining,
      'status', CASE WHEN v_component_row.target = 0 THEN '-'
        WHEN v_component_remaining = 0 THEN 'Lunas'
        WHEN v_component_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END));
  END LOOP;

  SELECT COALESCE(sum(p.nominal), 0), count(*)
  INTO v_unallocated, v_unallocated_count
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.nospp = v_enr.nospp AND p.component = 'legacy' AND b.voided_at IS NULL;
  SELECT max(p.tglbyr) INTO v_last_paid
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.nospp = v_enr.nospp AND b.voided_at IS NULL;

  RETURN jsonb_build_object(
    'id_siswa', v_enr.id_siswa, 'tahun_ajaran', v_enr.tahun_ajaran,
    'kdsek', v_enr.kdsek, 'kdkls', v_enr.kdkls, 'nospp', v_enr.nospp,
    'nama', v_student.nama, 'no_wa', v_student.no_wa,
    'periode_masuk', v_enr.periode_masuk, 'periode_aktif', p_periode,
    'periode_bulanan', v_periods, 'komponen_satu_kali', v_components,
    'sisa_spp', v_spp_total_remaining, 'sisa_komp', v_komp_total_remaining,
    'sisa_satu_kali', v_one_time_total,
    'sisa_total', v_spp_total_remaining + v_komp_total_remaining + v_one_time_total,
    'belum_dialokasikan', v_unallocated, 'jumlah_belum_dialokasikan', v_unallocated_count,
    'terakhir_bayar', v_last_paid);
END;
$function$;

COMMIT;
