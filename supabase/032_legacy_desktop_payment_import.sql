-- Import historical payment rows exported by the desktop application.
-- Run after 031_payment_settlement_reconciliation.sql.
BEGIN;

ALTER TABLE public.spp_app_payment_batches
  ADD COLUMN IF NOT EXISTS import_key text;

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_payment_batches_import_key_idx
  ON public.spp_app_payment_batches (import_key)
  WHERE import_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_legacy_payment_batches_v1(
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
  v_operator_code text;
  v_row jsonb;
  v_item jsonb;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_enrollment public.spp_app_enrollments%ROWTYPE;
  v_batch_id bigint;
  v_existing_id bigint;
  v_receipt_no text;
  v_import_key text;
  v_student_id text;
  v_year text;
  v_tglbyr date;
  v_cash numeric;
  v_spp_gross numeric;
  v_bos_total numeric;
  v_parent_total numeric;
  v_amount numeric;
  v_component text;
  v_period text;
  v_notes text;
  v_item_count integer;
  v_start integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'File harus berisi 1 sampai 500 baris pembayaran.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Baris impor desktop tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_import_key := btrim(COALESCE(v_row->>'source_key', ''));
    IF v_import_key = '' OR length(v_import_key) > 200 THEN
      RAISE EXCEPTION 'Kunci baris impor tidak valid.' USING ERRCODE = '22023';
    END IF;

    SELECT batch.id INTO v_existing_id
    FROM public.spp_app_payment_batches batch
    WHERE batch.import_key = v_import_key;
    IF v_existing_id IS NOT NULL THEN
      v_ids := array_append(v_ids, v_existing_id);
      CONTINUE;
    END IF;

    v_student_id := btrim(COALESCE(v_row->>'id_siswa', ''));
    v_year := btrim(COALESCE(v_row->>'tahun_ajaran', ''));
    IF v_student_id = '' OR v_year !~ '^[0-9]{4}-[0-9]{4}$'
       OR split_part(v_year, '-', 2)::integer <> split_part(v_year, '-', 1)::integer + 1 THEN
      RAISE EXCEPTION 'Siswa atau tahun ajaran transaksi desktop tidak valid.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_tglbyr := NULLIF(v_row->>'tglbyr', '')::date;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Tanggal pembayaran desktop tidak valid.' USING ERRCODE = '22023';
    END;
    IF v_tglbyr IS NULL OR v_tglbyr > current_date THEN
      RAISE EXCEPTION 'Tanggal pembayaran tidak boleh kosong atau di masa depan.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_cash := NULLIF(v_row->>'kas', '')::numeric;
      v_spp_gross := NULLIF(v_row->>'spp_gross', '')::numeric;
      v_bos_total := NULLIF(v_row->>'bos', '')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Nominal Kas, SPP, atau BOS pada file desktop tidak valid.' USING ERRCODE = '22023';
    END;
    IF v_cash IS NULL OR v_cash < 0 OR v_cash <> trunc(v_cash)
       OR v_spp_gross IS NULL OR v_spp_gross < 0 OR v_spp_gross <> trunc(v_spp_gross)
       OR v_bos_total IS NULL OR v_bos_total < 0 OR v_bos_total <> trunc(v_bos_total)
       OR v_bos_total > v_spp_gross THEN
      RAISE EXCEPTION 'Nominal Kas, SPP, atau BOS harus berupa rupiah bulat yang valid.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_row->'items') <> 'array'
       OR jsonb_array_length(v_row->'items') NOT BETWEEN 1 AND 36 THEN
      RAISE EXCEPTION 'Rincian pembayaran desktop harus berisi 1 sampai 36 komponen.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_enrollment
    FROM public.spp_app_enrollments
    WHERE id_siswa = v_student_id AND tahun_ajaran = v_year
    FOR UPDATE;
    IF v_enrollment.id_siswa IS NULL OR v_enrollment.nospp IS NULL THEN
      RAISE EXCEPTION 'Siswa belum terdaftar pada tahun ajaran transaksi desktop.' USING ERRCODE = '22023';
    END IF;

    SELECT codes.kode_operator INTO v_operator_code
    FROM public.spp_app_operator_codes codes
    WHERE lower(codes.idpemakai) = lower(v_actor);
    IF v_operator_code IS NULL THEN
      RAISE EXCEPTION 'Kode operator belum diatur. Minta Admin mengatur kode operator terlebih dahulu.' USING ERRCODE = '22023';
    END IF;

    v_item_count := 0;
    v_parent_total := 0;
    v_bos_total := 0;
    v_spp_gross := COALESCE(v_spp_gross, 0);
    v_start := split_part(v_year, '-', 1)::integer;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_row->'items')
    LOOP
      v_component := lower(btrim(COALESCE(v_item->>'component', '')));
      v_period := btrim(COALESCE(v_item->>'periode', ''));
      BEGIN
        v_amount := NULLIF(v_item->>'nominal', '')::numeric;
      EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'Nominal komponen pada file desktop tidak valid.' USING ERRCODE = '22023';
      END;
      IF v_component NOT IN (
        'spp', 'spp_bos', 'komp', 'giat', 'dpp', 'dpp_tl', 'dsp', 'seragam',
        'spp_tl', 'komp_tl', 'lainnya'
      ) OR v_amount IS NULL OR v_amount <= 0 OR v_amount <> trunc(v_amount) THEN
        RAISE EXCEPTION 'Komponen atau nominal pada file desktop tidak valid.' USING ERRCODE = '22023';
      END IF;
      IF v_component IN ('spp', 'spp_bos', 'komp') THEN
        IF v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$'
           OR to_date(v_period, 'MMYYYY') NOT BETWEEN make_date(v_start, 7, 1)
             AND make_date(v_start + 1, 6, 1) THEN
          RAISE EXCEPTION 'Periode SPP/BOS/Komputer tidak sesuai tahun ajaran transaksi.' USING ERRCODE = '22023';
        END IF;
        IF v_enrollment.periode_masuk IS NOT NULL
           AND to_date(v_period, 'MMYYYY') < to_date(v_enrollment.periode_masuk, 'MMYYYY') THEN
          RAISE EXCEPTION 'Periode pembayaran lebih awal dari periode masuk siswa.' USING ERRCODE = '22023';
        END IF;
      ELSE
        v_period := '';
      END IF;

      v_item_count := v_item_count + 1;
      IF v_component = 'spp_bos' THEN
        v_bos_total := v_bos_total + v_amount;
      ELSE
        v_parent_total := v_parent_total + v_amount;
      END IF;
    END LOOP;

    IF v_item_count < 1 OR v_parent_total <> v_cash THEN
      RAISE EXCEPTION 'Kas pada file tidak sama dengan total pembayaran wali.' USING ERRCODE = '22023';
    END IF;
    IF v_bos_total <> COALESCE(NULLIF(v_row->>'bos', '')::numeric, 0)
       OR v_spp_gross <> (
         SELECT COALESCE(sum((item.value->>'nominal')::numeric), 0)
         FROM jsonb_array_elements(v_row->'items') AS item(value)
         WHERE item.value->>'component' IN ('spp', 'spp_bos')
       ) THEN
      RAISE EXCEPTION 'Rincian SPP/BOS tidak sesuai nilai pada file desktop.' USING ERRCODE = '22023';
    END IF;

    v_notes := left(btrim(COALESCE(v_row->>'notes', '')), 200);
    v_receipt_no := 'SPP-' || to_char(current_date, 'YYYY') || '-'
      || lpad(nextval('public.spp_app_receipt_no_seq'::regclass)::text, 8, '0');

    BEGIN
      INSERT INTO public.spp_app_payment_batches
        (receipt_no, nospp, id_siswa, kdsek, source, tglbyr, idpemakai,
         operator_code, notes, tahun_ajaran, import_key)
      VALUES
        (v_receipt_no, v_enrollment.nospp, v_enrollment.id_siswa, v_enrollment.kdsek,
         'upload', v_tglbyr, v_actor, v_operator_code, v_notes, v_year, v_import_key)
      RETURNING id INTO v_batch_id;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_row->'items')
      LOOP
        v_component := lower(btrim(COALESCE(v_item->>'component', '')));
        v_period := btrim(COALESCE(v_item->>'periode', ''));
        v_amount := (v_item->>'nominal')::numeric;
        IF v_component NOT IN ('spp', 'spp_bos', 'komp') THEN
          v_period := '';
        END IF;
        INSERT INTO public.spp_app_payments
          (nospp, id_siswa, kdsek, periode, nominal, idpemakai, component, tglbyr, batch_id)
        VALUES
          (v_enrollment.nospp, v_enrollment.id_siswa, v_enrollment.kdsek,
           v_period, v_amount, v_actor, v_component, v_tglbyr, v_batch_id);
      END LOOP;

      INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
      VALUES (v_actor, 'bayar_import', v_enrollment.id_siswa, jsonb_build_object(
        'batch_id', v_batch_id, 'receipt_no', v_receipt_no, 'source', 'upload',
        'source_key', v_import_key, 'tahun_ajaran', v_year, 'tanggal', v_tglbyr,
        'kas', v_cash, 'items', v_row->'items'));
    EXCEPTION
      WHEN unique_violation THEN
        SELECT batch.id INTO v_existing_id
        FROM public.spp_app_payment_batches batch
        WHERE batch.import_key = v_import_key;
        IF v_existing_id IS NULL THEN
          RAISE;
        END IF;
        v_batch_id := v_existing_id;
    END;

    v_ids := array_append(v_ids, v_batch_id);
  END LOOP;
  RETURN v_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_legacy_payment_batches_v1(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_payment_batches_v1(text, text, jsonb)
  TO anon, authenticated;

COMMIT;
