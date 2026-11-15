-- Ubah nama siswa dan hapus data SPP siswa (admin saja, tercatat di log).
-- Jalankan setelah 012.

CREATE OR REPLACE FUNCTION public.rename_student_v1(p_username text, p_password text, p_id_siswa text, p_nama text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_old text;
  v_new text := btrim(COALESCE(p_nama, ''));
BEGIN
  IF char_length(v_new) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Nama siswa harus 1-100 karakter.' USING ERRCODE = '22023';
  END IF;
  SELECT nama INTO v_old FROM public.spp_app_students WHERE id_siswa = p_id_siswa;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spp_app_students SET nama = v_new, updated_at = now() WHERE id_siswa = p_id_siswa;
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'nama_ubah', p_id_siswa, jsonb_build_object('lama', v_old, 'baru', v_new));
END;
$function$;

-- p_tahun NULL: hapus siswa seluruhnya (semua tahun, tunggakan, riwayat SPP).
-- p_tahun diisi: hapus data SPP tahun ajaran itu saja.
-- Ditolak bila masih ada pembayaran, agar riwayat uang tidak hilang.
CREATE OR REPLACE FUNCTION public.delete_students_v1(p_username text, p_password text, p_ids text[], p_tahun text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_count integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'Pilih siswa terlebih dahulu.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.spp_app_payments p
    WHERE p.id_siswa = ANY (p_ids)
      AND (p_tahun IS NULL OR p.nospp IN (
        SELECT e.nospp FROM public.spp_app_enrollments e WHERE e.tahun_ajaran = p_tahun))
  ) THEN
    RAISE EXCEPTION 'Masih ada pembayaran pada siswa terpilih. Hapus pembayarannya terlebih dahulu.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.spp_app_enrollments
  WHERE id_siswa = ANY (p_ids) AND (p_tahun IS NULL OR tahun_ajaran = p_tahun);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.spp_app_spp_history
  WHERE id_siswa = ANY (p_ids) AND (p_tahun IS NULL OR tahun_ajaran = p_tahun);
  DELETE FROM public.spp_app_arrears
  WHERE id_siswa = ANY (p_ids) AND (p_tahun IS NULL OR tahun_ajaran = p_tahun);
  DELETE FROM public.spp_app_students s
  WHERE s.id_siswa = ANY (p_ids)
    AND NOT EXISTS (SELECT 1 FROM public.spp_app_enrollments e WHERE e.id_siswa = s.id_siswa);

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'siswa_hapus', NULL, jsonb_build_object('ids', p_ids, 'tahun_ajaran', p_tahun, 'jumlah', v_count));
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_student_v1(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_students_v1(text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_student_v1(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_students_v1(text, text, text[], text) TO anon, authenticated;
