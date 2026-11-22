BEGIN;

CREATE OR REPLACE VIEW public.spp_app_student_overview AS
SELECT
  e.id_siswa, e.tahun_ajaran, e.kdsek, e.kdkls, e.nospp, e.spp, e.komp, e.giat,
  s.nama, s.no_wa, s.is_staff_child, s.show_in_billing,
  COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a WHERE a.id_siswa = e.id_siswa), 0) AS arrears_total,
  COALESCE((SELECT sum(p.nominal) FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.nospp = e.nospp AND b.voided_at IS NULL), 0) AS paid_total,
  (SELECT max(p.tglbyr) FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.nospp = e.nospp AND b.voided_at IS NULL) AS last_paid,
  e.dpp, e.dsp, e.seragam, e.periode_masuk,
  COALESCE((SELECT settings.school_name FROM public.spp_app_school_settings settings
    WHERE settings.school_code = e.kdsek), e.kdsek) AS school_name,
  CASE
    WHEN e.kdkls ~ '^[0-9]+' THEN
      lpad(regexp_replace(e.kdkls, '^([0-9]+).*$', '\1'), 6, '0')
        || lower(regexp_replace(e.kdkls, '^[0-9]+', ''))
    ELSE lower(e.kdkls)
  END AS class_sort,
  e.entry_type
FROM public.spp_app_enrollments e
JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa;

CREATE OR REPLACE FUNCTION public.update_student_entry_status_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_tahun_ajaran text,
  p_entry_type text,
  p_entry_period text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_old public.spp_app_enrollments%ROWTYPE;
  v_type text := lower(btrim(COALESCE(p_entry_type, '')));
  v_entry_date date;
  v_start integer;
BEGIN
  IF v_type NOT IN ('baru', 'naik') THEN
    RAISE EXCEPTION 'Status pendaftaran harus siswa baru atau naik/pindah kelas.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old
  FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pendaftaran siswa tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  v_start := split_part(p_tahun_ajaran, '-', 1)::integer;
  IF COALESCE(p_entry_period, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Periode masuk tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_entry_date := to_date(p_entry_period, 'MMYYYY');
  IF v_entry_date NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode masuk harus berada dalam tahun ajaran.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.spp_app_enrollments
  SET entry_type = v_type,
      periode_masuk = p_entry_period
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun_ajaran;

  IF v_old.entry_type IS DISTINCT FROM v_type OR
     NULLIF(btrim(v_old.periode_masuk::text), '') IS DISTINCT FROM p_entry_period THEN
    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (v_actor, 'ubah_status_pendaftaran', p_id_siswa, jsonb_build_object(
      'tahun_ajaran', p_tahun_ajaran,
      'entry_type_lama', v_old.entry_type,
      'entry_type_baru', v_type,
      'periode_masuk_lama', NULLIF(btrim(v_old.periode_masuk::text), ''),
      'periode_masuk_baru', p_entry_period
    ));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_student_entry_status_v1(
  text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_entry_status_v1(
  text, text, text, text, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_revenue_dashboard_v1(
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (
  kdsek text,
  bulan date,
  target_spp_komp numeric,
  realisasi_spp_komp numeric,
  target_giat numeric,
  realisasi_giat numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_start integer;
  v_opening date;
  v_july date;
  v_next_july date;
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
  v_opening := make_date(v_start, 6, 1);
  v_july := make_date(v_start, 7, 1);
  v_next_july := make_date(v_start + 1, 7, 1);

  RETURN QUERY
  WITH periods AS (
    SELECT generate_series(v_opening, v_next_july - interval '1 month', interval '1 month')::date AS bulan
  ),
  enrollments AS (
    SELECT e.id_siswa, e.tahun_ajaran, e.kdsek, e.entry_type, e.spp, e.komp, e.giat, e.periode_masuk
    FROM public.spp_app_enrollments e
    JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun AND s.show_in_billing
  ),
  targets AS (
    SELECT e.kdsek, period.bulan,
      sum(CASE
        WHEN period.bulan < v_july THEN 0
        WHEN e.periode_masuk IS NOT NULL
          AND period.bulan < to_date(e.periode_masuk, 'MMYYYY') THEN 0
        ELSE COALESCE(rate.spp, e.spp) + COALESCE(rate.komp, e.komp)
      END) AS target_spp_komp,
      sum(CASE
        WHEN period.bulan = v_opening
          AND NOT (
            e.entry_type = 'baru'
            AND e.periode_masuk IS NOT NULL
            AND to_date(e.periode_masuk, 'MMYYYY') >= v_july
          )
          THEN e.giat
        ELSE 0
      END) AS target_giat
    FROM enrollments e
    CROSS JOIN periods period
    LEFT JOIN LATERAL (
      SELECT h.spp, h.komp
      FROM public.spp_app_spp_history h
      WHERE h.id_siswa = e.id_siswa
        AND h.tahun_ajaran = e.tahun_ajaran
        AND h.effective_date <= period.bulan
      ORDER BY h.effective_date DESC
      LIMIT 1
    ) rate ON true
    GROUP BY e.kdsek, period.bulan
  ),
  payment_periods AS (
    SELECT b.kdsek, p.id_siswa, p.component, p.nominal,
      CASE
        WHEN p.periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN to_date(p.periode, 'MMYYYY')
        ELSE NULL
      END AS bulan
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE b.voided_at IS NULL
      AND b.source <> 'bos'
      AND b.kdsek IS NOT NULL
      AND p.component IN ('spp', 'komp', 'giat')
  ),
  eligible_payments AS (
    SELECT payment.kdsek, payment.component, payment.nominal, payment.bulan,
      enrollment.entry_type, enrollment.periode_masuk, enrollment.giat,
      COALESCE(rate.spp, enrollment.spp) AS spp_rate,
      COALESCE(rate.komp, enrollment.komp) AS komp_rate
    FROM payment_periods payment
    JOIN enrollments enrollment
      ON enrollment.id_siswa = payment.id_siswa
      AND enrollment.kdsek = payment.kdsek
    LEFT JOIN LATERAL (
      SELECT h.spp, h.komp
      FROM public.spp_app_spp_history h
      WHERE h.id_siswa = enrollment.id_siswa
        AND h.tahun_ajaran = enrollment.tahun_ajaran
        AND h.effective_date <= payment.bulan
      ORDER BY h.effective_date DESC
      LIMIT 1
    ) rate ON true
    WHERE payment.bulan IS NOT NULL
      AND payment.bulan >= v_opening
      AND payment.bulan < v_next_july
  ),
  realizations AS (
    SELECT payment.kdsek,
      CASE WHEN payment.component = 'giat' THEN v_opening ELSE payment.bulan END AS bulan,
      sum(payment.nominal) FILTER (WHERE payment.component IN ('spp', 'komp')) AS realisasi_spp_komp,
      sum(payment.nominal) FILTER (WHERE payment.component = 'giat') AS realisasi_giat
    FROM eligible_payments payment
    WHERE (
        payment.component = 'giat'
        AND payment.bulan >= v_opening
        AND payment.giat > 0
      ) OR (
        payment.component IN ('spp', 'komp')
        AND payment.bulan >= v_july
        AND (
          payment.periode_masuk IS NULL
          OR payment.bulan >= to_date(payment.periode_masuk, 'MMYYYY')
        )
        AND (
          (payment.component = 'spp' AND payment.spp_rate > 0)
          OR (payment.component = 'komp' AND payment.komp_rate > 0)
        )
      )
    GROUP BY payment.kdsek,
      CASE WHEN payment.component = 'giat' THEN v_opening ELSE payment.bulan END
  )
  SELECT COALESCE(target.kdsek, realization.kdsek),
    COALESCE(target.bulan, realization.bulan),
    COALESCE(target.target_spp_komp, 0),
    COALESCE(realization.realisasi_spp_komp, 0),
    COALESCE(target.target_giat, 0),
    COALESCE(realization.realisasi_giat, 0)
  FROM targets target
  FULL OUTER JOIN realizations realization
    ON realization.kdsek = target.kdsek AND realization.bulan = target.bulan
  ORDER BY 2, 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_revenue_dashboard_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_revenue_dashboard_v1(text, text, text) TO anon, authenticated;

COMMIT;
