-- Fix the report output-variable collision and add reviewed payment imports.
-- Run after 016_payment_components_and_reporting.sql.

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

CREATE OR REPLACE FUNCTION public.import_payment_components_v1(
  p_username text,
  p_password text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row jsonb;
  v_row_number bigint;
  v_item jsonb;
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_nospp text;
  v_tglbyr date;
  v_items jsonb;
  v_component text;
  v_period text;
  v_amount numeric;
  v_inserted integer := 0;
  v_row_inserted integer;
  v_row_total numeric;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'File harus berisi daftar pembayaran.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'File harus berisi 1 sampai 500 baris pembayaran.' USING ERRCODE = '22023';
  END IF;

  FOR v_row, v_row_number IN
    SELECT value, ordinality FROM jsonb_array_elements(p_rows) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Baris % tidak valid.', v_row_number USING ERRCODE = '22023';
    END IF;

    v_nospp := btrim(COALESCE(v_row->>'nospp', ''));
    v_items := v_row->'items';
    BEGIN
      v_tglbyr := COALESCE(NULLIF(v_row->>'tglbyr', '')::date, current_date);
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Tanggal pada baris % tidak valid.', v_row_number USING ERRCODE = '22023';
    END;
    IF v_tglbyr > current_date THEN
      RAISE EXCEPTION 'Tanggal pada baris % tidak boleh di masa depan.', v_row_number USING ERRCODE = '22023';
    END IF;
    IF v_nospp = '' THEN
      RAISE EXCEPTION 'No. SPP pada baris % belum dipilih.', v_row_number USING ERRCODE = '22023';
    END IF;
    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
      RAISE EXCEPTION 'Rincian pembayaran pada baris % tidak valid.', v_row_number USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 36 THEN
      RAISE EXCEPTION 'Rincian pembayaran pada baris % tidak valid.', v_row_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_enr
    FROM public.spp_app_enrollments
    WHERE nospp = v_nospp
    ORDER BY tahun_ajaran DESC
    LIMIT 1;
    IF v_enr.nospp IS NULL THEN
      RAISE EXCEPTION 'No. SPP pada baris % tidak ditemukan.', v_row_number USING ERRCODE = '22023';
    END IF;

    v_row_inserted := 0;
    v_row_total := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
    LOOP
      v_component := lower(btrim(COALESCE(v_item->>'component', '')));
      v_period := btrim(COALESCE(v_item->>'periode', ''));
      v_amount := NULLIF(v_item->>'nominal', '')::numeric;

      IF v_component NOT IN (
        'spp', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
        'spp_tl', 'komp_tl', 'lainnya'
      ) THEN
        RAISE EXCEPTION 'Komponen pada baris % tidak valid.', v_row_number USING ERRCODE = '22023';
      END IF;
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal pada baris % harus lebih dari 0.', v_row_number USING ERRCODE = '22023';
      END IF;

      IF v_component IN ('spp', 'komp') THEN
        IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
          RAISE EXCEPTION 'Periode pada baris % tidak valid.', v_row_number USING ERRCODE = '22023';
        END IF;
        IF to_date(v_period, 'MMYYYY') < make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer, 7, 1)
           OR to_date(v_period, 'MMYYYY') > make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer + 1, 6, 1) THEN
          RAISE EXCEPTION 'Periode pada baris % berada di luar tahun ajaran siswa.', v_row_number USING ERRCODE = '22023';
        END IF;
        IF v_enr.periode_masuk IS NOT NULL
           AND to_date(v_period, 'MMYYYY') < to_date(v_enr.periode_masuk, 'MMYYYY') THEN
          RAISE EXCEPTION 'Periode pada baris % lebih awal dari periode masuk siswa.', v_row_number USING ERRCODE = '22023';
        END IF;
      ELSE
        v_period := '';
      END IF;

      INSERT INTO public.spp_app_payments
        (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component, tglbyr)
      VALUES
        (v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, v_period, v_amount, v_actor, v_component, v_tglbyr);

      v_row_inserted := v_row_inserted + 1;
      v_inserted := v_inserted + 1;
      v_row_total := v_row_total + v_amount;
    END LOOP;

    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (v_actor, 'bayar_import', v_enr.id_siswa, jsonb_build_object(
      'nospp', v_enr.nospp, 'tanggal', v_tglbyr,
      'jumlah_komponen', v_row_inserted,
      'total_nominal', v_row_total));
  END LOOP;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_class_billing_v1(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_payment_components_v1(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_class_billing_v1(text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_payment_components_v1(text, text, jsonb) TO anon, authenticated;
