-- Preserve IDs supplied by legacy student files and keep generated IDs ahead of them.
-- Run after 036_fix_card_print_password_validation.sql. The 037 reset script is optional.
BEGIN;

CREATE OR REPLACE FUNCTION public.spp_app_enroll(p_actor text, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_type text := lower(btrim(COALESCE(p_row->>'jenis', '')));
  v_ta text := btrim(COALESCE(p_row->>'tahun_ajaran', ''));
  v_sek text := btrim(COALESCE(p_row->>'kdsek', ''));
  v_kls text := btrim(COALESCE(p_row->>'kdkls', ''));
  v_id text := btrim(COALESCE(p_row->>'id_siswa', ''));
  v_nama text := NULLIF(btrim(COALESCE(p_row->>'nama', '')), '');
  v_wa text := NULLIF(regexp_replace(COALESCE(p_row->>'no_wa', ''), '[\s-]', '', 'g'), '');
  v_periode text := NULLIF(btrim(COALESCE(p_row->>'periode_masuk', '')), '');
  v_start int;
  v_dpp numeric; v_dsp numeric; v_seragam numeric; v_giat numeric; v_spp numeric; v_komp numeric;
  v_nospp text;
  v_effective date;
  v_id_exists boolean;
BEGIN
  IF v_type NOT IN ('baru', 'naik') THEN
    RAISE EXCEPTION 'Jenis harus "baru" atau "naik".' USING ERRCODE = '22023';
  END IF;
  IF v_ta !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(v_ta, '-', 2)::int <> split_part(v_ta, '-', 1)::int + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid (contoh 2026-2027).' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(v_ta, '-', 1)::int;

  BEGIN
    v_dpp := COALESCE(NULLIF(btrim(p_row->>'dpp'), ''), '0')::numeric;
    v_dsp := COALESCE(NULLIF(btrim(p_row->>'dsp'), ''), '0')::numeric;
    v_seragam := COALESCE(NULLIF(btrim(p_row->>'seragam'), ''), '0')::numeric;
    v_giat := COALESCE(NULLIF(btrim(p_row->>'giat'), ''), '0')::numeric;
    v_spp := COALESCE(NULLIF(btrim(p_row->>'spp'), ''), '0')::numeric;
    v_komp := COALESCE(NULLIF(btrim(p_row->>'komp'), ''), '0')::numeric;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Nominal harus berupa angka.' USING ERRCODE = '22023';
  END;
  IF LEAST(v_dpp, v_dsp, v_seragam, v_giat, v_spp, v_komp) < 0 THEN
    RAISE EXCEPTION 'Nominal tidak boleh negatif.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.spp_app_school_settings s
    WHERE s.school_code = v_sek AND s.is_active
  ) THEN
    RAISE EXCEPTION 'Sekolah % tidak aktif atau tidak ditemukan.', v_sek USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.spp_app_school_classes c
    WHERE c.school_code = v_sek AND c.class_name = v_kls AND c.is_active
  ) THEN
    RAISE EXCEPTION 'Kelas % tidak aktif untuk sekolah %.', v_kls, v_sek USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.spp_app_student_id_seq'));

  IF v_id <> '' THEN
    IF v_id !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'ID siswa tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.spp_app_students WHERE id_siswa = v_id) THEN
      INSERT INTO public.spp_app_students (id_siswa, nama, no_wa)
      SELECT m.id, btrim(m.nama), COALESCE(v_wa, NULLIF(regexp_replace(COALESCE(m.no_hp, ''), '[\s-]', '', 'g'), ''))
      FROM public.mastank m WHERE m.id = v_id
      ON CONFLICT DO NOTHING;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.spp_app_students WHERE id_siswa = v_id)
    INTO v_id_exists;

    IF v_id_exists THEN
      v_type := 'naik';
      IF v_wa IS NOT NULL AND v_wa !~ '^[0-9+]{8,20}$' THEN
        RAISE EXCEPTION 'No. WhatsApp tidak valid.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.spp_app_students
      SET nama = COALESCE(v_nama, nama), no_wa = COALESCE(v_wa, no_wa), updated_at = now()
      WHERE id_siswa = v_id;
      IF EXISTS (SELECT 1 FROM public.spp_app_enrollments WHERE id_siswa = v_id AND tahun_ajaran = v_ta) THEN
        RAISE EXCEPTION 'Siswa % sudah terdaftar di tahun ajaran %.', v_id, v_ta USING ERRCODE = '23505';
      END IF;
      v_periode := NULL;
      v_dpp := 0; v_dsp := 0; v_seragam := 0;
    ELSE
      v_type := 'baru';
      IF v_nama IS NULL THEN
        RAISE EXCEPTION 'Nama wajib diisi.' USING ERRCODE = '22023';
      END IF;
      IF v_wa IS NOT NULL AND v_wa !~ '^[0-9+]{8,20}$' THEN
        RAISE EXCEPTION 'No. WhatsApp tidak valid.' USING ERRCODE = '22023';
      END IF;
      IF v_periode IS NULL OR v_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$'
         OR to_date(v_periode, 'MMYYYY') NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
        RAISE EXCEPTION 'Periode masuk harus di dalam tahun ajaran (Juli % - Juni %).', v_start, v_start + 1
          USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.spp_app_students (id_siswa, nama, no_wa)
      VALUES (v_id, v_nama, v_wa);
    END IF;

    PERFORM setval(
      'public.spp_app_student_id_seq',
      GREATEST(v_id::bigint, (SELECT last_value FROM public.spp_app_student_id_seq)),
      true
    );
  ELSE
    IF v_type = 'naik' THEN
      RAISE EXCEPTION 'ID siswa wajib diisi untuk naik kelas.' USING ERRCODE = '22023';
    END IF;
    IF v_nama IS NULL THEN
      RAISE EXCEPTION 'Nama wajib diisi.' USING ERRCODE = '22023';
    END IF;
    IF v_wa IS NULL OR v_wa !~ '^[0-9+]{8,20}$' THEN
      RAISE EXCEPTION 'No. WhatsApp tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF v_periode IS NULL OR v_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$'
       OR to_date(v_periode, 'MMYYYY') NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
      RAISE EXCEPTION 'Periode masuk harus di dalam tahun ajaran (Juli % - Juni %).', v_start, v_start + 1
        USING ERRCODE = '22023';
    END IF;
    v_type := 'baru';
    v_id := nextval('public.spp_app_student_id_seq')::text;
    IF v_id !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'Urutan ID siswa sudah melewati batas 10 digit.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.spp_app_students (id_siswa, nama, no_wa) VALUES (v_id, v_nama, v_wa);
  END IF;

  v_nospp := right(v_start::text, 2) || right((v_start + 1)::text, 2)
    || '-' || upper(regexp_replace(v_sek, '\s', '', 'g'))
    || '-' || upper(regexp_replace(v_kls, '\s', '', 'g'))
    || '-' || lpad(v_id, 4, '0');

  INSERT INTO public.spp_app_enrollments
    (id_siswa, tahun_ajaran, kdsek, kdkls, nospp, entry_type, dpp, dsp, seragam, giat, spp, komp, periode_masuk)
  VALUES (v_id, v_ta, v_sek, v_kls, v_nospp, v_type, v_dpp, v_dsp, v_seragam, v_giat, v_spp, v_komp, v_periode);

  v_effective := COALESCE(to_date(v_periode, 'MMYYYY'), make_date(v_start, 7, 1));
  INSERT INTO public.spp_app_spp_history (id_siswa, tahun_ajaran, effective_date, spp, komp, changed_by)
  VALUES (v_id, v_ta, make_date(v_start, 7, 1), v_spp, v_komp, p_actor);

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (p_actor, CASE v_type WHEN 'baru' THEN 'siswa_baru' ELSE 'naik_kelas' END, v_id,
    jsonb_build_object('tahun_ajaran', v_ta, 'kdsek', v_sek, 'kdkls', v_kls, 'nospp', v_nospp,
      'dpp', v_dpp, 'dsp', v_dsp, 'seragam', v_seragam, 'giat', v_giat, 'spp', v_spp, 'komp', v_komp,
      'periode_masuk', v_periode, 'berlaku_mulai', v_effective));

  RETURN jsonb_build_object('id_siswa', v_id, 'nospp', v_nospp);
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_students_v1(
  p_username text,
  p_password text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row jsonb;
  v_no int := 0;
  v_results jsonb := '[]'::jsonb;
  v_max_file_id bigint;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Import harus berisi 1 sampai 2000 baris.' USING ERRCODE = '22023';
  END IF;

  SELECT max((item.value->>'id_siswa')::bigint)
  INTO v_max_file_id
  FROM jsonb_array_elements(p_rows) AS item(value)
  WHERE btrim(COALESCE(item.value->>'id_siswa', '')) ~ '^[0-9]{1,10}$';

  PERFORM pg_advisory_xact_lock(hashtext('public.spp_app_student_id_seq'));
  IF v_max_file_id IS NOT NULL THEN
    PERFORM setval(
      'public.spp_app_student_id_seq',
      GREATEST(v_max_file_id, (SELECT last_value FROM public.spp_app_student_id_seq)),
      true
    );
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_no := v_no + 1;
    BEGIN
      v_results := v_results || public.spp_app_enroll(v_actor, v_row);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Baris %: %', v_no, SQLERRM USING ERRCODE = '22023';
    END;
  END LOOP;
  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'import_massal', jsonb_build_object('jumlah', v_no));
  RETURN v_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_student_v1(
  p_username text,
  p_password text,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_type text := lower(btrim(COALESCE(p_row->>'jenis', '')));
  v_year text := btrim(COALESCE(p_row->>'tahun_ajaran', ''));
  v_school text := btrim(COALESCE(p_row->>'kdsek', ''));
  v_class text := NULLIF(btrim(COALESCE(p_row->>'kdkls', '')), '');
  v_id text := btrim(COALESCE(p_row->>'id_siswa', ''));
  v_name text := NULLIF(btrim(COALESCE(p_row->>'nama', '')), '');
  v_phone text := NULLIF(regexp_replace(COALESCE(p_row->>'no_wa', ''), '[\s-]', '', 'g'), '');
  v_period text := btrim(COALESCE(p_row->>'periode_masuk', ''));
  v_start integer;
  v_dpp numeric;
  v_dsp numeric;
  v_uniform numeric;
  v_activity numeric;
  v_spp numeric;
  v_computer numeric;
  v_no_spp text;
BEGIN
  IF v_type = 'penempatan' THEN
    IF v_id !~ '^[0-9]{1,10}$' OR v_year !~ '^[0-9]{4}-[0-9]{4}$'
       OR v_class IS NULL THEN
      RAISE EXCEPTION 'Siswa, tahun ajaran, dan kelas wajib dipilih.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.spp_app_enrollments e
      WHERE e.id_siswa = v_id AND e.tahun_ajaran = v_year
        AND e.nospp IS NULL AND e.kdsek = v_school
    ) THEN
      RAISE EXCEPTION 'Pendaftaran sementara tidak ditemukan atau sekolahnya berubah.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.spp_app_school_classes c
      WHERE c.school_code = v_school AND c.class_name = v_class AND c.is_active
    ) THEN
      RAISE EXCEPTION 'Kelas % tidak aktif untuk sekolah %.', v_class, v_school USING ERRCODE = '22023';
    END IF;
    v_start := split_part(v_year, '-', 1)::integer;
    v_no_spp := right(v_start::text, 2) || right((v_start + 1)::text, 2)
      || '-' || upper(regexp_replace(v_school, '\s', '', 'g'))
      || '-' || upper(regexp_replace(v_class, '\s', '', 'g'))
      || '-' || lpad(v_id, 4, '0');
    UPDATE public.spp_app_enrollments
    SET kdkls = v_class, nospp = v_no_spp
    WHERE id_siswa = v_id AND tahun_ajaran = v_year AND nospp IS NULL;
    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (v_actor, 'penempatan_kelas', v_id,
      jsonb_build_object('tahun_ajaran', v_year, 'kdsek', v_school, 'kdkls', v_class, 'nospp', v_no_spp));
    RETURN jsonb_build_object('id_siswa', v_id, 'nospp', v_no_spp, 'status', 'final');
  END IF;

  IF v_type <> 'baru' OR v_class IS NOT NULL THEN
    RETURN public.spp_app_enroll(v_actor, p_row);
  END IF;
  IF v_year !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(v_year, '-', 2)::integer <> split_part(v_year, '-', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.spp_app_school_settings s
    WHERE s.school_code = v_school AND s.is_active
  ) THEN
    RAISE EXCEPTION 'Sekolah tidak aktif atau tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR v_phone IS NULL OR v_phone !~ '^[0-9+]{8,20}$' THEN
    RAISE EXCEPTION 'Nama dan nomor WhatsApp yang valid wajib diisi.' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(v_year, '-', 1)::integer;
  IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$'
     OR to_date(v_period, 'MMYYYY') NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode masuk harus berada dalam tahun ajaran.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_dpp := COALESCE(NULLIF(p_row->>'dpp', ''), '0')::numeric;
    v_dsp := COALESCE(NULLIF(p_row->>'dsp', ''), '0')::numeric;
    v_uniform := COALESCE(NULLIF(p_row->>'seragam', ''), '0')::numeric;
    v_activity := COALESCE(NULLIF(p_row->>'giat', ''), '0')::numeric;
    v_spp := COALESCE(NULLIF(p_row->>'spp', ''), '0')::numeric;
    v_computer := COALESCE(NULLIF(p_row->>'komp', ''), '0')::numeric;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Nominal harus berupa angka.' USING ERRCODE = '22023';
  END;
  IF LEAST(v_dpp, v_dsp, v_uniform, v_activity, v_spp, v_computer) < 0 THEN
    RAISE EXCEPTION 'Nominal tidak boleh negatif.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.spp_app_student_id_seq'));
  v_id := nextval('public.spp_app_student_id_seq')::text;
  IF v_id !~ '^[0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Urutan ID siswa sudah melewati batas 10 digit.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_students (id_siswa, nama, no_wa)
  VALUES (v_id, v_name, v_phone);
  INSERT INTO public.spp_app_enrollments
    (id_siswa, tahun_ajaran, kdsek, kdkls, nospp, entry_type,
     dpp, dsp, seragam, giat, spp, komp, periode_masuk)
  VALUES
    (v_id, v_year, v_school, NULL, NULL, 'baru',
     v_dpp, v_dsp, v_uniform, v_activity, v_spp, v_computer, v_period);
  INSERT INTO public.spp_app_spp_history
    (id_siswa, tahun_ajaran, effective_date, spp, komp, changed_by)
  VALUES (v_id, v_year, make_date(v_start, 7, 1), v_spp, v_computer, v_actor);
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'siswa_baru_sementara', v_id, jsonb_build_object(
    'tahun_ajaran', v_year, 'kdsek', v_school, 'dpp', v_dpp, 'dsp', v_dsp,
    'seragam', v_uniform, 'giat', v_activity, 'spp', v_spp, 'komp', v_computer));
  RETURN jsonb_build_object('id_siswa', v_id, 'nospp', NULL, 'status', 'menunggu_kelas');
END;
$function$;

DO $sync_student_id_sequence$
DECLARE
  v_max bigint;
  v_last bigint;
  v_is_called boolean;
BEGIN
  SELECT last_value, is_called
  INTO v_last, v_is_called
  FROM public.spp_app_student_id_seq;

  SELECT GREATEST(
    COALESCE((SELECT max(id::bigint) FROM public.mastank WHERE id ~ '^[0-9]{1,10}$'), 0),
    COALESCE((SELECT max(id::bigint) FROM public.mastspp WHERE id ~ '^[0-9]{1,10}$'), 0),
    COALESCE((SELECT max(id_siswa::bigint) FROM public.spp_app_students), 0),
    CASE WHEN v_is_called THEN v_last ELSE 0 END
  )
  INTO v_max;
  PERFORM setval('public.spp_app_student_id_seq', GREATEST(v_max, 1), v_max > 0);
END;
$sync_student_id_sequence$;

COMMIT;
