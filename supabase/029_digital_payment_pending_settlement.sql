-- Digital payments are saved immediately and wait for settlement matching.
BEGIN;

ALTER TABLE public.spp_app_payment_batches
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS settlement_reference text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spp_app_payment_batches_payment_method_check'
      AND conrelid = 'public.spp_app_payment_batches'::regclass
  ) THEN
    ALTER TABLE public.spp_app_payment_batches
      ADD CONSTRAINT spp_app_payment_batches_payment_method_check
      CHECK (payment_method IN ('cash', 'edc', 'qris'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spp_app_payment_batches_settlement_status_check'
      AND conrelid = 'public.spp_app_payment_batches'::regclass
  ) THEN
    ALTER TABLE public.spp_app_payment_batches
      ADD CONSTRAINT spp_app_payment_batches_settlement_status_check
      CHECK (settlement_status IN ('pending', 'matched', 'settled', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS spp_app_payment_batches_settlement_ref_idx
  ON public.spp_app_payment_batches (lower(settlement_reference))
  WHERE settlement_reference <> '';

CREATE INDEX IF NOT EXISTS spp_app_payment_batches_settlement_status_idx
  ON public.spp_app_payment_batches (settlement_status, created_at);

CREATE OR REPLACE FUNCTION public.save_payment_batch_v1(
  p_username text,
  p_password text,
  p_nospp text,
  p_tglbyr date,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_settlement_reference text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_method text := lower(btrim(COALESCE(p_payment_method, 'cash')));
  v_reference text := left(btrim(COALESCE(p_settlement_reference, '')), 100);
  v_batch_id bigint;
BEGIN
  IF v_method NOT IN ('cash', 'edc', 'qris') THEN
    RAISE EXCEPTION 'Metode pembayaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_method <> 'cash' AND v_reference = '' THEN
    RAISE EXCEPTION 'ID/referensi transaksi EDC/QRIS wajib diisi.' USING ERRCODE = '22023';
  END IF;

  v_batch_id := public.spp_app_create_payment_batch(
    v_actor, 'manual', p_nospp, p_tglbyr, p_items);

  UPDATE public.spp_app_payment_batches
  SET payment_method = v_method,
      settlement_status = CASE WHEN v_method = 'cash' THEN 'settled' ELSE 'pending' END,
      settlement_reference = CASE WHEN v_method = 'cash' THEN '' ELSE v_reference END,
      settled_at = CASE WHEN v_method = 'cash' THEN now() ELSE NULL END
  WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_payment_batch_v2(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_tahun_ajaran text,
  p_tglbyr date,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_settlement_reference text DEFAULT ''
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_method text := lower(btrim(COALESCE(p_payment_method, 'cash')));
  v_reference text := left(btrim(COALESCE(p_settlement_reference, '')), 100);
  v_batch_id bigint;
BEGIN
  IF v_method NOT IN ('cash', 'edc', 'qris') THEN
    RAISE EXCEPTION 'Metode pembayaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_method <> 'cash' AND v_reference = '' THEN
    RAISE EXCEPTION 'ID/referensi transaksi EDC/QRIS wajib diisi.' USING ERRCODE = '22023';
  END IF;

  v_batch_id := public.spp_app_create_payment_batch_v2(
    v_actor, p_id_siswa, p_tahun_ajaran, p_tglbyr, p_items);

  UPDATE public.spp_app_payment_batches
  SET payment_method = v_method,
      settlement_status = CASE WHEN v_method = 'cash' THEN 'settled' ELSE 'pending' END,
      settlement_reference = CASE WHEN v_method = 'cash' THEN '' ELSE v_reference END,
      settled_at = CASE WHEN v_method = 'cash' THEN now() ELSE NULL END
  WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_payment_batch_v1(text, text, text, date, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_payment_batch_v1(text, text, text, date, jsonb, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.save_payment_batch_v2(text, text, text, text, date, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_payment_batch_v2(text, text, text, text, date, jsonb, text, text) TO anon, authenticated;

CREATE OR REPLACE VIEW public.spp_app_payment_list AS
SELECT p.id, p.nospp, p.id_siswa, p.kdsek, p.periode, p.nominal, p.tglbyr,
  p.idpemakai, p.ket, s.nama, p.component,
  b.id AS batch_id, b.receipt_no, b.source, b.operator_code, b.created_at,
  b.voided_at, b.void_reason, b.correction_no, b.correction_created_at,
  b.correction_operator_code,
  b.payment_method, b.settlement_status, b.settlement_reference, b.settled_at
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
  COALESCE(sum(p.nominal) FILTER (WHERE b.source <> 'bos' AND p.component <> 'spp_bos'), 0) AS parent_nominal,
  b.tahun_ajaran,
  b.payment_method, b.settlement_status, b.settlement_reference, b.settled_at
FROM public.spp_app_payment_batches b
LEFT JOIN public.spp_app_payments p ON p.batch_id = b.id
LEFT JOIN public.spp_app_students s ON s.id_siswa = b.id_siswa
GROUP BY b.id, s.nama;

COMMIT;
