-- Add configurable starting rows and a live card-print preview cursor.
-- Run after 020_card_print_tracking.sql.
BEGIN;

ALTER TABLE public.spp_app_card_print_cursors
  ADD COLUMN IF NOT EXISTS next_row smallint NOT NULL DEFAULT 1;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.spp_app_card_print_cursors'::regclass
      AND conname = 'spp_app_card_print_cursor_next_row_check'
  ) THEN
    ALTER TABLE public.spp_app_card_print_cursors
      ADD CONSTRAINT spp_app_card_print_cursor_next_row_check
      CHECK (next_row BETWEEN 1 AND 17);
  END IF;
END;
$migration$;

UPDATE public.spp_app_card_print_cursors AS cur
SET next_row = LEAST(COALESCE((
  SELECT max(log.row_no)::integer + 1
  FROM public.spp_app_card_print_log AS log
  WHERE log.id_siswa = cur.id_siswa
    AND log.tahun_ajaran = cur.tahun_ajaran
    AND log.section = cur.section
    AND log.generation = cur.generation
), 1), 17)::smallint;

CREATE OR REPLACE FUNCTION public.get_spp_card_print_state_v2(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text
)
RETURNS TABLE (
  section text,
  batch_id bigint,
  period text,
  print_count bigint,
  last_row smallint,
  next_row smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);
  PERFORM public.spp_app_assert_card_print_student(p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran);

  RETURN QUERY
  WITH sections AS (
    SELECT requested.section,
      COALESCE(cur.generation, 1)::integer AS generation,
      COALESCE(cur.next_row, 1)::smallint AS next_row
    FROM (VALUES ('one_time'::text), ('monthly'::text)) AS requested(section)
    LEFT JOIN public.spp_app_card_print_cursors AS cur
      ON cur.id_siswa = p_id_siswa
      AND cur.tahun_ajaran = p_tahun_ajaran
      AND cur.section = requested.section
  ),
  history AS (
    SELECT sections.section,
      log.batch_id,
      COALESCE(NULLIF(btrim(log.periode::text), ''), '') AS period,
      count(*)::bigint AS print_count,
      max(log.row_no)::smallint AS last_row,
      sections.next_row
    FROM sections
    JOIN public.spp_app_card_print_log AS log
      ON log.id_siswa = p_id_siswa
      AND log.tahun_ajaran = p_tahun_ajaran
      AND log.section = sections.section
      AND log.generation = sections.generation
    GROUP BY sections.section, log.batch_id, log.periode, sections.next_row
  )
  SELECT history.section, history.batch_id, history.period,
    history.print_count, history.last_row, history.next_row
  FROM history
  UNION ALL
  SELECT sections.section, NULL::bigint, NULL::text, 0::bigint,
    (sections.next_row - 1)::smallint, sections.next_row
  FROM sections
  WHERE NOT EXISTS (
    SELECT 1 FROM history WHERE history.section = sections.section
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_spp_card_print_position_v2(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text,
  p_section text,
  p_next_row integer
)
RETURNS TABLE (
  section text,
  generation integer,
  last_row smallint,
  next_row smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text;
  v_generation integer;
BEGIN
  v_actor := public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);
  PERFORM public.spp_app_assert_card_print_student(p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran);
  IF COALESCE(p_section, '') NOT IN ('one_time', 'monthly')
     OR p_next_row IS NULL
     OR p_next_row NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'Pilih tabel dan nomor baris berikutnya antara 1 dan 16.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_id_siswa || '|' || p_tahun_ajaran),
    pg_catalog.hashtext('spp_app_card_print')
  );
  INSERT INTO public.spp_app_card_print_cursors AS current_cursor (
    id_siswa, tahun_ajaran, section, generation, next_row, updated_by
  ) VALUES (
    p_id_siswa, p_tahun_ajaran, p_section, 1, p_next_row::smallint, v_actor
  )
  ON CONFLICT (id_siswa, tahun_ajaran, section) DO UPDATE
  SET generation = current_cursor.generation + 1,
      next_row = EXCLUDED.next_row,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by
  RETURNING current_cursor.generation INTO v_generation;

  RETURN QUERY SELECT p_section, v_generation,
    (p_next_row - 1)::smallint, p_next_row::smallint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_spp_card_print_position_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text,
  p_section text
)
RETURNS TABLE (
  section text,
  generation integer,
  last_row smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT reset_state.section, reset_state.generation, reset_state.last_row
  FROM public.reset_spp_card_print_position_v2(
    p_username, p_password, p_id_siswa, p_nospp, p_kdsek,
    p_tahun_ajaran, p_section, 1
  ) AS reset_state;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_spp_card_print_rows_v2(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text,
  p_rows jsonb,
  p_expected_one_time_next_row integer,
  p_expected_monthly_next_row integer
)
RETURNS TABLE (
  request_index integer,
  section text,
  batch_id bigint,
  period text,
  row_no smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text;
  v_year_start integer;
  v_date_start date;
  v_date_end date;
  v_item jsonb;
  v_request_index integer;
  v_section text;
  v_batch_id bigint;
  v_period text;
  v_reprint boolean;
  v_already_printed boolean;
  v_is_valid_payment boolean;
  v_monthly_last integer;
  v_one_time_last integer;
  v_monthly_generation integer;
  v_one_time_generation integer;
  v_monthly_count integer;
  v_one_time_count integer;
  v_monthly_index integer := 0;
  v_one_time_index integer := 0;
  v_row_no smallint;
BEGIN
  v_actor := public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);
  PERFORM public.spp_app_assert_card_print_student(p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran);
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Daftar pembayaran yang dipilih tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Pilih antara 1 dan 32 baris cetak.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    WHERE COALESCE(jsonb_typeof(item.value), '') <> 'object'
       OR COALESCE(item.value->>'section', '') NOT IN ('one_time', 'monthly')
       OR COALESCE(item.value->>'batch_id', '') !~ '^[0-9]+$'
       OR COALESCE(item.value->>'reprint', '') NOT IN ('true', 'false')
  ) THEN
    RAISE EXCEPTION 'Format pembayaran yang dipilih tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    GROUP BY item.value->>'section',
      (item.value->>'batch_id')::bigint,
      COALESCE(NULLIF(btrim(item.value->>'period'), ''), '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Pembayaran yang sama dipilih lebih dari satu kali.' USING ERRCODE = '22023';
  END IF;

  v_year_start := substring(p_tahun_ajaran FROM 1 FOR 4)::integer;
  v_date_start := make_date(v_year_start, 7, 1);
  v_date_end := make_date(v_year_start + 1, 7, 1);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_id_siswa || '|' || p_tahun_ajaran),
    pg_catalog.hashtext('spp_app_card_print')
  );
  INSERT INTO public.spp_app_card_print_cursors (
    id_siswa, tahun_ajaran, section, generation, next_row, updated_by
  ) VALUES
    (p_id_siswa, p_tahun_ajaran, 'monthly', 1, 1, v_actor),
    (p_id_siswa, p_tahun_ajaran, 'one_time', 1, 1, v_actor)
  ON CONFLICT (id_siswa, tahun_ajaran, section) DO NOTHING;
  SELECT cur.generation, cur.next_row::integer - 1
  INTO v_monthly_generation, v_monthly_last
  FROM public.spp_app_card_print_cursors AS cur
  WHERE cur.id_siswa = p_id_siswa
    AND cur.tahun_ajaran = p_tahun_ajaran
    AND cur.section = 'monthly';
  SELECT cur.generation, cur.next_row::integer - 1
  INTO v_one_time_generation, v_one_time_last
  FROM public.spp_app_card_print_cursors AS cur
  WHERE cur.id_siswa = p_id_siswa
    AND cur.tahun_ajaran = p_tahun_ajaran
    AND cur.section = 'one_time';
  IF (p_expected_one_time_next_row IS NOT NULL
      AND p_expected_one_time_next_row NOT BETWEEN 1 AND 17)
     OR (p_expected_monthly_next_row IS NOT NULL
      AND p_expected_monthly_next_row NOT BETWEEN 1 AND 17) THEN
    RAISE EXCEPTION 'Posisi baris pratinjau tidak valid. Muat ulang daftar pembayaran.' USING ERRCODE = '22023';
  END IF;
  IF (p_expected_one_time_next_row IS NOT NULL
      AND p_expected_one_time_next_row <> v_one_time_last + 1)
     OR (p_expected_monthly_next_row IS NOT NULL
      AND p_expected_monthly_next_row <> v_monthly_last + 1) THEN
    RAISE EXCEPTION 'Posisi cetak berubah setelah pratinjau dimuat. Daftar dan pratinjau perlu diperbarui.' USING ERRCODE = '40001';
  END IF;
  SELECT count(*) FILTER (WHERE item.value->>'section' = 'monthly')::integer,
    count(*) FILTER (WHERE item.value->>'section' = 'one_time')::integer
  INTO v_monthly_count, v_one_time_count
  FROM jsonb_array_elements(p_rows) AS item(value);

  IF v_monthly_last + v_monthly_count > 16 THEN
    RAISE EXCEPTION 'Tabel periode hanya memiliki 16 baris; pilih lebih sedikit pembayaran.' USING ERRCODE = '22023';
  END IF;
  IF v_one_time_last + v_one_time_count > 16 THEN
    RAISE EXCEPTION 'Tabel pembayaran nonperiode hanya memiliki 16 baris; pilih lebih sedikit pembayaran.' USING ERRCODE = '22023';
  END IF;

  FOR v_item, v_request_index IN
    SELECT item.value, item.ordinality::integer
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS item(value, ordinality)
    ORDER BY item.ordinality
  LOOP
    v_section := v_item->>'section';
    v_batch_id := (v_item->>'batch_id')::bigint;
    v_period := NULLIF(btrim(v_item->>'period'), '');
    v_reprint := (v_item->>'reprint')::boolean;

    IF v_section = 'monthly' THEN
      IF v_period IS NULL OR v_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
        RAISE EXCEPTION 'Periode pembayaran tidak valid.' USING ERRCODE = '22023';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.spp_app_payments AS payment
        JOIN public.spp_app_payment_batches AS batch ON batch.id = payment.batch_id
        WHERE payment.batch_id = v_batch_id
          AND payment.id_siswa = p_id_siswa
          AND payment.nospp = p_nospp
          AND payment.kdsek = p_kdsek
          AND payment.periode = v_period
          AND payment.component IN ('spp', 'spp_bos', 'spp_tl', 'komp', 'komp_tl', 'giat')
          AND batch.voided_at IS NULL
          AND batch.tglbyr >= v_date_start
          AND batch.tglbyr < v_date_end
      ) INTO v_is_valid_payment;
    ELSE
      IF v_period IS NOT NULL THEN
        RAISE EXCEPTION 'Pembayaran nonperiode tidak dapat memiliki periode.' USING ERRCODE = '22023';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.spp_app_payments AS payment
        JOIN public.spp_app_payment_batches AS batch ON batch.id = payment.batch_id
        WHERE payment.batch_id = v_batch_id
          AND payment.id_siswa = p_id_siswa
          AND payment.nospp = p_nospp
          AND payment.kdsek = p_kdsek
          AND payment.component IN ('dpp', 'dpp_tl', 'dsp', 'giat', 'seragam', 'lainnya')
          AND batch.voided_at IS NULL
          AND batch.tglbyr >= v_date_start
          AND batch.tglbyr < v_date_end
      ) INTO v_is_valid_payment;
    END IF;
    IF NOT v_is_valid_payment THEN
      RAISE EXCEPTION 'Pembayaran tidak lagi tersedia untuk kartu siswa ini.' USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.spp_app_card_print_log AS log
      WHERE log.id_siswa = p_id_siswa
        AND log.tahun_ajaran = p_tahun_ajaran
        AND log.section = v_section
        AND log.generation = CASE WHEN v_section = 'monthly' THEN v_monthly_generation ELSE v_one_time_generation END
        AND log.batch_id = v_batch_id
        AND log.periode IS NOT DISTINCT FROM v_period::char(6)
    ) INTO v_already_printed;
    IF v_already_printed IS DISTINCT FROM v_reprint THEN
      RAISE EXCEPTION 'Status cetak berubah. Tutup lalu buka kembali daftar pembayaran.' USING ERRCODE = '40001';
    END IF;

    IF v_section = 'monthly' THEN
      v_monthly_index := v_monthly_index + 1;
      v_row_no := (v_monthly_last + v_monthly_index)::smallint;
    ELSE
      v_one_time_index := v_one_time_index + 1;
      v_row_no := (v_one_time_last + v_one_time_index)::smallint;
    END IF;

    INSERT INTO public.spp_app_card_print_log (
      id_siswa, nospp, kdsek, tahun_ajaran, section, generation, batch_id, periode, row_no, printed_by
    ) VALUES (
      p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran, v_section,
      CASE WHEN v_section = 'monthly' THEN v_monthly_generation ELSE v_one_time_generation END,
      v_batch_id,
      v_period::char(6), v_row_no, v_actor
    );

    RETURN QUERY SELECT v_request_index, v_section, v_batch_id, COALESCE(v_period, ''), v_row_no;
  END LOOP;

  UPDATE public.spp_app_card_print_cursors AS cur
  SET next_row = (v_monthly_last + v_monthly_count + 1)::smallint,
      updated_at = now(),
      updated_by = v_actor
  WHERE cur.id_siswa = p_id_siswa
    AND cur.tahun_ajaran = p_tahun_ajaran
    AND cur.section = 'monthly';
  UPDATE public.spp_app_card_print_cursors AS cur
  SET next_row = (v_one_time_last + v_one_time_count + 1)::smallint,
      updated_at = now(),
      updated_by = v_actor
  WHERE cur.id_siswa = p_id_siswa
    AND cur.tahun_ajaran = p_tahun_ajaran
    AND cur.section = 'one_time';
END;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_spp_card_print_rows_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text,
  p_rows jsonb
)
RETURNS TABLE (
  request_index integer,
  section text,
  batch_id bigint,
  period text,
  row_no smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT reservation.request_index, reservation.section, reservation.batch_id,
    reservation.period, reservation.row_no
  FROM public.reserve_spp_card_print_rows_v2(
    p_username, p_password, p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran,
    p_rows, NULL, NULL
  ) AS reservation;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_spp_card_print_state_v2(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_spp_card_print_position_v2(text, text, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_spp_card_print_rows_v2(text, text, text, text, text, text, jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_spp_card_print_state_v2(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_spp_card_print_position_v2(text, text, text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_spp_card_print_rows_v2(text, text, text, text, text, text, jsonb, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
