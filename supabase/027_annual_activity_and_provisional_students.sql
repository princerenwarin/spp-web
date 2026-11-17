-- Annual activity allocations and student registrations awaiting class placement.
-- Run after 026_fix_operator_code_result_types.sql. Back up the database first.
BEGIN;

ALTER TABLE public.spp_app_enrollments
  ALTER COLUMN kdkls DROP NOT NULL,
  ALTER COLUMN nospp DROP NOT NULL;

ALTER TABLE public.spp_app_payments
  ALTER COLUMN nospp DROP NOT NULL;

ALTER TABLE public.spp_app_payment_batches
  ADD COLUMN IF NOT EXISTS tahun_ajaran text;

UPDATE public.spp_app_payment_batches b
SET tahun_ajaran = e.tahun_ajaran
FROM public.spp_app_enrollments e
WHERE b.tahun_ajaran IS NULL
  AND b.nospp = e.nospp;

CREATE OR REPLACE FUNCTION public.spp_app_set_payment_batch_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.tahun_ajaran IS NULL AND NEW.nospp IS NOT NULL THEN
    NEW.tahun_ajaran := (
      SELECT enrollment.tahun_ajaran
      FROM public.spp_app_enrollments enrollment
      WHERE enrollment.nospp = NEW.nospp
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_set_payment_batch_year() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS spp_app_set_payment_batch_year ON public.spp_app_payment_batches;
CREATE TRIGGER spp_app_set_payment_batch_year
BEFORE INSERT OR UPDATE ON public.spp_app_payment_batches
FOR EACH ROW EXECUTE FUNCTION public.spp_app_set_payment_batch_year();

ALTER TABLE public.spp_app_payment_batches
  DROP CONSTRAINT IF EXISTS spp_app_payment_batches_subject_check;
ALTER TABLE public.spp_app_payment_batches
  ADD CONSTRAINT spp_app_payment_batches_subject_check CHECK (
    (source = 'bos' AND nospp IS NULL AND id_siswa IS NULL AND kdsek IS NULL)
    OR (source <> 'bos' AND id_siswa IS NOT NULL AND kdsek IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.spp_app_activity_allocations (
  payment_id bigint NOT NULL REFERENCES public.spp_app_payments(id) ON DELETE CASCADE,
  tahun_ajaran text NOT NULL CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'),
  nominal numeric(14,2) NOT NULL CHECK (nominal > 0),
  PRIMARY KEY (payment_id, tahun_ajaran)
);

CREATE INDEX IF NOT EXISTS spp_app_activity_allocations_year_idx
  ON public.spp_app_activity_allocations (tahun_ajaran, payment_id);

ALTER TABLE public.spp_app_activity_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read activity allocations" ON public.spp_app_activity_allocations;
CREATE POLICY "Read activity allocations" ON public.spp_app_activity_allocations
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.spp_app_activity_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_activity_allocations TO anon, authenticated;

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
BEGIN
  IF p_payment_id IS NULL OR NULLIF(btrim(p_id_siswa), '') IS NULL
     OR p_target_year !~ '^[0-9]{4}-[0-9]{4}$'
     OR p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'Alokasi uang Kegiatan tidak valid.' USING ERRCODE = '22023';
  END IF;

  FOR v_due IN
    SELECT due.tahun_ajaran, sum(due.nominal)::numeric AS nominal
    FROM (
      SELECT e.tahun_ajaran, e.giat AS nominal
      FROM public.spp_app_enrollments e
      WHERE e.id_siswa = p_id_siswa AND e.tahun_ajaran <= p_target_year AND e.giat > 0
      UNION ALL
      SELECT a.tahun_ajaran, a.nominal
      FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'kegiatan'
        AND a.tahun_ajaran <= p_target_year AND a.nominal > 0
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
    VALUES (p_payment_id, p_target_year, v_remaining)
    ON CONFLICT (payment_id, tahun_ajaran)
    DO UPDATE SET nominal = public.spp_app_activity_allocations.nominal + EXCLUDED.nominal;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_allocate_activity_payment(bigint, text, text, numeric)
  FROM PUBLIC, anon, authenticated;

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
    FROM public.spp_app_enrollments AS enrollment
    WHERE enrollment.id_siswa = p_id_siswa
      AND enrollment.nospp IS NOT DISTINCT FROM v_nospp
      AND enrollment.kdsek = p_kdsek
      AND enrollment.tahun_ajaran = p_tahun
  ) THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada unit dan tahun ajaran tersebut.' USING ERRCODE = '42501';
  END IF;

  v_billing := public.spp_app_student_billing_annual_v1(p_id_siswa, p_tahun, p_periode);
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
  FROM public.spp_app_payments AS payment
  JOIN public.spp_app_payment_batches AS batch ON batch.id = payment.batch_id
  WHERE payment.id_siswa = p_id_siswa
    AND payment.kdsek = p_kdsek;

  RETURN jsonb_build_object(
    'billing', v_billing,
    'transactions', v_transactions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_student_payment_history_v1(text, text, text, text, text, text, text)
  TO anon, authenticated;

-- Reconstruct old activity allocations in receipt-date order. Existing activity
-- payments first cover the oldest activity balance recorded for that student.
DO $backfill$
DECLARE
  v_payment record;
BEGIN
  FOR v_payment IN
    SELECT payment.id, payment.id_siswa, payment.nominal,
      COALESCE(enrollment.tahun_ajaran, batch.tahun_ajaran) AS tahun_ajaran
    FROM public.spp_app_payments payment
    JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
    LEFT JOIN public.spp_app_enrollments enrollment
      ON enrollment.nospp = payment.nospp
    WHERE payment.component = 'giat'
      AND batch.voided_at IS NULL
      AND COALESCE(enrollment.tahun_ajaran, batch.tahun_ajaran) ~ '^[0-9]{4}-[0-9]{4}$'
    ORDER BY payment.id_siswa, batch.tglbyr, batch.id, payment.id
  LOOP
    PERFORM public.spp_app_allocate_activity_payment(
      v_payment.id, v_payment.id_siswa, v_payment.tahun_ajaran, v_payment.nominal);
  END LOOP;
END;
$backfill$;

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

  v_id := nextval('public.spp_app_student_id_seq')::text;
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

REVOKE ALL ON FUNCTION public.save_student_v1(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_student_v1(text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_search_students_v2(p_q text, p_limit integer DEFAULT 8)
RETURNS TABLE (id_siswa text, nama text, kdsek text, kdkls text, nospp text, tahun_ajaran text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT DISTINCT ON (e.id_siswa)
    e.id_siswa, s.nama, e.kdsek, e.kdkls, e.nospp, e.tahun_ajaran
  FROM public.spp_app_students s
  JOIN public.spp_app_enrollments e ON e.id_siswa = s.id_siswa
  WHERE btrim(COALESCE(p_q, '')) = ''
     OR s.nama ILIKE '%' || btrim(p_q) || '%'
     OR s.id_siswa = btrim(p_q)
     OR e.nospp ILIKE btrim(p_q) || '%'
  ORDER BY e.id_siswa, e.tahun_ajaran DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$function$;

REVOKE ALL ON FUNCTION public.spp_app_search_students_v2(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_search_students_v2(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_activity_ledger_v1(p_id_siswa text, p_tahun text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH due AS (
    SELECT e.tahun_ajaran, sum(e.giat)::numeric AS nominal
    FROM public.spp_app_enrollments e
    WHERE e.id_siswa = p_id_siswa AND e.tahun_ajaran <= p_tahun AND e.giat > 0
    GROUP BY e.tahun_ajaran
    UNION ALL
    SELECT a.tahun_ajaran, sum(a.nominal)::numeric
    FROM public.spp_app_arrears a
    WHERE a.id_siswa = p_id_siswa AND a.jenis = 'kegiatan' AND a.tahun_ajaran <= p_tahun
    GROUP BY a.tahun_ajaran
  ), totals AS (
    SELECT due.tahun_ajaran, sum(due.nominal)::numeric AS tagihan,
      COALESCE((SELECT sum(allocation.nominal)
        FROM public.spp_app_activity_allocations allocation
        JOIN public.spp_app_payments payment ON payment.id = allocation.payment_id
        JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
        WHERE payment.id_siswa = p_id_siswa
          AND allocation.tahun_ajaran = due.tahun_ajaran
          AND batch.voided_at IS NULL), 0)::numeric AS dibayar
    FROM due
    GROUP BY due.tahun_ajaran
  )
  SELECT jsonb_build_object(
    'tagihan', COALESCE(sum(tagihan), 0),
    'dibayar', COALESCE(sum(least(tagihan, dibayar)), 0),
    'sisa', COALESCE(sum(greatest(tagihan - dibayar, 0)), 0),
    'rincian', COALESCE(jsonb_agg(jsonb_build_object(
      'tahun_ajaran', tahun_ajaran, 'tagihan', tagihan,
      'dibayar', least(tagihan, dibayar),
      'sisa', greatest(tagihan - dibayar, 0)
    ) ORDER BY tahun_ajaran), '[]'::jsonb)
  )
  FROM totals;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_activity_ledger_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_activity_ledger_v1(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_student_billing_annual_v1(
  p_id_siswa text,
  p_tahun text,
  p_periode text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_billing jsonb;
  v_activity jsonb;
  v_row jsonb;
  v_periods jsonb := '[]'::jsonb;
  v_period text;
  v_spp_target numeric;
  v_computer_target numeric;
  v_spp_paid numeric;
  v_computer_paid numeric;
  v_spp_credit numeric := 0;
  v_computer_credit numeric := 0;
  v_spp_due numeric;
  v_computer_due numeric;
  v_spp_total numeric := 0;
  v_computer_total numeric := 0;
  v_activity_old_due numeric;
  v_activity_due numeric;
  v_one_time_due numeric;
  v_year_closed boolean;
BEGIN
  v_billing := public.spp_app_student_billing_v1(p_id_siswa, p_tahun, p_periode);
  IF v_billing IS NULL THEN
    RETURN NULL;
  END IF;

  v_year_closed := COALESCE((v_billing->>'cutoff_selesai')::boolean, false);
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_billing->'periode_bulanan')
  LOOP
    v_period := v_row->>'periode';
    v_spp_target := COALESCE((v_row->'spp'->>'tagihan')::numeric, 0);
    v_computer_target := COALESCE((v_row->'komp'->>'tagihan')::numeric, 0);
    SELECT
      COALESCE(sum(payment.nominal) FILTER (WHERE payment.component IN ('spp', 'spp_bos')), 0),
      COALESCE(sum(payment.nominal) FILTER (WHERE payment.component = 'komp'), 0)
    INTO v_spp_paid, v_computer_paid
    FROM public.spp_app_payments payment
    JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
    WHERE payment.id_siswa = p_id_siswa
      AND batch.tahun_ajaran = p_tahun
      AND payment.periode = v_period
      AND batch.voided_at IS NULL;

    v_spp_due := greatest(v_spp_target - v_spp_paid - v_spp_credit, 0);
    v_computer_due := greatest(v_computer_target - v_computer_paid - v_computer_credit, 0);
    IF v_year_closed THEN
      v_spp_due := 0;
      v_computer_due := 0;
    END IF;
    v_row := jsonb_set(v_row, '{spp,dibayar}', to_jsonb(v_spp_paid), true);
    v_row := jsonb_set(v_row, '{spp,saldo_dibawa}', to_jsonb(v_spp_credit), true);
    v_row := jsonb_set(v_row, '{spp,sisa}', to_jsonb(v_spp_due), true);
    v_row := jsonb_set(v_row, '{spp,status}', to_jsonb(CASE
      WHEN v_spp_target = 0 THEN '-'
      WHEN v_year_closed AND v_spp_target > v_spp_paid + v_spp_credit THEN 'Dipindahkan'
      WHEN v_spp_due = 0 THEN 'Lunas'
      WHEN v_spp_paid + v_spp_credit > 0 THEN 'Cicilan'
      ELSE 'Belum bayar' END), true);
    v_row := jsonb_set(v_row, '{komp,dibayar}', to_jsonb(v_computer_paid), true);
    v_row := jsonb_set(v_row, '{komp,saldo_dibawa}', to_jsonb(v_computer_credit), true);
    v_row := jsonb_set(v_row, '{komp,sisa}', to_jsonb(v_computer_due), true);
    v_row := jsonb_set(v_row, '{komp,status}', to_jsonb(CASE
      WHEN v_computer_target = 0 THEN '-'
      WHEN v_year_closed AND v_computer_target > v_computer_paid + v_computer_credit THEN 'Dipindahkan'
      WHEN v_computer_due = 0 THEN 'Lunas'
      WHEN v_computer_paid + v_computer_credit > 0 THEN 'Cicilan'
      ELSE 'Belum bayar' END), true);
    v_periods := v_periods || jsonb_build_array(v_row);
    v_spp_total := v_spp_total + v_spp_due;
    v_computer_total := v_computer_total + v_computer_due;
    v_spp_credit := greatest(v_spp_paid + v_spp_credit - v_spp_target, 0);
    v_computer_credit := greatest(v_computer_paid + v_computer_credit - v_computer_target, 0);
  END LOOP;

  v_activity := public.spp_app_activity_ledger_v1(p_id_siswa, p_tahun);
  v_activity_old_due := COALESCE((v_billing->'komponen_satu_kali'->'giat'->>'sisa')::numeric, 0);
  v_activity_due := COALESCE((v_activity->>'sisa')::numeric, 0);
  v_billing := jsonb_set(v_billing, '{periode_bulanan}', v_periods, true);
  v_billing := jsonb_set(v_billing, '{komponen_satu_kali,giat}', jsonb_build_object(
    'tagihan', COALESCE((v_activity->>'tagihan')::numeric, 0),
    'dibayar', COALESCE((v_activity->>'dibayar')::numeric, 0),
    'sisa', v_activity_due,
    'status', CASE
      WHEN COALESCE((v_activity->>'tagihan')::numeric, 0) = 0 THEN '-'
      WHEN v_activity_due = 0 THEN 'Lunas'
      WHEN COALESCE((v_activity->>'dibayar')::numeric, 0) > 0 THEN 'Cicilan'
      ELSE 'Belum bayar' END,
    'rincian', v_activity->'rincian'
  ), true);
  v_one_time_due := greatest(
    COALESCE((v_billing->>'sisa_satu_kali')::numeric, 0) - v_activity_old_due + v_activity_due, 0);
  v_billing := jsonb_set(v_billing, '{sisa_spp}', to_jsonb(v_spp_total), true);
  v_billing := jsonb_set(v_billing, '{sisa_komp}', to_jsonb(v_computer_total), true);
  v_billing := jsonb_set(v_billing, '{sisa_satu_kali}', to_jsonb(v_one_time_due), true);
  RETURN jsonb_set(v_billing, '{sisa_total}',
    to_jsonb(v_one_time_due + v_spp_total + v_computer_total), true);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_student_billing_annual_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_student_billing_annual_v1(text, text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_student_prepaid_billing_v1(
  p_id_siswa text,
  p_tahun text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_enrollment public.spp_app_enrollments%ROWTYPE;
  v_student public.spp_app_students%ROWTYPE;
  v_start integer;
  v_month date;
  v_start_month date;
  v_period text;
  v_spp_rate numeric;
  v_computer_rate numeric;
  v_spp_paid numeric;
  v_computer_paid numeric;
  v_spp_credit numeric := 0;
  v_computer_credit numeric := 0;
  v_spp_credit_in numeric;
  v_computer_credit_in numeric;
  v_spp_due numeric := 0;
  v_computer_due numeric := 0;
  v_periods jsonb := '[]'::jsonb;
  v_components jsonb := '{}'::jsonb;
  v_component record;
  v_paid numeric;
  v_due numeric;
  v_activity jsonb;
  v_activity_target numeric;
  v_activity_paid numeric;
  v_activity_remaining numeric;
  v_one_time numeric := 0;
  v_last_paid date;
BEGIN
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(p_tahun, '-', 2)::integer <> split_part(p_tahun, '-', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_enrollment
  FROM public.spp_app_enrollments e
  WHERE e.id_siswa = p_id_siswa AND e.tahun_ajaran = p_tahun;
  IF v_enrollment.id_siswa IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_student FROM public.spp_app_students s WHERE s.id_siswa = p_id_siswa;

  v_start := split_part(p_tahun, '-', 1)::integer;
  v_start_month := make_date(v_start, 7, 1);
  IF v_enrollment.periode_masuk IS NOT NULL THEN
    v_start_month := greatest(v_start_month, to_date(v_enrollment.periode_masuk, 'MMYYYY'));
  END IF;
  IF v_start_month <= make_date(v_start + 1, 6, 1) THEN
    FOR v_month IN SELECT generate_series(v_start_month, make_date(v_start + 1, 6, 1), interval '1 month')::date
    LOOP
      v_period := to_char(v_month, 'MMYYYY');
      SELECT COALESCE(rate.spp, v_enrollment.spp),
        COALESCE(rate.komp, v_enrollment.komp)
      INTO v_spp_rate, v_computer_rate
      FROM (SELECT 1) AS seed
      LEFT JOIN LATERAL (
        SELECT h.spp, h.komp FROM public.spp_app_spp_history h
        WHERE h.id_siswa = p_id_siswa AND h.tahun_ajaran = p_tahun
          AND h.effective_date <= v_month
        ORDER BY h.effective_date DESC LIMIT 1
      ) rate ON true;
      SELECT COALESCE(sum(p.nominal) FILTER (WHERE p.component IN ('spp', 'spp_bos')), 0),
        COALESCE(sum(p.nominal) FILTER (WHERE p.component = 'komp'), 0)
      INTO v_spp_paid, v_computer_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.id_siswa = p_id_siswa AND b.tahun_ajaran = p_tahun
        AND p.periode = v_period AND b.voided_at IS NULL;

      v_spp_credit_in := v_spp_credit;
      v_computer_credit_in := v_computer_credit;
      v_spp_due := greatest(v_spp_rate - v_spp_paid - v_spp_credit_in, 0);
      v_computer_due := greatest(v_computer_rate - v_computer_paid - v_computer_credit_in, 0);
      v_spp_credit := greatest(v_spp_paid + v_spp_credit_in - v_spp_rate, 0);
      v_computer_credit := greatest(v_computer_paid + v_computer_credit_in - v_computer_rate, 0);
      v_periods := v_periods || jsonb_build_array(jsonb_build_object(
        'periode', v_period,
        'spp', jsonb_build_object('tagihan', v_spp_rate, 'dibayar', v_spp_paid,
          'saldo_dibawa', v_spp_credit_in,
          'sisa', v_spp_due, 'status', CASE WHEN v_spp_rate = 0 THEN '-'
            WHEN v_spp_due = 0 THEN 'Lunas' WHEN v_spp_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END),
        'komp', jsonb_build_object('tagihan', v_computer_rate, 'dibayar', v_computer_paid,
          'saldo_dibawa', v_computer_credit_in,
          'sisa', v_computer_due, 'status', CASE WHEN v_computer_rate = 0 THEN '-'
            WHEN v_computer_due = 0 THEN 'Lunas' WHEN v_computer_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END)));
  END LOOP;
  END IF;

  FOR v_component IN
    SELECT 'dpp'::text AS component, greatest(
      COALESCE((SELECT e.dpp FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.dpp > 0 ORDER BY e.tahun_ajaran LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dpp'), 0)) AS target,
      ARRAY['dpp','dpp_tl']::text[] AS payment_components
    UNION ALL SELECT 'dsp', greatest(
      COALESCE((SELECT e.dsp FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.dsp > 0 ORDER BY e.tahun_ajaran LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dsp'), 0)), ARRAY['dsp']::text[]
    UNION ALL SELECT 'seragam', greatest(
      COALESCE((SELECT e.seragam FROM public.spp_app_enrollments e
        WHERE e.id_siswa = p_id_siswa AND e.seragam > 0 ORDER BY e.tahun_ajaran LIMIT 1), 0),
      COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
        WHERE a.id_siswa = p_id_siswa AND a.jenis = 'seragam'), 0)), ARRAY['seragam']::text[]
    UNION ALL SELECT 'dpp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dpp' AND a.tahun_ajaran < p_tahun), 0),
      ARRAY['dpp_tl']::text[]
    UNION ALL SELECT 'spp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'spp' AND a.tahun_ajaran < p_tahun), 0),
      ARRAY['spp_tl']::text[]
    UNION ALL SELECT 'komp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'komputer' AND a.tahun_ajaran < p_tahun), 0),
      ARRAY['komp_tl']::text[]
    UNION ALL SELECT 'lainnya', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'lainnya'), 0), ARRAY['lainnya']::text[]
  LOOP
    SELECT COALESCE(sum(p.nominal), 0) INTO v_paid
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.id_siswa = p_id_siswa AND p.component = ANY(v_component.payment_components)
      AND b.voided_at IS NULL;
    v_due := greatest(v_component.target - v_paid, 0);
    v_one_time := v_one_time + v_due;
    v_components := v_components || jsonb_build_object(v_component.component,
      jsonb_build_object('tagihan', v_component.target, 'dibayar', least(v_paid, v_component.target),
        'sisa', v_due, 'status', CASE WHEN v_component.target = 0 THEN '-'
          WHEN v_due = 0 THEN 'Lunas' WHEN v_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END));
  END LOOP;

  v_activity := public.spp_app_activity_ledger_v1(p_id_siswa, p_tahun);
  v_activity_target := COALESCE((v_activity->>'tagihan')::numeric, 0);
  v_activity_paid := COALESCE((v_activity->>'dibayar')::numeric, 0);
  v_activity_remaining := COALESCE((v_activity->>'sisa')::numeric, 0);
  v_components := v_components || jsonb_build_object('giat', jsonb_build_object(
    'tagihan', v_activity_target, 'dibayar', v_activity_paid, 'sisa', v_activity_remaining,
    'status', CASE WHEN v_activity_target = 0 THEN '-'
      WHEN v_activity_remaining = 0 THEN 'Lunas'
      WHEN v_activity_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END,
    'rincian', v_activity->'rincian'));
  v_one_time := v_one_time + v_activity_remaining;
  SELECT max(p.tglbyr) INTO v_last_paid
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.id_siswa = p_id_siswa AND b.voided_at IS NULL;

  RETURN jsonb_build_object(
    'id_siswa', p_id_siswa, 'tahun_ajaran', p_tahun, 'kdsek', v_enrollment.kdsek,
    'kdkls', v_enrollment.kdkls, 'nospp', v_enrollment.nospp, 'nama', v_student.nama,
    'no_wa', v_student.no_wa, 'periode_masuk', v_enrollment.periode_masuk,
    'periode_aktif', to_char(make_date(v_start + 1, 6, 1), 'MMYYYY'),
    'periode_bulanan', v_periods, 'payment_periods', v_periods,
    'komponen_satu_kali', v_components,
    'sisa_spp', COALESCE((SELECT sum((item->'spp'->>'sisa')::numeric)
      FROM jsonb_array_elements(v_periods) item), 0),
    'sisa_komp', COALESCE((SELECT sum((item->'komp'->>'sisa')::numeric)
      FROM jsonb_array_elements(v_periods) item), 0),
    'sisa_satu_kali', v_one_time,
    'sisa_total', v_one_time + COALESCE((SELECT sum((item->'spp'->>'sisa')::numeric
      + (item->'komp'->>'sisa')::numeric) FROM jsonb_array_elements(v_periods) item), 0),
    'belum_dialokasikan', 0, 'jumlah_belum_dialokasikan', 0, 'terakhir_bayar', v_last_paid);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_student_prepaid_billing_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_student_prepaid_billing_v1(text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_allocate_activity_payment_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target_year text;
BEGIN
  IF NEW.component <> 'giat' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(batch.tahun_ajaran, enrollment.tahun_ajaran)
  INTO v_target_year
  FROM public.spp_app_payment_batches batch
  LEFT JOIN public.spp_app_enrollments enrollment
    ON enrollment.nospp = NEW.nospp
  WHERE batch.id = NEW.batch_id;
  IF v_target_year IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran pembayaran Kegiatan tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.spp_app_allocate_activity_payment(
    NEW.id, NEW.id_siswa, v_target_year, NEW.nominal);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS spp_app_allocate_activity_payment ON public.spp_app_payments;
CREATE TRIGGER spp_app_allocate_activity_payment
AFTER INSERT ON public.spp_app_payments
FOR EACH ROW EXECUTE FUNCTION public.spp_app_allocate_activity_payment_trigger();

CREATE OR REPLACE FUNCTION public.spp_app_create_payment_batch_v2(
  p_actor text,
  p_id_siswa text,
  p_tahun_ajaran text,
  p_tglbyr date,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_enrollment public.spp_app_enrollments%ROWTYPE;
  v_operator_code text;
  v_item jsonb;
  v_component text;
  v_period text;
  v_amount numeric;
  v_batch_id bigint;
  v_receipt_no text;
  v_count integer := 0;
  v_total numeric := 0;
  v_start integer;
BEGIN
  IF p_tglbyr IS NULL OR p_tglbyr > current_date THEN
    RAISE EXCEPTION 'Tanggal uang masuk tidak boleh kosong atau di masa depan.' USING ERRCODE = '22023';
  END IF;
  IF p_tahun_ajaran !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(p_tahun_ajaran, '-', 2)::integer
       <> split_part(p_tahun_ajaran, '-', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran pembayaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 36 THEN
    RAISE EXCEPTION 'Isi 1 sampai 36 rincian pembayaran.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_enrollment
  FROM public.spp_app_enrollments
  WHERE id_siswa = btrim(COALESCE(p_id_siswa, ''))
    AND tahun_ajaran = p_tahun_ajaran
  FOR UPDATE;
  IF v_enrollment.id_siswa IS NULL THEN
    RAISE EXCEPTION 'Pendaftaran siswa pada tahun ajaran tersebut tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  SELECT c.kode_operator INTO v_operator_code
  FROM public.spp_app_operator_codes c
  WHERE lower(c.idpemakai) = lower(p_actor);
  IF v_operator_code IS NULL THEN
    RAISE EXCEPTION 'Kode operator belum diatur. Minta Admin mengatur kode operator terlebih dahulu.' USING ERRCODE = '22023';
  END IF;

  v_start := split_part(p_tahun_ajaran, '-', 1)::integer;
  v_receipt_no := 'SPP-' || to_char(current_date, 'YYYY') || '-'
    || lpad(nextval('public.spp_app_receipt_no_seq'::regclass)::text, 8, '0');
  INSERT INTO public.spp_app_payment_batches
    (receipt_no, nospp, id_siswa, kdsek, source, tglbyr, idpemakai, operator_code, tahun_ajaran)
  VALUES (v_receipt_no, v_enrollment.nospp, v_enrollment.id_siswa, v_enrollment.kdsek,
    'manual', p_tglbyr, p_actor, v_operator_code, p_tahun_ajaran)
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_component := lower(btrim(COALESCE(v_item->>'component', '')));
    v_period := btrim(COALESCE(v_item->>'periode', ''));
    v_amount := NULLIF(v_item->>'nominal', '')::numeric;
    IF v_component NOT IN (
      'spp', 'spp_bos', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
      'spp_tl', 'komp_tl', 'lainnya', 'legacy'
    ) THEN
      RAISE EXCEPTION 'Komponen pembayaran tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal setiap komponen harus lebih dari 0.' USING ERRCODE = '22023';
    END IF;
    IF v_component IN ('spp', 'spp_bos', 'komp') THEN
      IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$'
         OR to_date(v_period, 'MMYYYY') NOT BETWEEN make_date(v_start, 7, 1)
           AND make_date(v_start + 1, 6, 1) THEN
        RAISE EXCEPTION 'Periode SPP/Komputer harus berada dalam tahun ajaran siswa.' USING ERRCODE = '22023';
      END IF;
      IF v_enrollment.periode_masuk IS NOT NULL
         AND to_date(v_period, 'MMYYYY') < to_date(v_enrollment.periode_masuk, 'MMYYYY') THEN
        RAISE EXCEPTION 'Periode pembayaran lebih awal dari periode masuk siswa.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_component <> 'legacy' THEN
      v_period := '';
    END IF;

    INSERT INTO public.spp_app_payments
      (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component, tglbyr, batch_id)
    VALUES (v_enrollment.nospp, v_enrollment.id_siswa, v_enrollment.kdsek,
      v_period, v_amount, p_actor, v_component, p_tglbyr, v_batch_id);
    v_count := v_count + 1;
    v_total := v_total + v_amount;
  END LOOP;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (p_actor, 'bayar_tambah', v_enrollment.id_siswa, jsonb_build_object(
    'batch_id', v_batch_id, 'receipt_no', v_receipt_no, 'tahun_ajaran', p_tahun_ajaran,
    'tanggal', p_tglbyr, 'jumlah_komponen', v_count, 'total_nominal', v_total));
  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_payment_batch_v2(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_tahun_ajaran text,
  p_tglbyr date,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
BEGIN
  RETURN public.spp_app_create_payment_batch_v2(
    v_actor, p_id_siswa, p_tahun_ajaran, p_tglbyr, p_items);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_create_payment_batch_v2(text, text, text, date, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_payment_batch_v2(text, text, text, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_payment_batch_v2(text, text, text, text, date, jsonb)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_activity_dashboard_v1(
  p_username text,
  p_password text,
  p_tahun text,
  p_kdsek text DEFAULT NULL,
  p_kdkls text DEFAULT NULL
)
RETURNS TABLE (
  kdsek text,
  kdkls text,
  target numeric,
  dibayar numeric,
  sisa numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT lower(COALESCE(m.role, 'unit')) INTO v_role
  FROM public.mastusr m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses laporan Kegiatan ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH enrollment_due AS (
    SELECT e.id_siswa, e.kdsek, e.kdkls, e.giat::numeric AS nominal
    FROM public.spp_app_enrollments e
    JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun AND s.show_in_billing
      AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)
      AND (p_kdkls IS NULL OR e.kdkls = p_kdkls)
  ),
  paid AS (
    SELECT payment.id_siswa, allocation.tahun_ajaran, sum(allocation.nominal)::numeric AS nominal
    FROM public.spp_app_activity_allocations allocation
    JOIN public.spp_app_payments payment ON payment.id = allocation.payment_id
    JOIN public.spp_app_payment_batches batch ON batch.id = payment.batch_id
    WHERE allocation.tahun_ajaran = p_tahun
      AND batch.voided_at IS NULL
    GROUP BY payment.id_siswa, allocation.tahun_ajaran
  ),
  manual_due AS (
    SELECT a.id_siswa, sum(a.nominal)::numeric AS nominal
    FROM public.spp_app_arrears a
    WHERE a.jenis = 'kegiatan' AND a.tahun_ajaran = p_tahun
    GROUP BY a.id_siswa
  ),
  subjects AS (
    SELECT DISTINCT due.id_siswa, due.kdsek, due.kdkls
    FROM enrollment_due due
    UNION
    SELECT DISTINCT p.id_siswa, e.kdsek, e.kdkls
    FROM paid p
    JOIN public.spp_app_enrollments e
      ON e.id_siswa = p.id_siswa AND e.tahun_ajaran = p_tahun
    WHERE (p_kdsek IS NULL OR e.kdsek = p_kdsek)
      AND (p_kdkls IS NULL OR e.kdkls = p_kdkls)
  )
  SELECT subject.kdsek, subject.kdkls,
    sum(COALESCE(enrollment_due.nominal, 0) + COALESCE(manual_due.nominal, 0))::numeric,
    sum(COALESCE(paid.nominal, 0))::numeric,
    sum(greatest(COALESCE(enrollment_due.nominal, 0)
      + COALESCE(manual_due.nominal, 0) - COALESCE(paid.nominal, 0), 0))::numeric
  FROM subjects subject
  LEFT JOIN enrollment_due ON enrollment_due.id_siswa = subject.id_siswa
  LEFT JOIN manual_due ON manual_due.id_siswa = subject.id_siswa
  LEFT JOIN paid ON paid.id_siswa = subject.id_siswa
  GROUP BY subject.kdsek, subject.kdkls
  ORDER BY subject.kdsek, subject.kdkls NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_activity_dashboard_v1(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_activity_dashboard_v1(text, text, text, text, text)
  TO anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_student_overview AS
SELECT
  e.id_siswa, e.tahun_ajaran, e.kdsek, e.kdkls, e.nospp, e.spp, e.komp, e.giat,
  s.nama, s.no_wa, s.is_staff_child, s.show_in_billing,
  COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a WHERE a.id_siswa = e.id_siswa), 0) AS arrears_total,
  COALESCE((SELECT sum(p.nominal) FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.id_siswa = e.id_siswa AND b.tahun_ajaran = e.tahun_ajaran
      AND b.voided_at IS NULL), 0) AS paid_total,
  (SELECT max(p.tglbyr) FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.id_siswa = e.id_siswa AND b.tahun_ajaran = e.tahun_ajaran
      AND b.voided_at IS NULL) AS last_paid,
  e.dpp, e.dsp, e.seragam, e.periode_masuk,
  COALESCE((
    SELECT settings.school_name
    FROM public.spp_app_school_settings settings
    WHERE settings.school_code = e.kdsek
  ), e.kdsek) AS school_name,
  CASE
    WHEN e.kdkls ~ '^[0-9]+' THEN
      lpad(regexp_replace(e.kdkls, '^([0-9]+).*$', '\1'), 6, '0')
        || lower(regexp_replace(e.kdkls, '^[0-9]+', ''))
    ELSE lower(e.kdkls)
  END AS class_sort
FROM public.spp_app_enrollments e
JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa;

REVOKE ALL ON TABLE public.spp_app_student_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_student_overview TO anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_payment_batch_list AS
SELECT b.id, b.receipt_no, b.nospp, b.id_siswa, COALESCE(b.kdsek, min(p.kdsek)) AS kdsek, b.source,
  b.tglbyr, b.idpemakai, b.operator_code, b.created_at, b.notes,
  b.voided_at, b.voided_by, b.void_reason, b.correction_no,
  b.correction_created_at, b.correction_operator_code,
  CASE WHEN b.source = 'bos' THEN 'Alokasi BOS' ELSE COALESCE(s.nama, 'Siswa') END AS nama,
  COALESCE(sum(p.nominal), 0) AS nominal,
  count(p.id)::integer AS item_count,
  count(DISTINCT p.id_siswa)::integer AS student_count,
  COALESCE(sum(p.nominal) FILTER (WHERE b.source = 'bos' OR p.component = 'spp_bos'), 0) AS bos_nominal,
  COALESCE(sum(p.nominal) FILTER (WHERE b.source <> 'bos' AND p.component <> 'spp_bos'), 0) AS parent_nominal,
  b.tahun_ajaran
FROM public.spp_app_payment_batches b
LEFT JOIN public.spp_app_payments p ON p.batch_id = b.id
LEFT JOIN public.spp_app_students s ON s.id_siswa = b.id_siswa
GROUP BY b.id, s.nama;

CREATE OR REPLACE VIEW public.spp_app_payment_batch_items AS
SELECT b.id AS batch_id, b.receipt_no, b.source, b.tglbyr, b.created_at,
  b.idpemakai, b.operator_code, b.notes, b.voided_at, b.void_reason,
  b.correction_no, b.correction_created_at, b.correction_operator_code,
  p.id AS payment_id, p.nospp, p.id_siswa, p.kdsek,
  s.nama, e.kdkls, p.component, p.periode, p.nominal,
  COALESCE(activity.allocations, '[]'::jsonb) AS activity_allocations
FROM public.spp_app_payment_batches b
JOIN public.spp_app_payments p ON p.batch_id = b.id
LEFT JOIN public.spp_app_students s ON s.id_siswa = p.id_siswa
LEFT JOIN LATERAL (
  SELECT enrollment.kdkls
  FROM public.spp_app_enrollments enrollment
  WHERE enrollment.id_siswa = p.id_siswa AND enrollment.tahun_ajaran = b.tahun_ajaran
  ORDER BY enrollment.tahun_ajaran DESC
  LIMIT 1
) e ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'tahun_ajaran', allocation.tahun_ajaran,
    'nominal', allocation.nominal
  ) ORDER BY allocation.tahun_ajaran) AS allocations
  FROM public.spp_app_activity_allocations allocation
  WHERE allocation.payment_id = p.id
) activity ON true;

NOTIFY pgrst, 'reload schema';
COMMIT;
