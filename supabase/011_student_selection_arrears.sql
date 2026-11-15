-- Aturan data siswa, tahap 2: kegiatan per siswa terpilih dan tagihan tahun lalu (input manual).
-- Jalankan setelah 010_student_rules.sql.

CREATE TABLE IF NOT EXISTS public.spp_app_arrears (
  id bigserial PRIMARY KEY,
  id_siswa text NOT NULL,
  tahun_ajaran text NOT NULL CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'),
  jenis text NOT NULL CHECK (jenis IN ('spp', 'dpp', 'dsp', 'seragam', 'kegiatan', 'komputer', 'lainnya')),
  keterangan text NOT NULL DEFAULT '',
  nominal numeric(14,2) NOT NULL CHECK (nominal > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spp_app_arrears_siswa_idx ON public.spp_app_arrears (id_siswa);

ALTER TABLE public.spp_app_arrears ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read arrears" ON public.spp_app_arrears;
CREATE POLICY "Read arrears" ON public.spp_app_arrears FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.spp_app_arrears FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_arrears TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bulk_set_activity_fee_ids_v1(
  p_username text, p_password text, p_tahun_ajaran text, p_ids text[], p_giat numeric)
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
  IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 2000 siswa.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spp_app_enrollments
  SET giat = p_giat
  WHERE tahun_ajaran = p_tahun_ajaran AND id_siswa = ANY (p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'kegiatan_terpilih', jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran, 'ids', p_ids, 'giat', p_giat, 'jumlah', v_count));
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_student_arrear_v1(
  p_username text, p_password text, p_id_siswa text, p_tahun_ajaran text,
  p_jenis text, p_nominal numeric, p_keterangan text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.spp_app_students WHERE id_siswa = p_id_siswa
    UNION ALL SELECT 1 FROM public.mastank WHERE id = p_id_siswa
  ) THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_arrears (id_siswa, tahun_ajaran, jenis, keterangan, nominal, created_by)
  VALUES (p_id_siswa, p_tahun_ajaran, lower(btrim(p_jenis)), btrim(COALESCE(p_keterangan, '')), p_nominal, v_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'tagihan_lalu_tambah', p_id_siswa, jsonb_build_object(
    'id', v_id, 'tahun_ajaran', p_tahun_ajaran, 'jenis', p_jenis, 'nominal', p_nominal, 'keterangan', p_keterangan));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_student_arrear_v1(p_username text, p_password text, p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row public.spp_app_arrears%ROWTYPE;
BEGIN
  DELETE FROM public.spp_app_arrears WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'tagihan_lalu_hapus', v_row.id_siswa, to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_set_activity_fee_ids_v1(text, text, text, text[], numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_student_arrear_v1(text, text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_arrear_v1(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_set_activity_fee_ids_v1(text, text, text, text[], numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_arrear_v1(text, text, text, text, text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_arrear_v1(text, text, bigint) TO anon, authenticated;
