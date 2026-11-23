-- Recognize punctuation variants in historical school names and retain old classes.
-- Run after 046_automatic_historical_desktop_import.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.import_legacy_payment_batches_v3(
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
  v_input jsonb := '[]'::jsonb;
  v_rows jsonb;
  v_row jsonb;
  v_school text;
  v_class text;
  v_school_code text;
  v_school_matches integer;
  v_class_matches integer;
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

    v_school := btrim(COALESCE(v_row->>'source_school', ''));
    v_class := btrim(COALESCE(v_row->>'source_class', ''));
    IF v_school <> '' THEN
      SELECT count(DISTINCT settings.school_code), min(settings.school_code)
      INTO v_school_matches, v_school_code
      FROM public.spp_app_school_settings settings
      WHERE regexp_replace(lower(btrim(settings.school_code)), '[^[:alnum:]]', '', 'g')
          = regexp_replace(lower(v_school), '[^[:alnum:]]', '', 'g')
        OR regexp_replace(lower(btrim(settings.school_name)), '[^[:alnum:]]', '', 'g')
          = regexp_replace(lower(v_school), '[^[:alnum:]]', '', 'g');
      IF v_school_matches <> 1 THEN
        RAISE EXCEPTION 'Sekolah "%" tidak ditemukan atau cocok ke lebih dari satu Pengaturan Sekolah (%).',
          v_school, COALESCE(NULLIF(btrim(v_row->>'source_location'), ''), 'baris impor')
          USING ERRCODE = '22023';
      END IF;

      IF v_class <> '' THEN
        IF char_length(v_class) > 100 THEN
          RAISE EXCEPTION 'Nama kelas historis maksimal 100 karakter (%).',
            COALESCE(NULLIF(btrim(v_row->>'source_location'), ''), 'baris impor')
            USING ERRCODE = '22023';
        END IF;
        SELECT count(*) INTO v_class_matches
        FROM public.spp_app_school_classes classes
        WHERE classes.school_code = v_school_code
          AND lower(btrim(classes.class_name)) = lower(v_class);
        IF v_class_matches = 0 THEN
          INSERT INTO public.spp_app_school_classes
            (school_code, class_name, is_active, updated_at)
          VALUES (v_school_code, v_class, false, now())
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      v_row := jsonb_set(v_row, '{source_school}', to_jsonb(v_school_code), true);
    END IF;
    v_input := v_input || jsonb_build_array(v_row);
  END LOOP;

  v_rows := public.spp_app_prepare_legacy_desktop_rows_v1(v_actor, v_input);
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_row->'items', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'component' = 'giat'
    ) THEN
      UPDATE public.spp_app_payments payment
      SET activity_tahun_ajaran = NULL
      FROM public.spp_app_payment_batches batch
      WHERE batch.import_key = v_row->>'source_key'
        AND batch.voided_at IS NULL
        AND payment.batch_id = batch.id
        AND payment.component = 'giat';
    END IF;
  END LOOP;
  RETURN public.import_legacy_payment_batches_v2(p_username, p_password, v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.import_legacy_payment_batches_v3(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_payment_batches_v3(text, text, jsonb)
  TO anon, authenticated;

COMMIT;
