BEGIN;

CREATE FUNCTION public.spp_app_prior_year_component_revenue_v1(
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (
  kdsek text,
  dpp_tagihan numeric,
  dpp_terbayar numeric,
  dsp_tagihan numeric,
  dsp_terbayar numeric,
  seragam_tagihan numeric,
  seragam_terbayar numeric,
  giat_tagihan numeric,
  giat_terbayar numeric,
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
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
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
      sum(a.nominal) FILTER (WHERE a.jenis = 'dsp') AS dsp,
      sum(a.nominal) FILTER (WHERE a.jenis = 'seragam') AS seragam,
      sum(a.nominal) FILTER (WHERE a.jenis = 'spp') AS spp
    FROM public.spp_app_arrears a
    WHERE a.tahun_ajaran < p_tahun
    GROUP BY a.id_siswa
  ),
  activity_due AS (
    SELECT due.id_siswa, sum(due.nominal)::numeric AS giat
    FROM (
      SELECT e.id_siswa, e.giat AS nominal
      FROM public.spp_app_enrollments e
      WHERE e.tahun_ajaran < p_tahun AND e.giat > 0
      UNION ALL
      SELECT a.id_siswa, a.nominal
      FROM public.spp_app_arrears a
      WHERE a.jenis = 'kegiatan' AND a.tahun_ajaran < p_tahun
    ) due
    GROUP BY due.id_siswa
  ),
  paid AS (
    SELECT b.kdsek,
      sum(p.nominal) FILTER (WHERE p.component = 'dpp_tl') AS dpp,
      sum(p.nominal) FILTER (WHERE p.component = 'dsp') AS dsp,
      sum(p.nominal) FILTER (WHERE p.component = 'seragam') AS seragam,
      sum(p.nominal) FILTER (WHERE p.component = 'spp_tl') AS spp
    FROM public.spp_app_payment_batches b
    JOIN public.spp_app_payments p ON p.batch_id = b.id
    WHERE b.tglbyr >= make_date(v_start, 7, 1)
      AND b.tglbyr < make_date(v_start + 1, 7, 1)
      AND b.voided_at IS NULL AND b.source <> 'bos'
    GROUP BY b.kdsek
  ),
  activity_paid AS (
    SELECT b.kdsek, sum(a.nominal)::numeric AS giat
    FROM public.spp_app_activity_allocations a
    JOIN public.spp_app_payments p ON p.id = a.payment_id
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE a.tahun_ajaran < p_tahun
      AND b.tglbyr >= make_date(v_start, 7, 1)
      AND b.tglbyr < make_date(v_start + 1, 7, 1)
      AND b.voided_at IS NULL AND b.source <> 'bos'
    GROUP BY b.kdsek
  ),
  due AS (
    SELECT e.kdsek,
      sum(COALESCE(h.dpp, 0)) AS dpp,
      sum(COALESCE(h.dsp, 0)) AS dsp,
      sum(COALESCE(h.seragam, 0)) AS seragam,
      sum(COALESCE(a.giat, 0)) AS giat,
      sum(COALESCE(h.spp, 0)) AS spp
    FROM public.spp_app_enrollments e
    LEFT JOIN historical_due h ON h.id_siswa = e.id_siswa
    LEFT JOIN activity_due a ON a.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun
    GROUP BY e.kdsek
  )
  SELECT COALESCE(d.kdsek, p.kdsek, a.kdsek),
    COALESCE(d.dpp, 0), COALESCE(p.dpp, 0),
    COALESCE(d.dsp, 0), COALESCE(p.dsp, 0),
    COALESCE(d.seragam, 0), COALESCE(p.seragam, 0),
    COALESCE(d.giat, 0), COALESCE(a.giat, 0),
    COALESCE(d.spp, 0), COALESCE(p.spp, 0)
  FROM due d
  FULL JOIN paid p ON p.kdsek = d.kdsek
  FULL JOIN activity_paid a ON a.kdsek = COALESCE(d.kdsek, p.kdsek)
  WHERE COALESCE(d.dpp, 0) > 0 OR COALESCE(p.dpp, 0) > 0
     OR COALESCE(d.dsp, 0) > 0 OR COALESCE(p.dsp, 0) > 0
     OR COALESCE(d.seragam, 0) > 0 OR COALESCE(p.seragam, 0) > 0
     OR COALESCE(d.giat, 0) > 0 OR COALESCE(a.giat, 0) > 0
     OR COALESCE(d.spp, 0) > 0 OR COALESCE(p.spp, 0) > 0
  ORDER BY 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_prior_year_component_revenue_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_prior_year_component_revenue_v1(text, text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_student_payment_history_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun text,
  p_periode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_billing jsonb;
  v_transactions jsonb;
  v_nospp text := NULLIF(btrim(COALESCE(p_nospp, '')), '');
BEGIN
  IF NULLIF(btrim(COALESCE(p_id_siswa, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_kdsek, '')), '') IS NULL
     OR COALESCE(p_tahun, '') !~ '^[0-9]{4}-[0-9]{4}$'
     OR COALESCE(p_periode, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Identitas siswa atau periode tagihan tidak valid.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);

  IF NOT EXISTS (
    SELECT 1
    FROM public.spp_app_enrollments enrollment
    WHERE enrollment.id_siswa = p_id_siswa
      AND enrollment.nospp IS NOT DISTINCT FROM v_nospp
      AND enrollment.kdsek = p_kdsek
      AND enrollment.tahun_ajaran = p_tahun
  ) THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada unit dan tahun ajaran tersebut.' USING ERRCODE = '42501';
  END IF;

  v_billing := public.spp_app_student_prepaid_billing_v1(p_id_siswa, p_tahun);
  IF v_billing IS NULL THEN
    RAISE EXCEPTION 'Status periode pembayaran siswa tidak tersedia.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'batch_id', batch.id,
    'payment_id', payment.id,
    'receipt_no', batch.receipt_no,
    'tglbyr', batch.tglbyr,
    'created_at', batch.created_at,
    'component', payment.component,
    'periode', payment.periode,
    'nominal', payment.nominal,
    'source', batch.source,
    'voided_at', batch.voided_at,
    'void_reason', batch.void_reason,
    'activity_allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tahun_ajaran', allocation.tahun_ajaran,
        'nominal', allocation.nominal
      ) ORDER BY allocation.tahun_ajaran)
      FROM public.spp_app_activity_allocations allocation
      WHERE allocation.payment_id = payment.id
    ), '[]'::jsonb)
  ) ORDER BY batch.tglbyr DESC, batch.id DESC, payment.id DESC), '[]'::jsonb)
  INTO v_transactions
  FROM public.spp_app_payments payment
  JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
  WHERE payment.id_siswa = p_id_siswa
    AND payment.kdsek = p_kdsek;

  RETURN jsonb_build_object(
    'billing', v_billing,
    'transactions', v_transactions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text)
  TO anon, authenticated;

COMMIT;
