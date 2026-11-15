-- Ubah seluruh tagihan pendaftaran siswa (DPP, DPS, seragam, kegiatan, SPP, komputer) sekaligus.
-- SPP/komputer yang berubah memakai periode berlaku (riwayat tetap tersimpan). Jalankan setelah 013.

-- Kolom DPP/DPS/seragam ditambahkan di akhir agar bisa dimuat ke form ubah tagihan.
CREATE OR REPLACE VIEW public.spp_app_student_overview AS
SELECT
  e.id_siswa, e.tahun_ajaran, e.kdsek, e.kdkls, e.nospp, e.spp, e.komp, e.giat,
  s.nama, s.no_wa, s.is_staff_child, s.show_in_billing,
  COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a WHERE a.id_siswa = e.id_siswa), 0) AS arrears_total,
  COALESCE((SELECT sum(p.nominal) FROM public.spp_app_payments p WHERE p.nospp = e.nospp), 0) AS paid_total,
  (SELECT max(p.tglbyr) FROM public.spp_app_payments p WHERE p.nospp = e.nospp) AS last_paid,
  e.dpp, e.dsp, e.seragam
FROM public.spp_app_enrollments e
JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa;

CREATE OR REPLACE FUNCTION public.update_enrollment_fees_v1(
  p_username text, p_password text, p_id_siswa text, p_tahun_ajaran text,
  p_dpp numeric, p_dsp numeric, p_seragam numeric, p_giat numeric,
  p_spp numeric, p_komp numeric, p_effective_period text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_old public.spp_app_enrollments%ROWTYPE;
BEGIN
  IF LEAST(COALESCE(p_dpp, -1), COALESCE(p_dsp, -1), COALESCE(p_seragam, -1), COALESCE(p_giat, -1),
           COALESCE(p_spp, -1), COALESCE(p_komp, -1)) < 0 THEN
    RAISE EXCEPTION 'Nominal harus diisi dan tidak boleh negatif.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data siswa pada tahun ajaran tersebut tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  IF p_spp <> v_old.spp OR p_komp <> v_old.komp THEN
    PERFORM public.update_student_spp_v1(p_username, p_password, p_id_siswa, p_tahun_ajaran,
      p_effective_period, p_spp, p_komp);
  END IF;

  UPDATE public.spp_app_enrollments
  SET dpp = p_dpp, dsp = p_dsp, seragam = p_seragam, giat = p_giat
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'ubah_tagihan', p_id_siswa, jsonb_build_object(
    'tahun_ajaran', p_tahun_ajaran,
    'lama', jsonb_build_object('dpp', v_old.dpp, 'dsp', v_old.dsp, 'seragam', v_old.seragam,
                               'giat', v_old.giat, 'spp', v_old.spp, 'komp', v_old.komp),
    'baru', jsonb_build_object('dpp', p_dpp, 'dsp', p_dsp, 'seragam', p_seragam,
                               'giat', p_giat, 'spp', p_spp, 'komp', p_komp)));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_enrollment_fees_v1(text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_enrollment_fees_v1(text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text) TO anon, authenticated;
