-- Categorized payment entries and period-based billing reports.
-- Run after 015_full_billing_totals.sql.
BEGIN;

ALTER TABLE public.spp_app_payments
  ADD COLUMN IF NOT EXISTS component text NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'spp_app_payments_component_check'
      AND conrelid = 'public.spp_app_payments'::regclass
  ) THEN
    ALTER TABLE public.spp_app_payments
      ADD CONSTRAINT spp_app_payments_component_check
      CHECK (component IN (
        'spp', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
        'spp_tl', 'komp_tl', 'lainnya', 'legacy'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS spp_app_payments_component_period_idx
  ON public.spp_app_payments (nospp, component, periode);

CREATE OR REPLACE VIEW public.spp_app_payment_list AS
SELECT p.id, p.nospp, p.id_siswa, p.kdsek, p.periode, p.nominal, p.tglbyr,
  p.idpemakai, p.ket, s.nama, p.component
FROM public.spp_app_payments p
LEFT JOIN public.spp_app_students s ON s.id_siswa = p.id_siswa;

REVOKE ALL ON TABLE public.spp_app_payment_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_list TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_payment_v1(
  p_username text,
  p_password text,
  p_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row public.spp_app_payments%ROWTYPE;
BEGIN
  DELETE FROM public.spp_app_payments WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Pembayaran tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'bayar_hapus', v_row.id_siswa, jsonb_build_object(
    'id', v_row.id, 'nospp', v_row.nospp, 'periode', v_row.periode,
    'nominal', v_row.nominal, 'component', v_row.component));
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_payment_components_v1(
  p_username text,
  p_password text,
  p_nospp text,
  p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_item jsonb;
  v_component text;
  v_period text;
  v_amount numeric;
  v_inserted integer := 0;
  v_total numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Isi pembayaran harus berupa daftar komponen.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 36 THEN
    RAISE EXCEPTION 'Isi 1 sampai 36 rincian pembayaran.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enr
  FROM public.spp_app_enrollments
  WHERE nospp = btrim(COALESCE(p_nospp, ''))
  ORDER BY tahun_ajaran DESC
  LIMIT 1;
  IF v_enr.nospp IS NULL THEN
    RAISE EXCEPTION 'No. SPP tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_component := lower(btrim(COALESCE(v_item->>'component', '')));
    v_period := btrim(COALESCE(v_item->>'periode', ''));
    v_amount := NULLIF(v_item->>'nominal', '')::numeric;

    IF v_component NOT IN (
      'spp', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
      'spp_tl', 'komp_tl', 'lainnya'
    ) THEN
      RAISE EXCEPTION 'Komponen pembayaran tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal setiap komponen harus lebih dari 0.' USING ERRCODE = '22023';
    END IF;

    IF v_component IN ('spp', 'komp') THEN
      IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
        RAISE EXCEPTION 'Periode SPP/KOMP harus berformat MMYYYY.' USING ERRCODE = '22023';
      END IF;
      IF to_date(v_period, 'MMYYYY') < make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer, 7, 1)
         OR to_date(v_period, 'MMYYYY') > make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer + 1, 6, 1) THEN
        RAISE EXCEPTION 'Periode SPP/KOMP harus berada di tahun ajaran siswa.' USING ERRCODE = '22023';
      END IF;
      IF v_enr.periode_masuk IS NOT NULL
         AND to_date(v_period, 'MMYYYY') < to_date(v_enr.periode_masuk, 'MMYYYY') THEN
        RAISE EXCEPTION 'Periode pembayaran lebih awal dari periode masuk siswa.' USING ERRCODE = '22023';
      END IF;
    ELSE
      v_period := '';
    END IF;

    INSERT INTO public.spp_app_payments
      (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component)
    VALUES
      (v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, v_period, v_amount, v_actor, v_component);

    v_inserted := v_inserted + 1;
    v_total := v_total + v_amount;
  END LOOP;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'bayar_tambah', v_enr.id_siswa, jsonb_build_object(
    'nospp', v_enr.nospp, 'jumlah_komponen', v_inserted, 'total_nominal', v_total,
    'items', p_items));

  RETURN v_inserted;
END;
$function$;

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
  IF v_active_date > date_trunc('month', current_date)::date THEN
    RAISE EXCEPTION 'Periode mendatang belum dapat dihitung sebagai tunggakan.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enr
  FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun;
  IF v_enr.id_siswa IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_student
  FROM public.spp_app_students
  WHERE id_siswa = p_id_siswa;

  v_start_date := make_date(v_start_year, 7, 1);
  IF v_enr.periode_masuk IS NOT NULL THEN
    v_start_date := greatest(v_start_date, to_date(v_enr.periode_masuk, 'MMYYYY'));
  END IF;

  IF v_start_date <= v_active_date THEN
    FOR v_month IN
      SELECT generate_series(
        date_trunc('month', v_start_date)::date,
        date_trunc('month', v_active_date)::date,
        interval '1 month'
      )::date
    LOOP
      v_period := to_char(v_month, 'MMYYYY');

      SELECT COALESCE(rate.spp, v_enr.spp), COALESCE(rate.komp, v_enr.komp)
      INTO v_spp_target, v_komp_target
      FROM (SELECT 1) AS seed
      LEFT JOIN LATERAL (
        SELECT h.spp, h.komp
        FROM public.spp_app_spp_history h
        WHERE h.id_siswa = p_id_siswa
          AND h.tahun_ajaran = p_tahun
          AND h.effective_date <= v_month
        ORDER BY h.effective_date DESC
        LIMIT 1
      ) AS rate ON true;

      SELECT COALESCE(sum(p.nominal), 0) INTO v_spp_paid
      FROM public.spp_app_payments p
      WHERE p.nospp = v_enr.nospp
        AND p.component = 'spp'
        AND p.periode = v_period;

      SELECT COALESCE(sum(p.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments p
      WHERE p.nospp = v_enr.nospp
        AND p.component = 'komp'
        AND p.periode = v_period;

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
          'status', CASE
            WHEN v_spp_target = 0 THEN '-'
            WHEN v_spp_remaining = 0 THEN 'Lunas'
            WHEN v_spp_paid + v_spp_credit_in > 0 THEN 'Cicilan'
            ELSE 'Belum bayar'
          END
        ),
        'komp', jsonb_build_object(
          'tagihan', v_komp_target, 'dibayar', v_komp_paid, 'saldo_dibawa', v_komp_credit_in,
          'sisa', v_komp_remaining,
          'status', CASE
            WHEN v_komp_target = 0 THEN '-'
            WHEN v_komp_remaining = 0 THEN 'Lunas'
            WHEN v_komp_paid + v_komp_credit_in > 0 THEN 'Cicilan'
            ELSE 'Belum bayar'
          END
        )
      ));
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
    WHERE p.nospp = v_enr.nospp AND p.component = v_component_row.component;

    v_component_remaining := greatest(v_component_row.target - v_component_paid, 0);
    v_one_time_total := v_one_time_total + v_component_remaining;
    v_components := v_components || jsonb_build_object(v_component_row.component, jsonb_build_object(
      'tagihan', v_component_row.target,
      'dibayar', v_component_paid,
      'sisa', v_component_remaining,
      'status', CASE
        WHEN v_component_row.target = 0 THEN '-'
        WHEN v_component_remaining = 0 THEN 'Lunas'
        WHEN v_component_paid > 0 THEN 'Cicilan'
        ELSE 'Belum bayar'
      END
    ));
  END LOOP;

  SELECT COALESCE(sum(p.nominal), 0), count(*)
  INTO v_unallocated, v_unallocated_count
  FROM public.spp_app_payments p
  WHERE p.nospp = v_enr.nospp AND p.component = 'legacy';

  SELECT max(p.tglbyr) INTO v_last_paid
  FROM public.spp_app_payments p
  WHERE p.nospp = v_enr.nospp;

  RETURN jsonb_build_object(
    'id_siswa', v_enr.id_siswa,
    'tahun_ajaran', v_enr.tahun_ajaran,
    'kdsek', v_enr.kdsek,
    'kdkls', v_enr.kdkls,
    'nospp', v_enr.nospp,
    'nama', v_student.nama,
    'no_wa', v_student.no_wa,
    'periode_aktif', p_periode,
    'periode_bulanan', v_periods,
    'komponen_satu_kali', v_components,
    'sisa_spp', v_spp_total_remaining,
    'sisa_komp', v_komp_total_remaining,
    'sisa_satu_kali', v_one_time_total,
    'sisa_total', v_spp_total_remaining + v_komp_total_remaining + v_one_time_total,
    'belum_dialokasikan', v_unallocated,
    'jumlah_belum_dialokasikan', v_unallocated_count,
    'terakhir_bayar', v_last_paid
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_class_billing_v1(
  p_tahun text,
  p_periode text,
  p_kdsek text DEFAULT NULL,
  p_kdkls text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id_siswa text,
  nospp text,
  nama text,
  kdsek text,
  kdkls text,
  no_wa text,
  billing jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
BEGIN
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$'
     OR p_periode IS NULL OR p_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran atau periode tidak valid.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id_siswa, e.nospp, s.nama, e.kdsek, e.kdkls, s.no_wa,
      public.spp_app_student_billing_v1(e.id_siswa, e.tahun_ajaran, p_periode) AS billing
    FROM public.spp_app_enrollments e
    JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun
      AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)
      AND (p_kdkls IS NULL OR e.kdkls = p_kdkls)
      AND NOT (s.is_staff_child AND NOT s.show_in_billing)
  ),
  owing AS (
    SELECT candidates.*
    FROM candidates
    WHERE COALESCE((candidates.billing->>'sisa_total')::numeric, 0) > 0
       OR COALESCE((candidates.billing->>'belum_dialokasikan')::numeric, 0) > 0
  )
  SELECT owing.id_siswa, owing.nospp, owing.nama, owing.kdsek, owing.kdkls,
    owing.no_wa, owing.billing, count(*) OVER ()
  FROM owing
  ORDER BY lower(owing.nama), owing.id_siswa
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_student_count_v1(
  p_tahun text DEFAULT NULL,
  p_kdsek text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT count(*)
  FROM public.spp_app_enrollments e
  WHERE (p_tahun IS NULL OR e.tahun_ajaran = p_tahun)
    AND (p_kdsek IS NULL OR e.kdsek = p_kdsek);
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_revenue_by_unit_v1(
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (kdsek text, bulan date, pemasukan numeric, transaksi bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_start integer;
BEGIN
  SELECT lower(COALESCE(m.role, 'unit')) INTO v_role
  FROM public.mastusr m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND btrim(COALESCE(m.password, '')) = btrim(COALESCE(p_password, ''));

  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses laporan pemasukan ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;

  v_start := split_part(p_tahun, '-', 1)::integer;
  RETURN QUERY
  SELECT p.kdsek, date_trunc('month', p.tglbyr)::date,
    sum(p.nominal), count(*)
  FROM public.spp_app_payments p
  WHERE p.tglbyr >= make_date(v_start, 7, 1)
    AND p.tglbyr < make_date(v_start + 1, 7, 1)
  GROUP BY p.kdsek, date_trunc('month', p.tglbyr)::date
  ORDER BY date_trunc('month', p.tglbyr)::date, p.kdsek;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_prior_year_revenue_v1(
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (
  kdsek text,
  dpp_tagihan numeric,
  dpp_terbayar numeric,
  spp_tl_tagihan numeric,
  spp_tl_terbayar numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_start integer;
BEGIN
  SELECT lower(COALESCE(m.role, 'unit')) INTO v_role
  FROM public.mastusr m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND btrim(COALESCE(m.password, '')) = btrim(COALESCE(p_password, ''));

  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses laporan pemasukan ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(p_tahun, '-', 1)::integer;

  RETURN QUERY
  WITH historical_due AS (
    SELECT a.id_siswa,
      sum(a.nominal) FILTER (WHERE a.jenis = 'dpp') AS dpp,
      sum(a.nominal) FILTER (WHERE a.jenis = 'spp') AS spp
    FROM public.spp_app_arrears a
    WHERE a.tahun_ajaran < p_tahun
    GROUP BY a.id_siswa
  ),
  paid AS (
    SELECT p.kdsek,
      sum(p.nominal) FILTER (WHERE p.component = 'dpp_tl') AS dpp,
      sum(p.nominal) FILTER (WHERE p.component = 'spp_tl') AS spp
    FROM public.spp_app_payments p
    WHERE p.tglbyr >= make_date(v_start, 7, 1)
      AND p.tglbyr < make_date(v_start + 1, 7, 1)
    GROUP BY p.kdsek
  ),
  due AS (
    SELECT e.kdsek, sum(COALESCE(h.dpp, 0)) AS dpp, sum(COALESCE(h.spp, 0)) AS spp
    FROM public.spp_app_enrollments e
    JOIN historical_due h ON h.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun
    GROUP BY e.kdsek
  )
  SELECT COALESCE(d.kdsek, paid.kdsek),
    COALESCE(d.dpp, 0), COALESCE(paid.dpp, 0),
    COALESCE(d.spp, 0), COALESCE(paid.spp, 0)
  FROM due d
  FULL JOIN paid ON paid.kdsek = d.kdsek
  WHERE COALESCE(d.dpp, 0) > 0 OR COALESCE(d.spp, 0) > 0
     OR COALESCE(paid.dpp, 0) > 0 OR COALESCE(paid.spp, 0) > 0
  ORDER BY 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_payment_v1(text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_student_billing_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_class_billing_v1(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_student_count_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_revenue_by_unit_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_prior_year_revenue_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment_v1(text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_student_billing_v1(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_class_billing_v1(text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_student_count_v1(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_revenue_by_unit_v1(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_prior_year_revenue_v1(text, text, text) TO anon, authenticated;

COMMIT;
