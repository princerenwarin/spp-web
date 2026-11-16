-- Move unpaid monthly balances into periodized arrears when an academic year is closed.
-- Run after 021_card_print_cursor.sql.
BEGIN;

ALTER TABLE public.spp_app_arrears
  ADD COLUMN IF NOT EXISTS periode char(6),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.spp_app_arrears
  DROP CONSTRAINT IF EXISTS spp_app_arrears_periode_check;
ALTER TABLE public.spp_app_arrears
  ADD CONSTRAINT spp_app_arrears_periode_check
  CHECK (periode IS NULL OR periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$');

ALTER TABLE public.spp_app_arrears
  DROP CONSTRAINT IF EXISTS spp_app_arrears_source_check;
ALTER TABLE public.spp_app_arrears
  ADD CONSTRAINT spp_app_arrears_source_check
  CHECK (source IN ('manual', 'cutoff'));

CREATE INDEX IF NOT EXISTS spp_app_arrears_student_component_year_period_idx
  ON public.spp_app_arrears (id_siswa, jenis, tahun_ajaran, periode);
CREATE UNIQUE INDEX IF NOT EXISTS spp_app_arrears_cutoff_period_unique
  ON public.spp_app_arrears (id_siswa, tahun_ajaran, jenis, periode)
  WHERE source = 'cutoff' AND periode IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spp_app_year_cutoffs (
  tahun_ajaran text PRIMARY KEY
    CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'
      AND split_part(tahun_ajaran, '-', 2)::integer = split_part(tahun_ajaran, '-', 1)::integer + 1),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by text NOT NULL,
  processed_students integer NOT NULL DEFAULT 0,
  period_count integer NOT NULL DEFAULT 0,
  spp_total numeric(14,2) NOT NULL DEFAULT 0,
  komputer_total numeric(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.spp_app_year_cutoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spp_app_year_cutoffs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_arrears_list AS
SELECT a.id, a.id_siswa, a.tahun_ajaran, a.jenis, a.keterangan, a.nominal, s.nama,
  a.periode, a.source
FROM public.spp_app_arrears a
LEFT JOIN public.spp_app_students s ON s.id_siswa = a.id_siswa;

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
    SELECT e.*
    FROM public.spp_app_enrollments e
    WHERE e.tahun_ajaran = p_tahun_ajaran
    ORDER BY e.id_siswa
  LOOP
    v_processed_students := v_processed_students + 1;
    v_spp_credit := 0;
    v_komp_credit := 0;
    SELECT COALESCE(sum(a.nominal), 0) INTO v_manual_spp
    FROM public.spp_app_arrears a
    WHERE a.id_siswa = v_enr.id_siswa AND a.tahun_ajaran = p_tahun_ajaran
      AND a.jenis = 'spp' AND a.source = 'manual' AND a.periode IS NULL;
    SELECT COALESCE(sum(a.nominal), 0) INTO v_manual_komp
    FROM public.spp_app_arrears a
    WHERE a.id_siswa = v_enr.id_siswa AND a.tahun_ajaran = p_tahun_ajaran
      AND a.jenis = 'komputer' AND a.source = 'manual' AND a.periode IS NULL;

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
        SELECT h.spp, h.komp
        FROM public.spp_app_spp_history h
        WHERE h.id_siswa = v_enr.id_siswa AND h.tahun_ajaran = p_tahun_ajaran
          AND h.effective_date <= v_month
        ORDER BY h.effective_date DESC LIMIT 1
      ) AS rate ON true;

      SELECT COALESCE(sum(p.nominal), 0) INTO v_spp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = v_enr.id_siswa AND p.nospp = v_enr.nospp
        AND p.component IN ('spp', 'spp_bos') AND p.periode = v_period
        AND b.voided_at IS NULL;
      SELECT COALESCE(sum(p.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = v_enr.id_siswa AND p.nospp = v_enr.nospp
        AND p.component = 'komp' AND p.periode = v_period
        AND b.voided_at IS NULL;

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
  v_component_details jsonb;
  v_one_time_total numeric := 0;
  v_unallocated numeric := 0;
  v_unallocated_count bigint := 0;
  v_last_paid date;
  v_year_closed boolean := false;
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
  SELECT EXISTS (
    SELECT 1 FROM public.spp_app_year_cutoffs c WHERE c.tahun_ajaran = p_tahun
  ) INTO v_year_closed;

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
      WHERE p.id_siswa = p_id_siswa AND p.nospp = v_enr.nospp
        AND p.component IN ('spp', 'spp_bos')
        AND p.periode = v_period AND b.voided_at IS NULL;
      SELECT COALESCE(sum(p.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = p_id_siswa AND p.nospp = v_enr.nospp
        AND p.component = 'komp'
        AND p.periode = v_period AND b.voided_at IS NULL;

      v_spp_credit_in := v_spp_credit;
      v_komp_credit_in := v_komp_credit;
      v_spp_remaining := greatest(v_spp_target - v_spp_paid - v_spp_credit_in, 0);
      v_komp_remaining := greatest(v_komp_target - v_komp_paid - v_komp_credit_in, 0);
      v_spp_credit := greatest(v_spp_paid + v_spp_credit_in - v_spp_target, 0);
      v_komp_credit := greatest(v_komp_paid + v_komp_credit_in - v_komp_target, 0);
      IF v_year_closed THEN
        v_spp_remaining := 0;
        v_komp_remaining := 0;
      END IF;
      v_spp_total_remaining := v_spp_total_remaining + v_spp_remaining;
      v_komp_total_remaining := v_komp_total_remaining + v_komp_remaining;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object(
        'periode', v_period,
        'spp', jsonb_build_object(
          'tagihan', v_spp_target, 'dibayar', v_spp_paid, 'saldo_dibawa', v_spp_credit_in,
          'sisa', v_spp_remaining,
          'status', CASE WHEN v_year_closed AND v_spp_target > v_spp_paid + v_spp_credit_in THEN 'Dipindahkan'
            WHEN v_spp_target = 0 THEN '-'
            WHEN v_spp_remaining = 0 THEN 'Lunas'
            WHEN v_spp_paid + v_spp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END),
        'komp', jsonb_build_object(
          'tagihan', v_komp_target, 'dibayar', v_komp_paid, 'saldo_dibawa', v_komp_credit_in,
          'sisa', v_komp_remaining,
          'status', CASE WHEN v_year_closed AND v_komp_target > v_komp_paid + v_komp_credit_in THEN 'Dipindahkan'
            WHEN v_komp_target = 0 THEN '-'
            WHEN v_komp_remaining = 0 THEN 'Lunas'
            WHEN v_komp_paid + v_komp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END)));
    END LOOP;
  END IF;

  FOR v_component_row IN
    SELECT 'dpp'::text AS component, greatest(
      COALESCE((SELECT e.dpp FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.dpp > 0 ORDER BY e.tahun_ajaran ASC LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dpp'), 0)) AS target
    UNION ALL SELECT 'dsp', greatest(
      COALESCE((SELECT e.dsp FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.dsp > 0 ORDER BY e.tahun_ajaran ASC LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dsp'), 0))
    UNION ALL SELECT 'seragam', greatest(
      COALESCE((SELECT e.seragam FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.seragam > 0 ORDER BY e.tahun_ajaran ASC LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'seragam'), 0))
    UNION ALL SELECT 'giat', v_enr.giat + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'kegiatan'), 0)
    UNION ALL SELECT 'spp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'spp' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'komp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'komputer' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'lainnya', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'lainnya'), 0)
  LOOP
    IF v_component_row.component = 'dpp' THEN
      SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = p_id_siswa AND p.component IN ('dpp', 'dpp_tl') AND b.voided_at IS NULL;
    ELSIF v_component_row.component IN ('dsp', 'seragam') THEN
      SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = p_id_siswa AND p.component = v_component_row.component
        AND b.voided_at IS NULL;
    ELSIF v_component_row.component IN ('spp_tl', 'komp_tl') THEN
      SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = p_id_siswa AND p.component = v_component_row.component
        AND b.voided_at IS NULL;
    ELSE
      SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.nospp = v_enr.nospp AND p.component = v_component_row.component
        AND b.voided_at IS NULL;
    END IF;

    v_component_remaining := greatest(v_component_row.target - v_component_paid, 0);
    v_one_time_total := v_one_time_total + v_component_remaining;
    v_component_details := NULL;
    IF v_component_row.component IN ('spp_tl', 'komp_tl') THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'tahun_ajaran', detail.tahun_ajaran,
        'periode', detail.periode,
        'keterangan', detail.keterangan,
        'tagihan', detail.nominal,
        'dibayar', detail.dibayar,
        'sisa', detail.sisa) ORDER BY detail.tahun_ajaran, detail.periode NULLS FIRST, detail.id), '[]'::jsonb)
      INTO v_component_details
      FROM (
        SELECT arrears.id, arrears.tahun_ajaran, arrears.periode, arrears.keterangan,
          arrears.nominal,
          least(arrears.nominal, greatest(v_component_paid - arrears.paid_before, 0)) AS dibayar,
          greatest(arrears.nominal - least(arrears.nominal,
            greatest(v_component_paid - arrears.paid_before, 0)), 0) AS sisa
        FROM (
          SELECT a.id, a.tahun_ajaran, a.periode, a.keterangan, a.nominal,
            COALESCE(sum(a.nominal) OVER (
              ORDER BY a.tahun_ajaran, a.periode NULLS FIRST, a.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS paid_before
          FROM public.spp_app_arrears a
          WHERE a.id_siswa = p_id_siswa
            AND a.jenis = CASE v_component_row.component
              WHEN 'spp_tl' THEN 'spp' ELSE 'komputer' END
            AND a.tahun_ajaran < p_tahun
        ) arrears
      ) detail
      WHERE detail.sisa > 0;
    END IF;
    v_components := v_components || jsonb_build_object(v_component_row.component,
      jsonb_strip_nulls(jsonb_build_object(
        'tagihan', v_component_row.target,
        'dibayar', least(v_component_paid, v_component_row.target),
        'sisa', v_component_remaining,
        'status', CASE WHEN v_component_row.target = 0 THEN '-'
          WHEN v_component_remaining = 0 THEN 'Lunas'
          WHEN v_component_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END,
        'rincian', v_component_details)));
  END LOOP;

  SELECT COALESCE(sum(p.nominal), 0), count(*)
  INTO v_unallocated, v_unallocated_count
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.nospp = v_enr.nospp AND p.component = 'legacy' AND b.voided_at IS NULL;
  SELECT max(p.tglbyr) INTO v_last_paid
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.id_siswa = p_id_siswa AND b.voided_at IS NULL;

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
    'terakhir_bayar', v_last_paid,
    'cutoff_selesai', v_year_closed);
END;
$function$;

COMMIT;
