-- Total tagihan mencakup SPP, komputer, DPP, DPS, kegiatan, seragam, dan tunggakan tahun lalu.
-- Jalankan setelah 014.

CREATE OR REPLACE FUNCTION public.spp_app_dashboard_v1(p_tahun text DEFAULT NULL, p_kdsek text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'siswa', (SELECT count(*) FROM public.spp_app_enrollments e
      WHERE (p_tahun IS NULL OR e.tahun_ajaran = p_tahun) AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)),
    'tagihan', COALESCE((SELECT sum(o.spp + o.komp + o.dpp + o.dsp + o.giat + o.seragam + o.arrears_total)
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
      ELSE o.spp + o.komp + o.dpp + o.dsp + o.giat + o.seragam + o.arrears_total END), sum(o.paid_total)
  FROM public.spp_app_student_overview o
  WHERE (p_tahun IS NULL OR o.tahun_ajaran = p_tahun) AND (p_kdsek IS NULL OR o.kdsek = p_kdsek)
  GROUP BY o.kdsek;
$function$;
