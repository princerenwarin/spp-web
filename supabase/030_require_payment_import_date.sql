-- Payment imports must use the date on the payment evidence, not the upload date.
BEGIN;

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
    IF NULLIF(btrim(COALESCE(v_row->>'tglbyr', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Tanggal pembayaran pada file wajib diisi.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_tglbyr := btrim(v_row->>'tglbyr')::date;
    EXCEPTION
      WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Tanggal pembayaran pada file tidak valid.' USING ERRCODE = '22023';
    END;

    v_batch_id := public.spp_app_create_payment_batch(
      v_actor, 'upload', v_nospp, v_tglbyr, v_row->'items');
    v_ids := array_append(v_ids, v_batch_id);
  END LOOP;
  RETURN v_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_payment_batches_v1(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_payment_batches_v1(text, text, jsonb) TO anon, authenticated;

COMMIT;
