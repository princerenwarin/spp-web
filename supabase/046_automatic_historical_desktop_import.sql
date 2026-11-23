-- Create missing student enrollments from desktop payment history and carry
-- activity payments forward through existing academic-year dues.
-- Run after 045_desktop_activity_import_year.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.spp_app_desktop_student_id_map (
  legacy_id text PRIMARY KEY CHECK (char_length(btrim(legacy_id)) BETWEEN 1 AND 100),
  id_siswa text NOT NULL REFERENCES public.spp_app_students (id_siswa),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spp_app_desktop_student_id_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read desktop student ID map" ON public.spp_app_desktop_student_id_map;
REVOKE ALL ON TABLE public.spp_app_desktop_student_id_map FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_desktop_student_id_map_v1(
  p_username text,
  p_password text,
  p_legacy_ids text[]
)
RETURNS TABLE (legacy_id text, id_siswa text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  IF p_legacy_ids IS NULL OR cardinality(p_legacy_ids) > 500 THEN
    RAISE EXCEPTION 'Daftar ID lama tidak valid.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT mapping.legacy_id, mapping.id_siswa
  FROM public.spp_app_desktop_student_id_map mapping
  WHERE mapping.legacy_id = ANY(p_legacy_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_desktop_student_id_map_v1(text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_desktop_student_id_map_v1(text, text, text[])
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_allocate_activity_payment(
  p_payment_id bigint,
  p_id_siswa text,
  p_target_year text,
  p_nominal numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_due record;
  v_paid numeric;
  v_available numeric;
  v_remaining numeric := p_nominal;
  v_allocated numeric;
  v_start_year integer;
  v_limit_year text;
  v_latest_year text;
BEGIN
  IF p_payment_id IS NULL OR NULLIF(btrim(p_id_siswa), '') IS NULL
     OR p_target_year !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(p_target_year, '-', 2)::integer
       <> split_part(p_target_year, '-', 1)::integer + 1
     OR p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'Alokasi uang Kegiatan tidak valid.' USING ERRCODE = '22023';
  END IF;

  v_start_year := split_part(p_target_year, '-', 1)::integer;
  v_limit_year := (v_start_year + 1)::text || '-' || (v_start_year + 2)::text;
  SELECT max(years.tahun_ajaran) INTO v_latest_year
  FROM (
    SELECT enrollment.tahun_ajaran
    FROM public.spp_app_enrollments enrollment
    WHERE enrollment.id_siswa = p_id_siswa
    UNION ALL
    SELECT arrears.tahun_ajaran
    FROM public.spp_app_arrears arrears
    WHERE arrears.id_siswa = p_id_siswa AND arrears.jenis = 'kegiatan'
  ) years;
  IF v_latest_year IS NOT NULL AND v_latest_year > v_limit_year THEN
    v_limit_year := v_latest_year;
  END IF;

  FOR v_due IN
    SELECT due.tahun_ajaran, sum(due.nominal)::numeric AS nominal
    FROM (
      SELECT enrollment.tahun_ajaran, enrollment.giat AS nominal
      FROM public.spp_app_enrollments enrollment
      WHERE enrollment.id_siswa = p_id_siswa
        AND enrollment.tahun_ajaran <= v_limit_year
        AND enrollment.giat > 0
      UNION ALL
      SELECT arrears.tahun_ajaran, arrears.nominal
      FROM public.spp_app_arrears arrears
      WHERE arrears.id_siswa = p_id_siswa AND arrears.jenis = 'kegiatan'
        AND arrears.tahun_ajaran <= v_limit_year AND arrears.nominal > 0
    ) due
    GROUP BY due.tahun_ajaran
    ORDER BY due.tahun_ajaran
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT COALESCE(sum(allocation.nominal), 0) INTO v_paid
    FROM public.spp_app_activity_allocations allocation
    JOIN public.spp_app_payments payment ON payment.id = allocation.payment_id
    JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
    WHERE payment.id_siswa = p_id_siswa
      AND allocation.tahun_ajaran = v_due.tahun_ajaran
      AND batch.voided_at IS NULL;

    v_available := greatest(v_due.nominal - v_paid, 0);
    v_allocated := least(v_remaining, v_available);
    IF v_allocated > 0 THEN
      INSERT INTO public.spp_app_activity_allocations (payment_id, tahun_ajaran, nominal)
      VALUES (p_payment_id, v_due.tahun_ajaran, v_allocated);
      v_remaining := v_remaining - v_allocated;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.spp_app_activity_allocations (payment_id, tahun_ajaran, nominal)
    VALUES (p_payment_id, v_limit_year, v_remaining)
    ON CONFLICT (payment_id, tahun_ajaran)
    DO UPDATE SET nominal = public.spp_app_activity_allocations.nominal + EXCLUDED.nominal;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_allocate_activity_payment(bigint, text, text, numeric)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_prepare_legacy_desktop_rows_v1(
  p_actor text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_item jsonb;
  v_items jsonb;
  v_id text;
  v_legacy_id text;
  v_source_name text;
  v_source_school text;
  v_source_class text;
  v_source_fingerprint text;
  v_source_key text;
  v_year text;
  v_start_year integer;
  v_school_code text;
  v_class_name text;
  v_school_matches integer;
  v_class_matches integer;
  v_source_pair_valid boolean;
  v_student_found boolean;
  v_existing_enrollment public.spp_app_enrollments%ROWTYPE;
  v_template public.spp_app_enrollments%ROWTYPE;
  v_has_template boolean;
  v_nospp text;
  v_spp numeric;
  v_komp numeric;
  v_dpp numeric;
  v_dsp numeric;
  v_seragam numeric;
  v_giat numeric;
  v_paid_spp numeric;
  v_paid_komp numeric;
  v_paid_dpp numeric;
  v_paid_dsp numeric;
  v_paid_seragam numeric;
  v_paid_giat numeric;
  v_period_rate record;
  v_period text;
  v_period_date date;
  v_current_spp numeric;
  v_current_komp numeric;
  v_entry_type text;
  v_location text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'File harus berisi 1 sampai 500 baris pembayaran.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.spp_app_student_id_seq'));
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_id := btrim(COALESCE(v_row->>'id_siswa', ''));
    v_legacy_id := btrim(COALESCE(v_row->>'source_id', ''));
    v_source_name := NULLIF(btrim(COALESCE(v_row->>'source_name', '')), '');
    v_location := COALESCE(NULLIF(btrim(v_row->>'source_location'), ''), 'baris impor');

    IF char_length(v_legacy_id) > 100 THEN
      RAISE EXCEPTION 'ID lama maksimal 100 karakter (%).', v_location USING ERRCODE = '22023';
    END IF;
    IF COALESCE((v_row->>'auto_create_student')::boolean, false) THEN
      IF v_legacy_id = '' THEN
        RAISE EXCEPTION 'ID lama wajib ada untuk membuat siswa otomatis (%).', v_location
          USING ERRCODE = '22023';
      END IF;
      SELECT mapping.id_siswa INTO v_id
      FROM public.spp_app_desktop_student_id_map mapping
      WHERE mapping.legacy_id = v_legacy_id
      FOR UPDATE;
      IF NOT FOUND THEN
        IF v_source_name IS NULL OR char_length(v_source_name) > 100 THEN
          RAISE EXCEPTION 'Nama siswa wajib diisi dan maksimal 100 karakter untuk membuat ID baru (%).', v_location
            USING ERRCODE = '22023';
        END IF;
        v_id := nextval('public.spp_app_student_id_seq'::regclass)::text;
        IF v_id !~ '^[0-9]{1,10}$' THEN
          RAISE EXCEPTION 'Urutan ID siswa sudah melewati batas 10 digit.' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.spp_app_students (id_siswa, nama)
        VALUES (v_id, v_source_name);
        INSERT INTO public.spp_app_desktop_student_id_map (legacy_id, id_siswa)
        VALUES (v_legacy_id, v_id);
        INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
        VALUES (p_actor, 'siswa_import_desktop_otomatis', v_id, jsonb_build_object(
          'id_lama', v_legacy_id, 'nama', v_source_name, 'sumber', 'impor desktop'));
      END IF;
    ELSIF v_id = '' OR NOT EXISTS (
      SELECT 1 FROM public.spp_app_students student WHERE student.id_siswa = v_id
    ) THEN
      RAISE EXCEPTION 'Siswa belum ditemukan untuk %.', v_location USING ERRCODE = '22023';
    ELSIF v_legacy_id <> '' THEN
      INSERT INTO public.spp_app_desktop_student_id_map (legacy_id, id_siswa)
      VALUES (v_legacy_id, v_id)
      ON CONFLICT (legacy_id) DO NOTHING;
      IF NOT EXISTS (
        SELECT 1 FROM public.spp_app_desktop_student_id_map mapping
        WHERE mapping.legacy_id = v_legacy_id AND mapping.id_siswa = v_id
      ) THEN
        RAISE EXCEPTION 'ID lama % sudah dipetakan ke siswa lain.', v_legacy_id
          USING ERRCODE = '23505';
      END IF;
    END IF;

    v_source_fingerprint := btrim(COALESCE(v_row->>'source_fingerprint', ''));
    IF v_source_fingerprint <> '' THEN
      v_source_key := 'desktop:' || v_source_fingerprint || ':' || v_id;
      v_row := jsonb_set(v_row, '{source_key}', to_jsonb(v_source_key), true);
    END IF;
    v_row := jsonb_set(v_row, '{id_siswa}', to_jsonb(v_id), true);
    v_year := btrim(COALESCE(v_row->>'tahun_ajaran', ''));
    IF v_year <> '' AND jsonb_typeof(v_row->'items') = 'array' THEN
      SELECT COALESCE(jsonb_agg(
        CASE WHEN item.value->>'component' = 'giat'
          THEN jsonb_set(item.value, '{activity_tahun_ajaran}', to_jsonb(v_year), true)
          ELSE item.value
        END
      ), '[]'::jsonb)
      INTO v_items
      FROM jsonb_array_elements(v_row->'items') AS item(value);
      v_row := jsonb_set(v_row, '{items}', v_items, true);
    END IF;
    v_rows := v_rows || jsonb_build_array(v_row);
  END LOOP;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_rows)
    ORDER BY value->>'id_siswa', value->>'tahun_ajaran'
  LOOP
    v_id := btrim(COALESCE(v_row->>'id_siswa', ''));
    v_year := btrim(COALESCE(v_row->>'tahun_ajaran', ''));
    v_location := COALESCE(NULLIF(btrim(v_row->>'source_location'), ''), 'baris impor');
    IF v_year !~ '^[0-9]{4}-[0-9]{4}$'
       OR split_part(v_year, '-', 2)::integer
         <> split_part(v_year, '-', 1)::integer + 1 THEN
      RAISE EXCEPTION 'Tahun ajaran transaksi tidak valid (%).', v_location USING ERRCODE = '22023';
    END IF;
    v_start_year := split_part(v_year, '-', 1)::integer;

    SELECT * INTO v_existing_enrollment
    FROM public.spp_app_enrollments enrollment
    WHERE enrollment.id_siswa = v_id AND enrollment.tahun_ajaran = v_year
    FOR UPDATE;
    IF FOUND AND v_existing_enrollment.nospp IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_template
    FROM public.spp_app_enrollments enrollment
    WHERE enrollment.id_siswa = v_id
      AND enrollment.tahun_ajaran <> v_year
      AND enrollment.nospp IS NOT NULL
    ORDER BY abs(split_part(enrollment.tahun_ajaran, '-', 1)::integer - v_start_year),
      enrollment.tahun_ajaran DESC
    LIMIT 1;
    v_has_template := FOUND;

    v_source_school := btrim(COALESCE(v_row->>'source_school', ''));
    v_source_class := btrim(COALESCE(v_row->>'source_class', ''));
    v_school_code := NULL;
    v_class_name := NULL;
    v_source_pair_valid := false;
    IF v_source_school <> '' AND v_source_class <> '' THEN
      SELECT count(DISTINCT settings.school_code), min(settings.school_code)
      INTO v_school_matches, v_school_code
      FROM public.spp_app_school_settings settings
      WHERE lower(btrim(settings.school_code)) = lower(v_source_school)
        OR lower(btrim(settings.school_name)) = lower(v_source_school);
      IF v_school_matches = 1 THEN
        SELECT count(*), min(classes.class_name)
        INTO v_class_matches, v_class_name
        FROM public.spp_app_school_classes classes
        WHERE classes.school_code = v_school_code
          AND lower(btrim(classes.class_name)) = lower(v_source_class);
        v_source_pair_valid := v_class_matches = 1;
      END IF;
    END IF;

    IF NOT v_source_pair_valid AND v_has_template THEN
      v_school_code := v_template.kdsek;
      v_class_name := v_template.kdkls;
    ELSIF NOT v_source_pair_valid AND v_existing_enrollment.id_siswa IS NOT NULL
      AND COALESCE(v_existing_enrollment.kdsek, '') <> ''
      AND COALESCE(v_existing_enrollment.kdkls, '') <> '' THEN
      v_school_code := v_existing_enrollment.kdsek;
      v_class_name := v_existing_enrollment.kdkls;
    ELSIF NOT v_source_pair_valid THEN
      RAISE EXCEPTION 'Sekolah dan kelas pada file tidak cocok dengan pengaturan aplikasi (%).', v_location
        USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_school_code, '') = '' OR COALESCE(v_class_name, '') = '' THEN
      RAISE EXCEPTION 'Sekolah dan kelas wajib tersedia untuk membuat No. SPP (%).', v_location
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_has_template THEN
      SELECT * INTO v_template
      FROM public.spp_app_enrollments enrollment
      WHERE enrollment.kdsek = v_school_code AND enrollment.kdkls = v_class_name
        AND enrollment.nospp IS NOT NULL
      ORDER BY enrollment.tahun_ajaran DESC
      LIMIT 1;
      v_has_template := FOUND;
    END IF;
    IF NOT v_has_template AND v_existing_enrollment.id_siswa IS NOT NULL THEN
      v_template := v_existing_enrollment;
      v_has_template := true;
    END IF;
    IF NOT v_has_template THEN
      RAISE EXCEPTION 'Belum ada contoh tarif pada sekolah dan kelas ini; lengkapi data tarif terlebih dahulu (%).', v_location
        USING ERRCODE = '22023';
    END IF;

    SELECT
      max(NULLIF((payment_row.value->>'spp_gross')::numeric, 0))
        FILTER (WHERE payment_item.value->>'component' IN ('spp', 'spp_bos')),
      max((payment_item.value->>'nominal')::numeric)
        FILTER (WHERE payment_item.value->>'component' = 'komp'),
      max((payment_item.value->>'nominal')::numeric)
        FILTER (WHERE payment_item.value->>'component' = 'dpp'),
      max((payment_item.value->>'nominal')::numeric)
        FILTER (WHERE payment_item.value->>'component' = 'dsp'),
      max((payment_item.value->>'nominal')::numeric)
        FILTER (WHERE payment_item.value->>'component' = 'seragam'),
      max((payment_item.value->>'nominal')::numeric)
        FILTER (WHERE payment_item.value->>'component' = 'giat')
    INTO v_paid_spp, v_paid_komp, v_paid_dpp, v_paid_dsp, v_paid_seragam, v_paid_giat
    FROM jsonb_array_elements(v_rows) AS payment_row(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(payment_row.value->'items', '[]'::jsonb)
    ) AS payment_item(value)
    WHERE payment_row.value->>'id_siswa' = v_id
      AND payment_row.value->>'tahun_ajaran' = v_year;

    v_spp := COALESCE(v_paid_spp, v_template.spp, 0);
    v_komp := COALESCE(v_paid_komp, v_template.komp, 0);
    v_dpp := COALESCE(v_paid_dpp, v_template.dpp, 0);
    v_dsp := COALESCE(v_paid_dsp, v_template.dsp, 0);
    v_seragam := COALESCE(v_paid_seragam, v_template.seragam, 0);
    v_giat := COALESCE(v_paid_giat, v_template.giat, 0);
    v_nospp := right(v_start_year::text, 2) || right((v_start_year + 1)::text, 2)
      || '-' || upper(regexp_replace(v_school_code, '\s', '', 'g'))
      || '-' || upper(regexp_replace(v_class_name, '\s', '', 'g'))
      || '-' || lpad(v_id, 4, '0');

    IF v_existing_enrollment.id_siswa IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.spp_app_enrollments enrollment WHERE enrollment.id_siswa = v_id) THEN
        v_entry_type := 'naik';
      ELSE
        v_entry_type := 'baru';
      END IF;
      INSERT INTO public.spp_app_enrollments
        (id_siswa, tahun_ajaran, kdsek, kdkls, nospp, entry_type,
         dpp, dsp, seragam, giat, spp, komp, periode_masuk)
      VALUES
        (v_id, v_year, v_school_code, v_class_name, v_nospp, v_entry_type,
         v_dpp, v_dsp, v_seragam, v_giat, v_spp, v_komp, NULL);
    ELSE
      UPDATE public.spp_app_enrollments
      SET kdsek = v_school_code, kdkls = v_class_name, nospp = v_nospp,
          dpp = v_dpp, dsp = v_dsp, seragam = v_seragam, giat = v_giat,
          spp = v_spp, komp = v_komp, periode_masuk = NULL
      WHERE id_siswa = v_id AND tahun_ajaran = v_year;
    END IF;

    INSERT INTO public.spp_app_spp_history
      (id_siswa, tahun_ajaran, effective_date, spp, komp, changed_by)
    VALUES (v_id, v_year, make_date(v_start_year, 7, 1), v_spp, v_komp, p_actor)
    ON CONFLICT (id_siswa, tahun_ajaran, effective_date)
    DO UPDATE SET spp = EXCLUDED.spp, komp = EXCLUDED.komp, changed_by = EXCLUDED.changed_by;

    v_current_spp := v_spp;
    v_current_komp := v_komp;
    FOR v_period_rate IN
      SELECT payment_item.value->>'periode' AS periode,
        max(NULLIF((payment_row.value->>'spp_gross')::numeric, 0))
          FILTER (WHERE payment_item.value->>'component' IN ('spp', 'spp_bos')) AS spp,
        max((payment_item.value->>'nominal')::numeric)
          FILTER (WHERE payment_item.value->>'component' = 'komp') AS komp
      FROM jsonb_array_elements(v_rows) AS payment_row(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(payment_row.value->'items', '[]'::jsonb)
      ) AS payment_item(value)
      WHERE payment_row.value->>'id_siswa' = v_id
        AND payment_row.value->>'tahun_ajaran' = v_year
        AND payment_item.value->>'component' IN ('spp', 'spp_bos', 'komp')
      GROUP BY payment_item.value->>'periode'
      ORDER BY right(payment_item.value->>'periode', 4), left(payment_item.value->>'periode', 2)
    LOOP
      v_period := btrim(COALESCE(v_period_rate.periode, ''));
      IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
        RAISE EXCEPTION 'Periode SPP/Komputer tidak valid saat membuat tahun ajaran (%).', v_location
          USING ERRCODE = '22023';
      END IF;
      v_period_date := make_date(right(v_period, 4)::integer, left(v_period, 2)::integer, 1);
      IF v_period_date NOT BETWEEN make_date(v_start_year, 7, 1)
        AND make_date(v_start_year + 1, 6, 1) THEN
        RAISE EXCEPTION 'Periode pembayaran tidak sesuai tahun ajaran saat membuat enrollment (%).', v_location
          USING ERRCODE = '22023';
      END IF;
      v_current_spp := COALESCE(v_period_rate.spp, v_current_spp);
      v_current_komp := COALESCE(v_period_rate.komp, v_current_komp);
      INSERT INTO public.spp_app_spp_history
        (id_siswa, tahun_ajaran, effective_date, spp, komp, changed_by)
      VALUES (v_id, v_year, v_period_date, v_current_spp, v_current_komp, p_actor)
      ON CONFLICT (id_siswa, tahun_ajaran, effective_date)
      DO UPDATE SET spp = EXCLUDED.spp, komp = EXCLUDED.komp, changed_by = EXCLUDED.changed_by;
    END LOOP;

    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (p_actor, 'enrollment_import_desktop_otomatis', v_id, jsonb_build_object(
      'tahun_ajaran', v_year, 'nospp', v_nospp, 'kdsek', v_school_code, 'kdkls', v_class_name,
      'dpp', v_dpp, 'dsp', v_dsp, 'seragam', v_seragam, 'giat', v_giat,
      'spp', v_spp, 'komp', v_komp, 'periode_masuk', NULL, 'sumber', 'impor desktop'));
  END LOOP;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_prepare_legacy_desktop_rows_v1(text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_legacy_payment_batches_v3(
  p_username text,
  p_password text,
  p_rows jsonb
)
RETURNS bigint[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_rows jsonb;
  v_row jsonb;
BEGIN
  v_rows := public.spp_app_prepare_legacy_desktop_rows_v1(v_actor, p_rows);
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_row->'items', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'component' = 'giat'
    ) THEN
      UPDATE public.spp_app_payments payment
      SET activity_tahun_ajaran = NULL
      FROM public.spp_app_payment_batches batch
      WHERE batch.import_key = v_row->>'source_key'
        AND batch.voided_at IS NULL
        AND payment.batch_id = batch.id
        AND payment.component = 'giat';
    END IF;
  END LOOP;
  RETURN public.import_legacy_payment_batches_v2(p_username, p_password, v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.import_legacy_payment_batches_v3(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_payment_batches_v3(text, text, jsonb)
  TO anon, authenticated;

COMMIT;
