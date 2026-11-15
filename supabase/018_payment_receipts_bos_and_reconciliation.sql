-- Receipt batches, traceable corrections, flexible BOS allocation, and daily reconciliation.
-- Run after 017_payment_import_and_reporting_fix.sql.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.spp_app_receipt_no_seq;
CREATE SEQUENCE IF NOT EXISTS public.spp_app_correction_no_seq;

CREATE TABLE IF NOT EXISTS public.spp_app_operator_codes (
  idpemakai text PRIMARY KEY,
  kode_operator text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_operator_codes_code_ci_idx
  ON public.spp_app_operator_codes (lower(kode_operator));

WITH accounts AS (
  SELECT DISTINCT ON (lower(btrim(m.idpemakai))) btrim(m.idpemakai) AS idpemakai
  FROM public.mastusr m
  WHERE NULLIF(btrim(m.idpemakai), '') IS NOT NULL
  ORDER BY lower(btrim(m.idpemakai)), btrim(m.idpemakai)
),
numbered AS (
  SELECT idpemakai,
    upper(COALESCE(NULLIF(left(regexp_replace(idpemakai, '[^A-Za-z0-9]', '', 'g'), 10), ''), 'OP'))
      || lpad(row_number() OVER (ORDER BY lower(idpemakai))::text, 3, '0') AS kode_operator
  FROM accounts
)
INSERT INTO public.spp_app_operator_codes (idpemakai, kode_operator)
SELECT idpemakai, kode_operator FROM numbered
ON CONFLICT (idpemakai) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.spp_app_payment_batches (
  id bigserial PRIMARY KEY,
  receipt_no text NOT NULL UNIQUE,
  nospp text,
  id_siswa text,
  kdsek text,
  source text NOT NULL CHECK (source IN ('manual', 'upload', 'bos', 'legacy')),
  tglbyr date NOT NULL,
  idpemakai text NOT NULL,
  operator_code text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  correction_no text UNIQUE,
  correction_created_at timestamptz,
  correction_operator_code text,
  CONSTRAINT spp_app_payment_batches_subject_check CHECK (
    (source = 'bos' AND nospp IS NULL AND id_siswa IS NULL AND kdsek IS NULL)
    OR (source <> 'bos' AND nospp IS NOT NULL AND id_siswa IS NOT NULL AND kdsek IS NOT NULL)
  ),
  CONSTRAINT spp_app_payment_batches_void_check CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL
      AND correction_no IS NULL AND correction_created_at IS NULL AND correction_operator_code IS NULL)
    OR (voided_at IS NOT NULL AND NULLIF(btrim(voided_by), '') IS NOT NULL
      AND NULLIF(btrim(void_reason), '') IS NOT NULL AND NULLIF(btrim(correction_no), '') IS NOT NULL
      AND correction_created_at IS NOT NULL AND NULLIF(btrim(correction_operator_code), '') IS NOT NULL)
  )
);

ALTER TABLE public.spp_app_payments
  DROP CONSTRAINT IF EXISTS spp_app_payments_component_check;
ALTER TABLE public.spp_app_payments
  ADD CONSTRAINT spp_app_payments_component_check
  CHECK (component IN (
    'spp', 'spp_bos', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
    'spp_tl', 'komp_tl', 'lainnya', 'legacy'
  ));

ALTER TABLE public.spp_app_payments
  ADD COLUMN IF NOT EXISTS batch_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spp_app_payments_batch_id_fkey'
      AND conrelid = 'public.spp_app_payments'::regclass
  ) THEN
    ALTER TABLE public.spp_app_payments
      ADD CONSTRAINT spp_app_payments_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES public.spp_app_payment_batches(id);
  END IF;
END $$;

INSERT INTO public.spp_app_payment_batches
  (receipt_no, nospp, id_siswa, kdsek, source, tglbyr, idpemakai, operator_code, created_at)
SELECT 'LEGACY-' || p.id::text, p.nospp, p.id_siswa, p.kdsek, 'legacy', p.tglbyr,
  p.idpemakai, COALESCE(c.kode_operator, 'LEGACY'), p.created_at
FROM public.spp_app_payments p
LEFT JOIN public.spp_app_operator_codes c ON lower(c.idpemakai) = lower(p.idpemakai)
WHERE p.batch_id IS NULL
ON CONFLICT (receipt_no) DO NOTHING;

UPDATE public.spp_app_payments p
SET batch_id = b.id
FROM public.spp_app_payment_batches b
WHERE p.batch_id IS NULL
  AND b.receipt_no = 'LEGACY-' || p.id::text;

ALTER TABLE public.spp_app_payments
  ALTER COLUMN batch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS spp_app_payment_batches_date_idx
  ON public.spp_app_payment_batches (tglbyr DESC, id DESC);
CREATE INDEX IF NOT EXISTS spp_app_payment_batches_source_date_idx
  ON public.spp_app_payment_batches (source, tglbyr DESC);
CREATE INDEX IF NOT EXISTS spp_app_payments_batch_idx
  ON public.spp_app_payments (batch_id, id);

ALTER TABLE public.spp_app_payment_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read payment batches" ON public.spp_app_payment_batches;
CREATE POLICY "Read payment batches" ON public.spp_app_payment_batches
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.spp_app_payment_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_batches TO anon, authenticated;
REVOKE ALL ON TABLE public.spp_app_operator_codes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_payment_list AS
SELECT p.id, p.nospp, p.id_siswa, p.kdsek, p.periode, p.nominal, p.tglbyr,
  p.idpemakai, p.ket, s.nama, p.component,
  b.id AS batch_id, b.receipt_no, b.source, b.operator_code, b.created_at,
  b.voided_at, b.void_reason, b.correction_no, b.correction_created_at,
  b.correction_operator_code
FROM public.spp_app_payments p
JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
LEFT JOIN public.spp_app_students s ON s.id_siswa = p.id_siswa;

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
  COALESCE(sum(p.nominal) FILTER (WHERE b.source <> 'bos' AND p.component <> 'spp_bos'), 0) AS parent_nominal
FROM public.spp_app_payment_batches b
LEFT JOIN public.spp_app_payments p ON p.batch_id = b.id
LEFT JOIN public.spp_app_students s ON s.id_siswa = b.id_siswa
GROUP BY b.id, s.nama;

CREATE OR REPLACE VIEW public.spp_app_payment_batch_items AS
SELECT b.id AS batch_id, b.receipt_no, b.source, b.tglbyr, b.created_at,
  b.idpemakai, b.operator_code, b.notes, b.voided_at, b.void_reason,
  b.correction_no, b.correction_created_at, b.correction_operator_code,
  p.id AS payment_id, p.nospp, p.id_siswa, p.kdsek,
  s.nama, e.kdkls, p.component, p.periode, p.nominal
FROM public.spp_app_payment_batches b
JOIN public.spp_app_payments p ON p.batch_id = b.id
LEFT JOIN public.spp_app_students s ON s.id_siswa = p.id_siswa
LEFT JOIN LATERAL (
  SELECT enrollment.kdkls
  FROM public.spp_app_enrollments enrollment
  WHERE enrollment.id_siswa = p.id_siswa AND enrollment.nospp = p.nospp
  ORDER BY enrollment.tahun_ajaran DESC
  LIMIT 1
) e ON true;

REVOKE ALL ON TABLE public.spp_app_payment_batch_list FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spp_app_payment_batch_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_batch_list TO anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_batch_items TO anon, authenticated;
REVOKE ALL ON TABLE public.spp_app_payment_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_payment_list TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_create_payment_batch(
  p_actor text,
  p_source text,
  p_nospp text,
  p_tglbyr date,
  p_items jsonb,
  p_notes text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_operator_code text;
  v_item jsonb;
  v_component text;
  v_period text;
  v_amount numeric;
  v_batch_id bigint;
  v_receipt_no text;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  IF p_source NOT IN ('manual', 'upload') THEN
    RAISE EXCEPTION 'Sumber transaksi tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_tglbyr IS NULL OR p_tglbyr > current_date THEN
    RAISE EXCEPTION 'Tanggal uang masuk tidak boleh kosong atau di masa depan.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 36 THEN
    RAISE EXCEPTION 'Isi 1 sampai 36 rincian pembayaran.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enr
  FROM public.spp_app_enrollments
  WHERE nospp = btrim(COALESCE(p_nospp, ''))
  ORDER BY tahun_ajaran DESC
  LIMIT 1;
  IF v_enr.nospp IS NULL THEN
    RAISE EXCEPTION 'No. SPP tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  SELECT c.kode_operator INTO v_operator_code
  FROM public.spp_app_operator_codes c
  WHERE lower(c.idpemakai) = lower(p_actor);
  IF v_operator_code IS NULL THEN
    RAISE EXCEPTION 'Kode operator belum diatur. Minta Admin mengatur kode operator terlebih dahulu.' USING ERRCODE = '22023';
  END IF;

  v_receipt_no := 'SPP-' || to_char(current_date, 'YYYY') || '-'
    || lpad(nextval('public.spp_app_receipt_no_seq'::regclass)::text, 8, '0');
  INSERT INTO public.spp_app_payment_batches
    (receipt_no, nospp, id_siswa, kdsek, source, tglbyr, idpemakai, operator_code, notes)
  VALUES
    (v_receipt_no, v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, p_source,
      p_tglbyr, p_actor, v_operator_code, left(btrim(COALESCE(p_notes, '')), 200))
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
      IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
        RAISE EXCEPTION 'Periode SPP/BOS/KOMP harus berformat MMYYYY.' USING ERRCODE = '22023';
      END IF;
      IF to_date(v_period, 'MMYYYY') < make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer, 7, 1)
         OR to_date(v_period, 'MMYYYY') > make_date(split_part(v_enr.tahun_ajaran, '-', 1)::integer + 1, 6, 1) THEN
        RAISE EXCEPTION 'Periode SPP/KOMP harus berada di tahun ajaran siswa.' USING ERRCODE = '22023';
      END IF;
      IF v_enr.periode_masuk IS NOT NULL
         AND to_date(v_period, 'MMYYYY') < to_date(v_enr.periode_masuk, 'MMYYYY') THEN
        RAISE EXCEPTION 'Periode pembayaran lebih awal dari periode masuk siswa.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_component <> 'legacy' THEN
      v_period := '';
    END IF;

    INSERT INTO public.spp_app_payments
      (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component, tglbyr, batch_id)
    VALUES
      (v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, v_period,
        v_amount, p_actor, v_component, p_tglbyr, v_batch_id);
    v_count := v_count + 1;
    v_total := v_total + v_amount;
  END LOOP;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  VALUES (p_actor, CASE WHEN p_source = 'upload' THEN 'bayar_import' ELSE 'bayar_tambah' END,
    v_enr.id_siswa, jsonb_build_object(
      'batch_id', v_batch_id, 'receipt_no', v_receipt_no, 'source', p_source,
      'tanggal', p_tglbyr, 'jumlah_komponen', v_count, 'total_nominal', v_total,
      'items', p_items));
  RETURN v_batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_create_payment_batch(text, text, text, date, jsonb, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_payment_batch_v1(
  p_username text,
  p_password text,
  p_nospp text,
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
  RETURN public.spp_app_create_payment_batch(v_actor, 'manual', p_nospp, p_tglbyr, p_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_payment_batches_v1(
  p_username text,
  p_password text,
  p_rows jsonb
)
RETURNS bigint[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row jsonb;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_nospp text;
  v_tglbyr date;
  v_batch_id bigint;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'File harus berisi 1 sampai 500 baris pembayaran.' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Baris impor tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_nospp := btrim(COALESCE(v_row->>'nospp', ''));
    BEGIN
      v_tglbyr := COALESCE(NULLIF(v_row->>'tglbyr', '')::date, current_date);
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Tanggal uang masuk pada file tidak valid.' USING ERRCODE = '22023';
    END;
    v_batch_id := public.spp_app_create_payment_batch(
      v_actor, 'upload', v_nospp, v_tglbyr, v_row->'items');
    v_ids := array_append(v_ids, v_batch_id);
  END LOOP;
  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_payment_components_v1(
  p_username text, p_password text, p_nospp text, p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_batch_id bigint;
  v_count integer;
BEGIN
  v_batch_id := public.spp_app_create_payment_batch(
    v_actor, 'manual', p_nospp, current_date, p_items);
  SELECT count(*)::integer INTO v_count
  FROM public.spp_app_payments WHERE batch_id = v_batch_id;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_payment_v1(
  p_username text, p_password text, p_nospp text, p_periode text, p_nominal numeric
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
BEGIN
  RETURN public.spp_app_create_payment_batch(
    v_actor, 'manual', p_nospp, current_date,
    jsonb_build_array(jsonb_build_object(
      'component', 'legacy', 'periode', COALESCE(p_periode, ''), 'nominal', p_nominal)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_payment_components_v1(
  p_username text, p_password text, p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ids bigint[];
  v_count integer;
BEGIN
  v_ids := public.import_payment_batches_v1(p_username, p_password, p_rows);
  SELECT count(*)::integer INTO v_count
  FROM public.spp_app_payments WHERE batch_id = ANY(v_ids);
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_bos_allocation_batch_v1(
  p_username text,
  p_password text,
  p_tglbyr date,
  p_items jsonb,
  p_notes text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_operator_code text;
  v_row jsonb;
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_nospp text;
  v_period text;
  v_amount numeric;
  v_batch_id bigint;
  v_receipt_no text;
  v_start integer;
BEGIN
  IF p_tglbyr IS NULL OR p_tglbyr > current_date THEN
    RAISE EXCEPTION 'Tanggal alokasi BOS tidak boleh kosong atau di masa depan.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 36 THEN
    RAISE EXCEPTION 'Isi 1 sampai 36 alokasi BOS.' USING ERRCODE = '22023';
  END IF;
  SELECT c.kode_operator INTO v_operator_code
  FROM public.spp_app_operator_codes c
  WHERE lower(c.idpemakai) = lower(v_actor);
  IF v_operator_code IS NULL THEN
    RAISE EXCEPTION 'Kode operator belum diatur. Minta Admin mengatur kode operator terlebih dahulu.' USING ERRCODE = '22023';
  END IF;

  v_receipt_no := 'BOS-' || to_char(current_date, 'YYYY') || '-'
    || lpad(nextval('public.spp_app_receipt_no_seq'::regclass)::text, 8, '0');
  INSERT INTO public.spp_app_payment_batches
    (receipt_no, source, tglbyr, idpemakai, operator_code, notes)
  VALUES
    (v_receipt_no, 'bos', p_tglbyr, v_actor, v_operator_code, left(btrim(COALESCE(p_notes, '')), 200))
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_nospp := btrim(COALESCE(v_row->>'nospp', ''));
    v_period := btrim(COALESCE(v_row->>'periode', ''));
    v_amount := NULLIF(v_row->>'nominal', '')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal BOS setiap periode harus lebih dari 0.' USING ERRCODE = '22023';
    END IF;
    IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
      RAISE EXCEPTION 'Periode SPP BOS harus berformat MMYYYY.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_enr
    FROM public.spp_app_enrollments
    WHERE nospp = v_nospp
    ORDER BY tahun_ajaran DESC
    LIMIT 1;
    IF v_enr.nospp IS NULL THEN
      RAISE EXCEPTION 'Siswa penerima BOS tidak ditemukan.' USING ERRCODE = '22023';
    END IF;
    v_start := split_part(v_enr.tahun_ajaran, '-', 1)::integer;
    IF to_date(v_period, 'MMYYYY') < make_date(v_start, 7, 1)
       OR to_date(v_period, 'MMYYYY') > make_date(v_start + 1, 6, 1) THEN
      RAISE EXCEPTION 'Periode BOS berada di luar tahun ajaran siswa.' USING ERRCODE = '22023';
    END IF;
    IF v_enr.periode_masuk IS NOT NULL
       AND to_date(v_period, 'MMYYYY') < to_date(v_enr.periode_masuk, 'MMYYYY') THEN
      RAISE EXCEPTION 'Periode BOS lebih awal dari periode masuk siswa.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.spp_app_payments
      (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component, tglbyr, batch_id)
    VALUES
      (v_enr.nospp, v_enr.id_siswa, v_enr.kdsek, v_period, v_amount,
        v_actor, 'spp', p_tglbyr, v_batch_id);
    INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
    VALUES (v_actor, 'bos_alokasi', v_enr.id_siswa, jsonb_build_object(
      'batch_id', v_batch_id, 'receipt_no', v_receipt_no, 'periode', v_period, 'nominal', v_amount));
  END LOOP;
  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_payment_batch_v1(
  p_username text,
  p_password text,
  p_batch_id bigint,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_operator_code text;
  v_batch public.spp_app_payment_batches%ROWTYPE;
  v_correction_no text;
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi (5 sampai 500 karakter).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_batch
  FROM public.spp_app_payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  IF v_batch.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Transaksi ini sudah dikoreksi.' USING ERRCODE = '22023';
  END IF;
  SELECT c.kode_operator INTO v_operator_code
  FROM public.spp_app_operator_codes c
  WHERE lower(c.idpemakai) = lower(v_actor);
  IF v_operator_code IS NULL THEN
    RAISE EXCEPTION 'Kode operator belum diatur. Minta Admin mengatur kode operator terlebih dahulu.' USING ERRCODE = '22023';
  END IF;

  v_correction_no := 'KOR-' || to_char(current_date, 'YYYY') || '-'
    || lpad(nextval('public.spp_app_correction_no_seq'::regclass)::text, 8, '0');
  UPDATE public.spp_app_payment_batches
  SET voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason),
      correction_no = v_correction_no, correction_created_at = now(),
      correction_operator_code = v_operator_code
  WHERE id = p_batch_id;

  INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
  SELECT v_actor, 'bayar_koreksi', p.id_siswa, jsonb_build_object(
    'batch_id', v_batch.id, 'receipt_no', v_batch.receipt_no,
    'correction_no', v_correction_no, 'reason', btrim(p_reason))
  FROM public.spp_app_payments p
  WHERE p.batch_id = p_batch_id
  GROUP BY p.id_siswa;
  RETURN v_correction_no;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_payment_operator_codes_v1(
  p_username text,
  p_password text
)
RETURNS TABLE (idpemakai text, jabatan text, role text, kode_operator text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  RETURN QUERY
  SELECT m.idpemakai, m.jabatan, m.role, c.kode_operator, c.updated_at
  FROM public.mastusr m
  LEFT JOIN public.spp_app_operator_codes c ON lower(c.idpemakai) = lower(m.idpemakai)
  ORDER BY lower(m.idpemakai);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_payment_operator_code_v1(
  p_username text,
  p_password text,
  p_idpemakai text,
  p_kode_operator text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_code text := upper(btrim(COALESCE(p_kode_operator, '')));
BEGIN
  IF v_code !~ '^[A-Z0-9-]{2,20}$' THEN
    RAISE EXCEPTION 'Kode operator harus 2 sampai 20 karakter: huruf, angka, atau tanda hubung.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mastusr m
    WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_idpemakai, '')))
  ) THEN
    RAISE EXCEPTION 'Akun operator tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.spp_app_operator_codes (idpemakai, kode_operator, updated_at, updated_by)
  VALUES (btrim(p_idpemakai), v_code, now(), v_actor)
  ON CONFLICT (idpemakai) DO UPDATE
    SET kode_operator = EXCLUDED.kode_operator, updated_at = now(), updated_by = v_actor;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Kode operator sudah dipakai akun lain.' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_daily_payment_summary_v1(
  p_username text,
  p_password text,
  p_tanggal date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_manual numeric := 0;
  v_upload numeric := 0;
  v_bos numeric := 0;
  v_legacy numeric := 0;
  v_manual_count bigint := 0;
  v_upload_count bigint := 0;
  v_bos_count bigint := 0;
  v_legacy_count bigint := 0;
BEGIN
  SELECT lower(COALESCE(m.role, 'unit')) INTO v_role
  FROM public.mastusr m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND btrim(COALESCE(m.password, '')) = btrim(COALESCE(p_password, ''));
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses rekap pembayaran ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tanggal IS NULL THEN
    RAISE EXCEPTION 'Tanggal rekap wajib diisi.' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(sum(x.total) FILTER (WHERE x.source = 'manual'), 0),
    COALESCE(sum(x.total) FILTER (WHERE x.source = 'upload'), 0),
    COALESCE(sum(x.bos_total), 0),
    COALESCE(sum(x.total) FILTER (WHERE x.source = 'legacy'), 0),
    count(*) FILTER (WHERE x.source = 'manual'),
    count(*) FILTER (WHERE x.source = 'upload'),
    count(*) FILTER (WHERE x.source = 'bos' OR x.bos_total > 0),
    count(*) FILTER (WHERE x.source = 'legacy')
  INTO v_manual, v_upload, v_bos, v_legacy,
    v_manual_count, v_upload_count, v_bos_count, v_legacy_count
  FROM (
    SELECT b.id, b.source, COALESCE(sum(p.nominal), 0) AS total,
      COALESCE(sum(p.nominal) FILTER (WHERE b.source = 'bos' OR p.component = 'spp_bos'), 0) AS bos_total
    FROM public.spp_app_payment_batches b
    LEFT JOIN public.spp_app_payments p ON p.batch_id = b.id
    WHERE b.tglbyr = p_tanggal AND b.voided_at IS NULL
    GROUP BY b.id, b.source
  ) x;

  RETURN jsonb_build_object(
    'tanggal', p_tanggal,
    'manual', v_manual,
    'manual_transaksi', v_manual_count,
    'upload', v_upload,
    'upload_transaksi', v_upload_count,
    'bos', v_bos,
    'bos_transaksi', v_bos_count,
    'legacy', v_legacy,
    'legacy_transaksi', v_legacy_count,
    'net_orang_tua', v_manual + v_upload + v_legacy - v_bos
  );
END;
$function$;

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
  e.dpp, e.dsp, e.seragam, e.periode_masuk
FROM public.spp_app_enrollments e
JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa;

CREATE OR REPLACE FUNCTION public.spp_app_student_billing_v1(
  p_id_siswa text,
  p_tahun text,
  p_periode text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_enr public.spp_app_enrollments%ROWTYPE;
  v_student public.spp_app_students%ROWTYPE;
  v_start_year integer;
  v_start_date date;
  v_active_date date;
  v_month date;
  v_period text;
  v_spp_target numeric;
  v_komp_target numeric;
  v_spp_paid numeric;
  v_komp_paid numeric;
  v_spp_credit numeric := 0;
  v_komp_credit numeric := 0;
  v_spp_credit_in numeric;
  v_komp_credit_in numeric;
  v_spp_remaining numeric;
  v_komp_remaining numeric;
  v_spp_total_remaining numeric := 0;
  v_komp_total_remaining numeric := 0;
  v_periods jsonb := '[]'::jsonb;
  v_components jsonb := '{}'::jsonb;
  v_component_row record;
  v_component_paid numeric;
  v_component_remaining numeric;
  v_one_time_total numeric := 0;
  v_unallocated numeric := 0;
  v_unallocated_count bigint := 0;
  v_last_paid date;
BEGIN
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$'
     OR p_periode IS NULL OR p_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran atau periode tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start_year := split_part(p_tahun, '-', 1)::integer;
  v_active_date := to_date(p_periode, 'MMYYYY');
  IF v_active_date < make_date(v_start_year, 7, 1)
     OR v_active_date > make_date(v_start_year + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode harus berada di tahun ajaran yang dipilih.' USING ERRCODE = '22023';
  END IF;
  IF v_active_date > date_trunc('month', current_date)::date THEN
    RAISE EXCEPTION 'Periode mendatang belum dapat dihitung sebagai tunggakan.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enr
  FROM public.spp_app_enrollments
  WHERE id_siswa = p_id_siswa AND tahun_ajaran = p_tahun;
  IF v_enr.id_siswa IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_student FROM public.spp_app_students WHERE id_siswa = p_id_siswa;

  v_start_date := make_date(v_start_year, 7, 1);
  IF v_enr.periode_masuk IS NOT NULL THEN
    v_start_date := greatest(v_start_date, to_date(v_enr.periode_masuk, 'MMYYYY'));
  END IF;
  IF v_start_date <= v_active_date THEN
    FOR v_month IN
      SELECT generate_series(date_trunc('month', v_start_date)::date,
        date_trunc('month', v_active_date)::date, interval '1 month')::date
    LOOP
      v_period := to_char(v_month, 'MMYYYY');
      SELECT COALESCE(rate.spp, v_enr.spp), COALESCE(rate.komp, v_enr.komp)
      INTO v_spp_target, v_komp_target
      FROM (SELECT 1) AS seed
      LEFT JOIN LATERAL (
        SELECT h.spp, h.komp
        FROM public.spp_app_spp_history h
        WHERE h.id_siswa = p_id_siswa AND h.tahun_ajaran = p_tahun
          AND h.effective_date <= v_month
        ORDER BY h.effective_date DESC LIMIT 1
      ) AS rate ON true;

      SELECT COALESCE(sum(p.nominal), 0) INTO v_spp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.nospp = v_enr.nospp AND p.component IN ('spp', 'spp_bos')
        AND p.periode = v_period AND b.voided_at IS NULL;
      SELECT COALESCE(sum(p.nominal), 0) INTO v_komp_paid
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE p.nospp = v_enr.nospp AND p.component = 'komp'
        AND p.periode = v_period AND b.voided_at IS NULL;

      v_spp_credit_in := v_spp_credit;
      v_komp_credit_in := v_komp_credit;
      v_spp_remaining := greatest(v_spp_target - v_spp_paid - v_spp_credit_in, 0);
      v_komp_remaining := greatest(v_komp_target - v_komp_paid - v_komp_credit_in, 0);
      v_spp_credit := greatest(v_spp_paid + v_spp_credit_in - v_spp_target, 0);
      v_komp_credit := greatest(v_komp_paid + v_komp_credit_in - v_komp_target, 0);
      v_spp_total_remaining := v_spp_total_remaining + v_spp_remaining;
      v_komp_total_remaining := v_komp_total_remaining + v_komp_remaining;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object(
        'periode', v_period,
        'spp', jsonb_build_object(
          'tagihan', v_spp_target, 'dibayar', v_spp_paid, 'saldo_dibawa', v_spp_credit_in,
          'sisa', v_spp_remaining,
          'status', CASE WHEN v_spp_target = 0 THEN '-'
            WHEN v_spp_remaining = 0 THEN 'Lunas'
            WHEN v_spp_paid + v_spp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END),
        'komp', jsonb_build_object(
          'tagihan', v_komp_target, 'dibayar', v_komp_paid, 'saldo_dibawa', v_komp_credit_in,
          'sisa', v_komp_remaining,
          'status', CASE WHEN v_komp_target = 0 THEN '-'
            WHEN v_komp_remaining = 0 THEN 'Lunas'
            WHEN v_komp_paid + v_komp_credit_in > 0 THEN 'Cicilan' ELSE 'Belum bayar' END)));
    END LOOP;
  END IF;

  FOR v_component_row IN
    SELECT 'dpp'::text AS component, v_enr.dpp AS target
    UNION ALL SELECT 'dpp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dpp' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'dsp', v_enr.dsp + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'dsp'), 0)
    UNION ALL SELECT 'seragam', v_enr.seragam + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'seragam'), 0)
    UNION ALL SELECT 'giat', v_enr.giat + COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'kegiatan'), 0)
    UNION ALL SELECT 'spp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'spp' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'komp_tl', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'komputer' AND a.tahun_ajaran < p_tahun), 0)
    UNION ALL SELECT 'lainnya', COALESCE((SELECT sum(a.nominal) FROM public.spp_app_arrears a
      WHERE a.id_siswa = p_id_siswa AND a.jenis = 'lainnya'), 0)
  LOOP
    SELECT COALESCE(sum(p.nominal), 0) INTO v_component_paid
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.nospp = v_enr.nospp AND p.component = v_component_row.component
      AND b.voided_at IS NULL;
    v_component_remaining := greatest(v_component_row.target - v_component_paid, 0);
    v_one_time_total := v_one_time_total + v_component_remaining;
    v_components := v_components || jsonb_build_object(v_component_row.component, jsonb_build_object(
      'tagihan', v_component_row.target, 'dibayar', v_component_paid, 'sisa', v_component_remaining,
      'status', CASE WHEN v_component_row.target = 0 THEN '-'
        WHEN v_component_remaining = 0 THEN 'Lunas'
        WHEN v_component_paid > 0 THEN 'Cicilan' ELSE 'Belum bayar' END));
  END LOOP;

  SELECT COALESCE(sum(p.nominal), 0), count(*)
  INTO v_unallocated, v_unallocated_count
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.nospp = v_enr.nospp AND p.component = 'legacy' AND b.voided_at IS NULL;
  SELECT max(p.tglbyr) INTO v_last_paid
  FROM public.spp_app_payments p
  JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
  WHERE p.nospp = v_enr.nospp AND b.voided_at IS NULL;

  RETURN jsonb_build_object(
    'id_siswa', v_enr.id_siswa, 'tahun_ajaran', v_enr.tahun_ajaran,
    'kdsek', v_enr.kdsek, 'kdkls', v_enr.kdkls, 'nospp', v_enr.nospp,
    'nama', v_student.nama, 'no_wa', v_student.no_wa, 'periode_aktif', p_periode,
    'periode_bulanan', v_periods, 'komponen_satu_kali', v_components,
    'sisa_spp', v_spp_total_remaining, 'sisa_komp', v_komp_total_remaining,
    'sisa_satu_kali', v_one_time_total,
    'sisa_total', v_spp_total_remaining + v_komp_total_remaining + v_one_time_total,
    'belum_dialokasikan', v_unallocated, 'jumlah_belum_dialokasikan', v_unallocated_count,
    'terakhir_bayar', v_last_paid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_revenue_by_unit_v1(
  p_username text, p_password text, p_tahun text
)
RETURNS TABLE (kdsek text, bulan date, pemasukan numeric, transaksi bigint)
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
    AND btrim(COALESCE(m.password, '')) = btrim(COALESCE(p_password, ''));
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses laporan pemasukan ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(p_tahun, '-', 1)::integer;
  RETURN QUERY
  SELECT b.kdsek, date_trunc('month', b.tglbyr)::date,
    COALESCE(sum(p.nominal) FILTER (WHERE p.component <> 'spp_bos'), 0),
    count(DISTINCT b.id) FILTER (WHERE p.component <> 'spp_bos')
  FROM public.spp_app_payment_batches b
  JOIN public.spp_app_payments p ON p.batch_id = b.id
  WHERE b.tglbyr >= make_date(v_start, 7, 1)
    AND b.tglbyr < make_date(v_start + 1, 7, 1)
    AND b.voided_at IS NULL AND b.source <> 'bos' AND b.kdsek IS NOT NULL
  GROUP BY b.kdsek, date_trunc('month', b.tglbyr)::date
  ORDER BY date_trunc('month', b.tglbyr)::date, b.kdsek;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_prior_year_revenue_v1(
  p_username text, p_password text, p_tahun text
)
RETURNS TABLE (
  kdsek text, dpp_tagihan numeric, dpp_terbayar numeric,
  spp_tl_tagihan numeric, spp_tl_terbayar numeric
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
    AND btrim(COALESCE(m.password, '')) = btrim(COALESCE(p_password, ''));
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
      sum(a.nominal) FILTER (WHERE a.jenis = 'spp') AS spp
    FROM public.spp_app_arrears a
    WHERE a.tahun_ajaran < p_tahun
    GROUP BY a.id_siswa
  ),
  paid AS (
    SELECT b.kdsek,
      sum(p.nominal) FILTER (WHERE p.component = 'dpp_tl') AS dpp,
      sum(p.nominal) FILTER (WHERE p.component = 'spp_tl') AS spp
    FROM public.spp_app_payment_batches b
    JOIN public.spp_app_payments p ON p.batch_id = b.id
    WHERE b.tglbyr >= make_date(v_start, 7, 1)
      AND b.tglbyr < make_date(v_start + 1, 7, 1)
      AND b.voided_at IS NULL AND b.source <> 'bos'
    GROUP BY b.kdsek
  ),
  due AS (
    SELECT e.kdsek, sum(COALESCE(h.dpp, 0)) AS dpp, sum(COALESCE(h.spp, 0)) AS spp
    FROM public.spp_app_enrollments e
    JOIN historical_due h ON h.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun
    GROUP BY e.kdsek
  )
  SELECT COALESCE(d.kdsek, paid.kdsek),
    COALESCE(d.dpp, 0), COALESCE(paid.dpp, 0),
    COALESCE(d.spp, 0), COALESCE(paid.spp, 0)
  FROM due d FULL JOIN paid ON paid.kdsek = d.kdsek
  WHERE COALESCE(d.dpp, 0) > 0 OR COALESCE(d.spp, 0) > 0
     OR COALESCE(paid.dpp, 0) > 0 OR COALESCE(paid.spp, 0) > 0
  ORDER BY 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_dashboard_v1(
  p_tahun text DEFAULT NULL,
  p_kdsek text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'siswa', (SELECT count(*) FROM public.spp_app_enrollments e
      WHERE (p_tahun IS NULL OR e.tahun_ajaran = p_tahun)
        AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)),
    'tagihan', COALESCE((SELECT sum(o.spp + o.komp + o.dpp + o.dsp + o.giat + o.seragam + o.arrears_total)
      FROM public.spp_app_student_overview o
      WHERE (p_tahun IS NULL OR o.tahun_ajaran = p_tahun)
        AND (p_kdsek IS NULL OR o.kdsek = p_kdsek)
        AND NOT (o.is_staff_child AND NOT o.show_in_billing)), 0),
    'bulan_ini', COALESCE((SELECT sum(p.nominal)
      FROM public.spp_app_payments p
      JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
      WHERE b.tglbyr >= date_trunc('month', current_date)::date
        AND b.voided_at IS NULL AND b.source <> 'bos'
        AND p.component <> 'spp_bos'
        AND (p_kdsek IS NULL OR p.kdsek = p_kdsek)), 0),
    'transaksi', (SELECT count(DISTINCT b.id)
      FROM public.spp_app_payment_batches b
      JOIN public.spp_app_payments p ON p.batch_id = b.id
      WHERE b.voided_at IS NULL AND b.source <> 'bos'
        AND p.component <> 'spp_bos'
        AND (p_kdsek IS NULL OR b.kdsek = p_kdsek)),
    'terbaru', COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT nospp, nama, tglbyr, parent_nominal AS nominal
      FROM public.spp_app_payment_batch_list
      WHERE voided_at IS NULL AND source <> 'bos'
        AND parent_nominal > 0
        AND (p_kdsek IS NULL OR kdsek = p_kdsek)
      ORDER BY tglbyr DESC, id DESC LIMIT 5) r), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_report_v1(
  p_tahun text DEFAULT NULL,
  p_kdsek text DEFAULT NULL
)
RETURNS TABLE (kdsek text, jumlah bigint, tagihan numeric, terbayar numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT o.kdsek, count(*),
    sum(CASE WHEN o.is_staff_child AND NOT o.show_in_billing THEN 0
      ELSE o.spp + o.komp + o.dpp + o.dsp + o.giat + o.seragam + o.arrears_total END),
    sum(o.paid_total)
  FROM public.spp_app_student_overview o
  WHERE (p_tahun IS NULL OR o.tahun_ajaran = p_tahun)
    AND (p_kdsek IS NULL OR o.kdsek = p_kdsek)
  GROUP BY o.kdsek;
$function$;

CREATE OR REPLACE FUNCTION public.delete_payment_v1(
  p_username text, p_password text, p_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  RAISE EXCEPTION 'Pembayaran tidak dapat dihapus permanen. Gunakan koreksi dengan alasan.' USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION public.add_payment_v1(text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_payment_components_v1(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_payment_v1(text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_payment_batch_v1(text, text, text, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_payment_batches_v1(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_bos_allocation_batch_v1(text, text, date, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_payment_batch_v1(text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payment_operator_codes_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_payment_operator_code_v1(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_daily_payment_summary_v1(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_student_billing_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_revenue_by_unit_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_prior_year_revenue_v1(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_payment_v1(text, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_payment_components_v1(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_payment_components_v1(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_payment_batch_v1(text, text, text, date, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_payment_batches_v1(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_bos_allocation_batch_v1(text, text, date, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_payment_batch_v1(text, text, bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_operator_codes_v1(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_payment_operator_code_v1(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_daily_payment_summary_v1(text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_student_billing_v1(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_revenue_by_unit_v1(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_prior_year_revenue_v1(text, text, text) TO anon, authenticated;

COMMIT;
