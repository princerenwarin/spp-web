-- Skalabilitas: pencarian/halaman di database, pembayaran tersimpan di Supabase, total dihitung di database.
-- Jalankan setelah 011_student_selection_arrears.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS spp_app_students_nama_trgm_idx
  ON public.spp_app_students USING gin (nama gin_trgm_ops);
CREATE INDEX IF NOT EXISTS spp_app_enrollments_filter_idx
  ON public.spp_app_enrollments (tahun_ajaran, kdsek, kdkls);
CREATE INDEX IF NOT EXISTS spp_app_enrollments_siswa_idx
  ON public.spp_app_enrollments (id_siswa, tahun_ajaran DESC);

CREATE TABLE IF NOT EXISTS public.spp_app_payments (
  id bigserial PRIMARY KEY,
  nospp text NOT NULL,
  id_siswa text NOT NULL,
  kdsek text NOT NULL,
  periode text NOT NULL DEFAULT '',
  nominal numeric(14,2) NOT NULL CHECK (nominal > 0),
  tglbyr date NOT NULL DEFAULT current_date,
  idpemakai text NOT NULL,
  ket text NOT NULL DEFAULT 'Pembayaran via web',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spp_app_payments_nospp_idx ON public.spp_app_payments (nospp);
CREATE INDEX IF NOT EXISTS spp_app_payments_tgl_idx ON public.spp_app_payments (tglbyr DESC, id DESC);
CREATE INDEX IF NOT EXISTS spp_app_payments_sek_idx ON public.spp_app_payments (kdsek, tglbyr DESC);

ALTER TABLE public.spp_app_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read payments" ON public.spp_app_payments;
CREATE POLICY "Read payments" ON public.spp_app_payments FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.spp_app_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payments TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_payment_v1(
  p_username text, p_password text, p_nospp text, p_periode text, p_nominal numeric)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_id bigint;
BEGIN
  IF p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_enr FROM public.spp_app_enrollments WHERE nospp = btrim(p_nospp);
  IF v_enr.nospp IS NULL THEN
    RAISE EXCEPTION 'No. SPP tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_payments (nospp, id_siswa, kdsek, periode, nominal, idpemakai)
  VALUES (v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, btrim(COALESCE(p_periode, '')), p_nominal, v_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (v_actor, 'bayar_tambah', v_enr.id_siswa, jsonb_build_object(
    'id', v_id, 'nospp', v_enr.nospp, 'periode', p_periode, 'nominal', p_nominal));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_payment_v1(p_username text, p_password text, p_id bigint)
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
    'id', v_row.id, 'nospp', v_row.nospp, 'periode', v_row.periode, 'nominal', v_row.nominal));
END;
$function$;

-- Satu baris per pendaftaran (siswa x tahun ajaran) lengkap dengan total tagihan dan pembayaran.
CREATE OR REPLACE VIEW public.spp_app_student_overview AS
SELECT
  e.id_siswa, e.tahun_ajaran, e.kdsek, e.kdkls, e.nospp, e.spp, e.komp, e.giat,
  s.nama, s.no_wa, s.is_staff_child, s.show_in_billing,
  COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a WHERE a.id_siswa = e.id_siswa), 0) AS arrears_total,
  COALESCE((SELECT sum(p.nominal) FROM public.spp_app_payments p WHERE p.nospp = e.nospp), 0) AS paid_total,
  (SELECT max(p.tglbyr) FROM public.spp_app_payments p WHERE p.nospp = e.nospp) AS last_paid
FROM public.spp_app_enrollments e
JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa;

REVOKE ALL ON TABLE public.spp_app_student_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_student_overview TO anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_payment_list AS
SELECT p.id, p.nospp, p.id_siswa, p.kdsek, p.periode, p.nominal, p.tglbyr, p.idpemakai, p.ket,
  s.nama
FROM public.spp_app_payments p
LEFT JOIN public.spp_app_students s ON s.id_siswa = p.id_siswa;

REVOKE ALL ON TABLE public.spp_app_payment_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_list TO anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_arrears_list AS
SELECT a.id, a.id_siswa, a.tahun_ajaran, a.jenis, a.keterangan, a.nominal, s.nama
FROM public.spp_app_arrears a
LEFT JOIN public.spp_app_students s ON s.id_siswa = a.id_siswa;

REVOKE ALL ON TABLE public.spp_app_arrears_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_arrears_list TO anon, authenticated;

-- Pencarian siswa (satu baris per siswa, pendaftaran terbaru) untuk kotak pilih siswa.
CREATE OR REPLACE FUNCTION public.spp_app_search_students_v1(p_q text, p_limit integer DEFAULT 8)
RETURNS TABLE (id_siswa text, nama text, kdsek text, kdkls text, nospp text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT DISTINCT ON (e.id_siswa) e.id_siswa, s.nama, e.kdsek, e.kdkls, e.nospp
  FROM public.spp_app_students s
  JOIN public.spp_app_enrollments e ON e.id_siswa = s.id_siswa
  WHERE btrim(COALESCE(p_q, '')) = ''
     OR s.nama ILIKE '%' || btrim(p_q) || '%'
     OR s.id_siswa = btrim(p_q)
     OR e.nospp ILIKE btrim(p_q) || '%'
  ORDER BY e.id_siswa, e.tahun_ajaran DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_years_v1()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(array_agg(t ORDER BY t DESC), '{}') FROM (
    SELECT DISTINCT tahun_ajaran AS t FROM public.spp_app_enrollments
  ) y;
$function$;

-- Kelas dan sekolah yang sudah dipakai siswa (untuk pengaturan sekolah/kelas).
CREATE OR REPLACE FUNCTION public.spp_app_used_catalog_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'classes', COALESCE((SELECT jsonb_agg(jsonb_build_object('kdsek', kdsek, 'kdkls', kdkls))
      FROM (SELECT DISTINCT kdsek, kdkls FROM public.spp_app_enrollments) c), '[]'::jsonb),
    'schools', COALESCE((SELECT jsonb_agg(kdsek) FROM (
      SELECT kdsek FROM public.spp_app_enrollments
      UNION SELECT kdsek FROM public.spp_app_payments) k), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_dashboard_v1(p_tahun text DEFAULT NULL, p_kdsek text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'siswa', (SELECT count(*) FROM public.spp_app_enrollments e
      WHERE (p_tahun IS NULL OR e.tahun_ajaran = p_tahun) AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)),
    'tagihan', COALESCE((SELECT sum(o.spp + o.komp + o.arrears_total)
      FROM public.spp_app_student_overview o
      WHERE (p_tahun IS NULL OR o.tahun_ajaran = p_tahun) AND (p_kdsek IS NULL OR o.kdsek = p_kdsek)
        AND NOT (o.is_staff_child AND NOT o.show_in_billing)), 0),
    'bulan_ini', COALESCE((SELECT sum(p.nominal) FROM public.spp_app_payments p
      WHERE p.tglbyr >= date_trunc('month', current_date)::date
        AND (p_kdsek IS NULL OR p.kdsek = p_kdsek)), 0),
    'transaksi', (SELECT count(*) FROM public.spp_app_payments p WHERE (p_kdsek IS NULL OR p.kdsek = p_kdsek)),
    'terbaru', COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT nospp, nama, tglbyr, nominal FROM public.spp_app_payment_list
      WHERE (p_kdsek IS NULL OR kdsek = p_kdsek) ORDER BY tglbyr DESC, id DESC LIMIT 5) r), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_report_v1(p_tahun text DEFAULT NULL, p_kdsek text DEFAULT NULL)
RETURNS TABLE (kdsek text, jumlah bigint, tagihan numeric, terbayar numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT o.kdsek, count(*), sum(CASE WHEN o.is_staff_child AND NOT o.show_in_billing THEN 0
      ELSE o.spp + o.komp + o.arrears_total END), sum(o.paid_total)
  FROM public.spp_app_student_overview o
  WHERE (p_tahun IS NULL OR o.tahun_ajaran = p_tahun) AND (p_kdsek IS NULL OR o.kdsek = p_kdsek)
  GROUP BY o.kdsek;
$function$;

REVOKE ALL ON FUNCTION public.add_payment_v1(text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_payment_v1(text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_search_students_v1(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_years_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_used_catalog_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_dashboard_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_report_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payment_v1(text, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment_v1(text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_search_students_v1(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_years_v1() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_used_catalog_v1() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_dashboard_v1(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_report_v1(text, text) TO anon, authenticated;
