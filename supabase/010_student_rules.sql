-- Aturan data siswa: siswa baru, naik kelas, no. SPP, riwayat SPP, kegiatan massal,
-- anak guru/karyawan, import massal, dan log perubahan.
-- Prasyarat: 001, 005, 007, 008, 009. Tabel lama (mastank, mastspp) tidak diubah.
-- Periode memakai format MMYYYY (sama dengan data pembayaran), contoh 072026 = Juli 2026.
BEGIN;

CREATE TABLE IF NOT EXISTS public.spp_app_students (
  id_siswa text PRIMARY KEY CHECK (id_siswa ~ '^[0-9]{1,10}$'),
  nama text NOT NULL CHECK (char_length(btrim(nama)) BETWEEN 1 AND 100),
  no_wa text CHECK (no_wa IS NULL OR no_wa ~ '^[0-9+]{8,20}$'),
  is_staff_child boolean NOT NULL DEFAULT false,
  show_in_billing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (show_in_billing OR is_staff_child)
);

CREATE TABLE IF NOT EXISTS public.spp_app_enrollments (
  id_siswa text NOT NULL REFERENCES public.spp_app_students (id_siswa),
  tahun_ajaran text NOT NULL CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'),
  kdsek text NOT NULL,
  kdkls text NOT NULL,
  nospp text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('baru', 'naik')),
  dpp numeric(14,2) NOT NULL DEFAULT 0 CHECK (dpp >= 0),
  dsp numeric(14,2) NOT NULL DEFAULT 0 CHECK (dsp >= 0),
  seragam numeric(14,2) NOT NULL DEFAULT 0 CHECK (seragam >= 0),
  giat numeric(14,2) NOT NULL DEFAULT 0 CHECK (giat >= 0),
  spp numeric(14,2) NOT NULL DEFAULT 0 CHECK (spp >= 0),
  komp numeric(14,2) NOT NULL DEFAULT 0 CHECK (komp >= 0),
  periode_masuk char(6) CHECK (periode_masuk IS NULL OR periode_masuk ~ '^(0[1-9]|1[0-2])[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_siswa, tahun_ajaran)
);
CREATE UNIQUE INDEX IF NOT EXISTS spp_app_enrollments_nospp_unique
  ON public.spp_app_enrollments (nospp);

-- Perubahan SPP tengah tahun: nilai lama tetap tersimpan, berlaku mulai effective_date.
CREATE TABLE IF NOT EXISTS public.spp_app_spp_history (
  id bigserial PRIMARY KEY,
  id_siswa text NOT NULL,
  tahun_ajaran text NOT NULL,
  effective_date date NOT NULL,
  spp numeric(14,2) NOT NULL CHECK (spp >= 0),
  komp numeric(14,2) NOT NULL CHECK (komp >= 0),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_siswa, tahun_ajaran, effective_date)
);

CREATE TABLE IF NOT EXISTS public.spp_app_student_log (
  id bigserial PRIMARY KEY,
  logged_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  id_siswa text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$
DECLARE v_max bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'spp_app_student_id_seq' AND relkind = 'S') THEN
    CREATE SEQUENCE public.spp_app_student_id_seq;
  END IF;
  SELECT GREATEST(
    COALESCE((SELECT max(id::bigint) FROM public.mastank WHERE id ~ '^[0-9]{1,10}$'), 0),
    COALESCE((SELECT max(id::bigint) FROM public.mastspp WHERE id ~ '^[0-9]{1,10}$'), 0),
    COALESCE((SELECT max(id_siswa::bigint) FROM public.spp_app_students), 0)
  ) INTO v_max;
  PERFORM setval('public.spp_app_student_id_seq', GREATEST(v_max, 1), v_max > 0);
END $$;

ALTER TABLE public.spp_app_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_spp_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_student_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read students" ON public.spp_app_students;
CREATE POLICY "Read students" ON public.spp_app_students FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read enrollments" ON public.spp_app_enrollments;
CREATE POLICY "Read enrollments" ON public.spp_app_enrollments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read spp history" ON public.spp_app_spp_history;
CREATE POLICY "Read spp history" ON public.spp_app_spp_history FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON TABLE public.spp_app_students, public.spp_app_enrollments,
  public.spp_app_spp_history, public.spp_app_student_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_students, public.spp_app_enrollments,
  public.spp_app_spp_history TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_assert_admin(p_username text, p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_actor text;
BEGIN
  SELECT account.idpemakai INTO v_actor
  FROM public.mastusr AS account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND btrim(COALESCE(account.password, '')) = btrim(COALESCE(p_password, ''))
    AND lower(btrim(COALESCE(account.role, ''))) = 'superadmin';
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Admin yang dapat mengubah data siswa.' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$function$;

-- SPP yang berlaku pada suatu bulan; bulan sebelum perubahan tidak ikut berubah.
CREATE OR REPLACE FUNCTION public.spp_app_spp_at(p_id_siswa text, p_tahun_ajaran text, p_periode text)
RETURNS TABLE (spp numeric, komp numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT h.spp, h.komp
  FROM public.spp_app_spp_history AS h
  WHERE h.id_siswa = p_id_siswa
    AND h.tahun_ajaran = p_tahun_ajaran
    AND h.effective_date <= to_date(p_periode, 'MMYYYY')
  ORDER BY h.effective_date DESC
  LIMIT 1;
$function$;

-- Inti: dipakai oleh siswa baru, naik kelas, dan import massal.
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

  IF v_type = 'baru' THEN
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
    v_id := nextval('public.spp_app_student_id_seq')::text;
    INSERT INTO public.spp_app_students (id_siswa, nama, no_wa) VALUES (v_id, v_nama, v_wa);
  ELSE
    IF v_id !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'ID siswa tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.spp_app_students WHERE id_siswa = v_id) THEN
      INSERT INTO public.spp_app_students (id_siswa, nama, no_wa)
      SELECT m.id, btrim(m.nama), COALESCE(v_wa, NULLIF(regexp_replace(COALESCE(m.no_hp, ''), '[\s-]', '', 'g'), ''))
      FROM public.mastank m WHERE m.id = v_id
      ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Siswa dengan ID % tidak ditemukan.', v_id USING ERRCODE = '22023';
      END IF;
    END IF;
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

CREATE OR REPLACE FUNCTION public.save_student_v1(p_username text, p_password text, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN public.spp_app_enroll(public.spp_app_assert_admin(p_username, p_password), p_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_students_v1(p_username text, p_password text, p_rows jsonb)
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
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Import harus berisi 1 sampai 2000 baris.' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.update_student_spp_v1(
  p_username text, p_password text, p_id_siswa text, p_tahun_ajaran text,
  p_effective_period text, p_spp numeric, p_komp numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_start int;
  v_date date;
  v_old record;
BEGIN
  IF p_spp IS NULL OR p_komp IS NULL OR p_spp < 0 OR p_komp < 0 THEN
    RAISE EXCEPTION 'Nominal SPP dan komputer tidak valid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.spp_app_enrollments WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data siswa pada tahun ajaran tersebut tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(p_tahun_ajaran, '-', 1)::int;
  IF COALESCE(p_effective_period, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Periode berlaku tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_date := to_date(p_effective_period, 'MMYYYY');
  IF v_date NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode berlaku harus di dalam tahun ajaran.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.spp_app_spp_history (id_siswa, tahun_ajaran, effective_date, spp, komp, changed_by)
  VALUES (p_id_siswa, p_tahun_ajaran, v_date, p_spp, p_komp, v_actor)
  ON CONFLICT (id_siswa, tahun_ajaran, effective_date)
  DO UPDATE SET spp = EXCLUDED.spp, komp = EXCLUDED.komp, changed_by = EXCLUDED.changed_by, changed_at = now();

  -- Nilai "saat ini" pada pendaftaran mengikuti riwayat terbaru.
  UPDATE public.spp_app_enrollments e
  SET spp = h.spp, komp = h.komp
  FROM (
    SELECT spp, komp FROM public.spp_app_spp_history
    WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran
    ORDER BY effective_date DESC LIMIT 1
  ) h
  WHERE e.id_siswa = p_id_siswa AND e.tahun_ajaran = p_tahun_ajaran;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'ubah_spp', p_id_siswa, jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran, 'berlaku_mulai', v_date,
    'spp_lama', v_old.spp, 'spp_baru', p_spp, 'komp_lama', v_old.komp, 'komp_baru', p_komp));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_set_activity_fee_v1(
  p_username text, p_password text, p_tahun_ajaran text,
  p_kdsek text, p_kdkls text, p_giat numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_count integer;
BEGIN
  IF p_giat IS NULL OR p_giat < 0 THEN
    RAISE EXCEPTION 'Nominal kegiatan tidak valid.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spp_app_enrollments
  SET giat = p_giat
  WHERE tahun_ajaran = p_tahun_ajaran
    AND (NULLIF(btrim(p_kdsek), '') IS NULL OR kdsek = btrim(p_kdsek))
    AND (NULLIF(btrim(p_kdkls), '') IS NULL OR kdkls = btrim(p_kdkls));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'kegiatan_massal', jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran, 'kdsek', p_kdsek, 'kdkls', p_kdkls, 'giat', p_giat, 'jumlah', v_count));
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_set_staff_child_v1(
  p_username text, p_password text, p_ids text[],
  p_is_staff_child boolean, p_show_in_billing boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_count integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 2000 siswa.' USING ERRCODE = '22023';
  END IF;
  -- Hanya anak guru/karyawan yang boleh disembunyikan dari tagihan.
  UPDATE public.spp_app_students
  SET is_staff_child = p_is_staff_child,
      show_in_billing = CASE WHEN p_is_staff_child THEN COALESCE(p_show_in_billing, true) ELSE true END,
      updated_at = now()
  WHERE id_siswa = ANY (p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Siswa lama (hanya di mastank) didaftarkan dulu agar statusnya bisa disimpan.
  INSERT INTO public.spp_app_students (id_siswa, nama, no_wa, is_staff_child, show_in_billing)
  SELECT m.id, btrim(m.nama), NULLIF(regexp_replace(COALESCE(m.no_hp, ''), '[\s-]', '', 'g'), ''),
         p_is_staff_child, CASE WHEN p_is_staff_child THEN COALESCE(p_show_in_billing, true) ELSE true END
  FROM public.mastank m
  WHERE m.id = ANY (p_ids)
    AND NOT EXISTS (SELECT 1 FROM public.spp_app_students s WHERE s.id_siswa = m.id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT count(*) INTO v_count FROM public.spp_app_students WHERE id_siswa = ANY (p_ids);
  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'anak_guru_massal', jsonb_build_object(
    'ids', p_ids, 'is_staff_child', p_is_staff_child, 'show_in_billing', p_show_in_billing));
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_log_v1(p_username text, p_password text, p_limit integer DEFAULT 200)
RETURNS SETOF public.spp_app_student_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  RETURN QUERY SELECT * FROM public.spp_app_student_log ORDER BY id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_assert_admin(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spp_app_enroll(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_student_v1(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_students_v1(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_student_spp_v1(text, text, text, text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_set_activity_fee_v1(text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_set_staff_child_v1(text, text, text[], boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_log_v1(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_student_v1(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students_v1(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_spp_v1(text, text, text, text, text, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_activity_fee_v1(text, text, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_staff_child_v1(text, text, text[], boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_log_v1(text, text, integer) TO anon, authenticated;

COMMIT;
