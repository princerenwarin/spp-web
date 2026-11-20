BEGIN;

ALTER TABLE public.spp_app_payment_batches
  DROP CONSTRAINT IF EXISTS spp_app_payment_batches_payment_method_check;
ALTER TABLE public.spp_app_payment_batches
  ADD CONSTRAINT spp_app_payment_batches_payment_method_check
  CHECK (payment_method IN ('cash', 'edc', 'qris', 'transfer'));

CREATE INDEX IF NOT EXISTS spp_app_payment_batches_open_settlement_date_idx
  ON public.spp_app_payment_batches (tglbyr, payment_method)
  WHERE voided_at IS NULL AND settlement_status IN ('pending', 'matched');

CREATE INDEX IF NOT EXISTS spp_app_payment_batches_transfer_date_idx
  ON public.spp_app_payment_batches (tglbyr, payment_method)
  WHERE payment_method = 'transfer' AND voided_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_payment_batches_transfer_ref_unique_idx
  ON public.spp_app_payment_batches (lower(settlement_reference))
  WHERE payment_method = 'transfer' AND settlement_reference <> '' AND voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.process_payment_reconciliation_v1(
  p_username text,
  p_password text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_row jsonb;
  v_batch public.spp_app_payment_batches%ROWTYPE;
  v_action text;
  v_batch_id bigint;
  v_transfer_ids bigint[] := ARRAY[]::bigint[];
  v_seen_batch_ids bigint[] := ARRAY[]::bigint[];
  v_method text;
  v_reference text;
  v_nospp text;
  v_tglbyr date;
  v_settlement_date date;
  v_amount numeric;
  v_items jsonb;
  v_item_count integer;
  v_total numeric;
  v_settled integer := 0;
  v_matched integer := 0;
  v_transfer_pending integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 500 baris untuk diproses.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Baris rekonsiliasi tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_action := lower(btrim(COALESCE(v_row->>'action', '')));
    v_reference := left(btrim(COALESCE(v_row->>'settlement_reference', '')), 100);
    IF v_reference = '' THEN
      RAISE EXCEPTION 'Referensi transaksi wajib diisi.' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(btrim(COALESCE(v_row->>'tglbyr', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Tanggal pembayaran wajib diisi.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_tglbyr := btrim(v_row->>'tglbyr')::date;
    EXCEPTION
      WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Tanggal pembayaran tidak valid.' USING ERRCODE = '22023';
    END;
    IF v_tglbyr > current_date THEN
      RAISE EXCEPTION 'Tanggal pembayaran tidak boleh di masa depan.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_amount := NULLIF(btrim(COALESCE(v_row->>'nominal', '')), '')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Nominal transaksi tidak valid.' USING ERRCODE = '22023';
    END;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal transaksi harus lebih dari 0.' USING ERRCODE = '22023';
    END IF;

    v_settlement_date := NULL;
    IF NULLIF(btrim(COALESCE(v_row->>'tanggal_settlement', '')), '') IS NOT NULL THEN
      BEGIN
        v_settlement_date := btrim(v_row->>'tanggal_settlement')::date;
      EXCEPTION
        WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
          RAISE EXCEPTION 'Tanggal settlement tidak valid.' USING ERRCODE = '22023';
      END;
      IF v_settlement_date < v_tglbyr OR v_settlement_date > current_date THEN
        RAISE EXCEPTION 'Tanggal settlement harus pada atau setelah tanggal pembayaran dan tidak boleh di masa depan.' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_action = 'settle' THEN
      BEGIN
        v_batch_id := NULLIF(btrim(COALESCE(v_row->>'batch_id', '')), '')::bigint;
      EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'Transaksi yang dipilih tidak valid.' USING ERRCODE = '22023';
      END;
      IF v_batch_id IS NULL THEN
        RAISE EXCEPTION 'Pilih transaksi yang akan dicocokkan.' USING ERRCODE = '22023';
      END IF;
      IF v_batch_id = ANY(v_seen_batch_ids) THEN
        RAISE EXCEPTION 'Satu transaksi tidak dapat dicocokkan lebih dari sekali dalam satu file.' USING ERRCODE = '22023';
      END IF;
      v_seen_batch_ids := array_append(v_seen_batch_ids, v_batch_id);

      SELECT * INTO v_batch
      FROM public.spp_app_payment_batches b
      WHERE b.id = v_batch_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi yang dipilih tidak ditemukan.' USING ERRCODE = '22023';
      END IF;
      IF v_batch.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'Transaksi yang dibatalkan tidak dapat direkonsiliasi.' USING ERRCODE = '22023';
      END IF;

      v_method := lower(btrim(COALESCE(v_row->>'payment_method', '')));
      IF v_method NOT IN ('edc', 'qris', 'transfer')
         OR v_batch.payment_method <> v_method
         OR v_batch.settlement_status NOT IN ('pending', 'matched')
         OR lower(btrim(v_batch.settlement_reference)) <> lower(v_reference)
         OR v_batch.tglbyr <> v_tglbyr
         OR (NULLIF(btrim(COALESCE(v_row->>'nospp', '')), '') IS NOT NULL
             AND lower(v_batch.nospp) <> lower(btrim(v_row->>'nospp'))) THEN
        RAISE EXCEPTION 'Metode, referensi, tanggal, atau siswa tidak lagi cocok dengan transaksi.' USING ERRCODE = '22023';
      END IF;

      SELECT count(*)::integer, COALESCE(sum(p.nominal), 0)
      INTO v_item_count, v_total
      FROM public.spp_app_payments p
      WHERE p.batch_id = v_batch_id;
      IF v_item_count = 0 OR v_total <> v_amount THEN
        RAISE EXCEPTION 'Nominal file settlement tidak sama dengan total transaksi.' USING ERRCODE = '22023';
      END IF;

      UPDATE public.spp_app_payment_batches
      SET settlement_status = CASE WHEN v_settlement_date IS NULL THEN 'matched' ELSE 'settled' END,
          settled_at = CASE
            WHEN v_settlement_date IS NULL THEN NULL
            ELSE v_settlement_date::timestamp AT TIME ZONE 'Asia/Jakarta'
          END
      WHERE id = v_batch_id;

      IF v_settlement_date IS NULL THEN
        v_matched := v_matched + 1;
      ELSE
        v_settled := v_settled + 1;
      END IF;
    ELSIF v_action = 'create_transfer' THEN
      v_nospp := btrim(COALESCE(v_row->>'nospp', ''));
      IF v_nospp = '' THEN
        RAISE EXCEPTION 'Pilih siswa sebelum menyimpan transfer.' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.spp_app_payment_batches b
        WHERE b.payment_method = 'transfer'
          AND lower(b.settlement_reference) = lower(v_reference)
          AND b.voided_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Referensi transfer ini sudah tercatat. Muat ulang daftar transaksi sebelum mencoba lagi.' USING ERRCODE = '22023';
      END IF;

      v_items := v_row->'items';
      IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array'
         OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 36 THEN
        RAISE EXCEPTION 'Alokasi transfer harus berisi 1 sampai 36 komponen.' USING ERRCODE = '22023';
      END IF;
      BEGIN
        SELECT count(*)::integer, COALESCE(sum((item->>'nominal')::numeric), 0)
        INTO v_item_count, v_total
        FROM jsonb_array_elements(v_items) AS entries(item);
      EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'Nominal alokasi transfer tidak valid.' USING ERRCODE = '22023';
      END;
      IF v_item_count = 0 OR v_total <> v_amount THEN
        RAISE EXCEPTION 'Total alokasi harus sama dengan nominal transfer.' USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_batch_id := public.spp_app_create_payment_batch(
          v_actor,
          'upload',
          v_nospp,
          v_tglbyr,
          v_items,
          left(COALESCE(NULLIF(btrim(v_row->>'notes'), ''), 'Impor transfer') || ' · ' || v_reference, 200)
        );
        UPDATE public.spp_app_payment_batches
        SET payment_method = 'transfer',
            settlement_reference = v_reference,
            settlement_status = CASE WHEN v_settlement_date IS NULL THEN 'pending' ELSE 'settled' END,
            settled_at = CASE
              WHEN v_settlement_date IS NULL THEN NULL
              ELSE v_settlement_date::timestamp AT TIME ZONE 'Asia/Jakarta'
            END
        WHERE id = v_batch_id;
      EXCEPTION
        WHEN unique_violation THEN
          IF EXISTS (
            SELECT 1 FROM public.spp_app_payment_batches b
            WHERE b.payment_method = 'transfer'
              AND lower(b.settlement_reference) = lower(v_reference)
              AND b.voided_at IS NULL
          ) THEN
            RAISE EXCEPTION 'Referensi transfer ini sudah tercatat. Muat ulang daftar transaksi sebelum mencoba lagi.' USING ERRCODE = '22023';
          END IF;
          RAISE;
      END;
      v_transfer_ids := array_append(v_transfer_ids, v_batch_id);
      IF v_settlement_date IS NULL THEN
        v_transfer_pending := v_transfer_pending + 1;
      ELSE
        v_settled := v_settled + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'Jenis tindakan rekonsiliasi tidak valid.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'matched', v_matched,
    'transfer_pending', v_transfer_pending,
    'transfer_ids', to_jsonb(v_transfer_ids)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_payment_reconciliation_v1(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_payment_reconciliation_v1(text, text, jsonb) TO anon, authenticated;

COMMIT;
