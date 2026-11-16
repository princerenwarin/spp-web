-- Shared print positions for preprinted SPP cards.
-- Run after 019_two_month_billing_horizon.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.spp_app_card_print_log (
  id bigserial PRIMARY KEY,
  id_siswa text NOT NULL,
  nospp text NOT NULL,
  kdsek text NOT NULL,
  tahun_ajaran text NOT NULL CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'),
  section text NOT NULL CHECK (section IN ('one_time', 'monthly')),
  generation integer NOT NULL CHECK (generation > 0),
  batch_id bigint NOT NULL REFERENCES public.spp_app_payment_batches (id),
  periode char(6),
  row_no smallint NOT NULL CHECK (row_no BETWEEN 1 AND 16),
  printed_at timestamptz NOT NULL DEFAULT now(),
  printed_by text NOT NULL,
  CHECK (
    (section = 'monthly' AND periode IS NOT NULL AND periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$')
    OR (section = 'one_time' AND periode IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.spp_app_card_print_cursors (
  id_siswa text NOT NULL,
  tahun_ajaran text NOT NULL CHECK (tahun_ajaran ~ '^[0-9]{4}-[0-9]{4}$'),
  section text NOT NULL CHECK (section IN ('one_time', 'monthly')),
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (id_siswa, tahun_ajaran, section)
);

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_card_print_position_unique
  ON public.spp_app_card_print_log (id_siswa, tahun_ajaran, section, generation, row_no);
CREATE INDEX IF NOT EXISTS spp_app_card_print_status_idx
  ON public.spp_app_card_print_log (id_siswa, tahun_ajaran, section, generation, batch_id, periode);

ALTER TABLE public.spp_app_card_print_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_card_print_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spp_app_card_print_log, public.spp_app_card_print_cursors FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_assert_card_print_access(
  p_username text,
  p_password text,
  p_kdsek text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text;
  v_role text;
  v_unit text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kdsek, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Unit siswa tidak valid.' USING ERRCODE = '22023';
  END IF;

  SELECT account.idpemakai,
    lower(btrim(COALESCE(account.role, 'unit'))),
    COALESCE(NULLIF(btrim(account.id_sekolah), ''), 'ALL')
  INTO v_actor, v_role, v_unit
  FROM public.mastusr AS account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND btrim(COALESCE(account.password, '')) = btrim(COALESCE(p_password, ''));

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Username atau password salah.' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('superadmin', 'yayasan')
     AND (v_unit = 'ALL' OR v_unit <> btrim(p_kdsek)) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke kartu siswa dari unit lain.' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_assert_card_print_student(
  p_id_siswa text,
  p_nospp text,
  p_kdsek text,
  p_tahun_ajaran text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_year_start integer;
  v_exists boolean;
BEGIN
  IF NULLIF(btrim(COALESCE(p_id_siswa, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_nospp, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_kdsek, '')), '') IS NULL
     OR COALESCE(p_tahun_ajaran, '') !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Identitas siswa atau tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;

  v_year_start := substring(p_tahun_ajaran FROM 1 FOR 4)::integer;
  SELECT EXISTS (
    SELECT 1
    FROM public.spp_app_enrollments AS enrollment
    WHERE enrollment.id_siswa = p_id_siswa
      AND enrollment.nospp = p_nospp
      AND enrollment.kdsek = p_kdsek
      AND enrollment.tahun_ajaran = p_tahun_ajaran
  ) OR EXISTS (
    SELECT 1
    FROM public.spp_app_payments AS payment
    JOIN public.spp_app_payment_batches AS batch ON batch.id = payment.batch_id
    WHERE payment.id_siswa = p_id_siswa
      AND payment.nospp = p_nospp
      AND payment.kdsek = p_kdsek
      AND batch.tglbyr >= make_date(v_year_start, 7, 1)
      AND batch.tglbyr < make_date(v_year_start + 1, 7, 1)
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada unit dan tahun ajaran yang dipilih.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_spp_card_print_state_v1(
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
  last_row smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);
  PERFORM public.spp_app_assert_card_print_student(p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran);

  RETURN QUERY
  SELECT log.section,
    log.batch_id,
    COALESCE(NULLIF(btrim(log.periode::text), ''), ''),
    count(*)::bigint,
    max(log.row_no)::smallint
  FROM public.spp_app_card_print_log AS log
  LEFT JOIN public.spp_app_card_print_cursors AS c
    ON c.id_siswa = log.id_siswa
    AND c.tahun_ajaran = log.tahun_ajaran
    AND c.section = log.section
  WHERE log.id_siswa = p_id_siswa
    AND log.tahun_ajaran = p_tahun_ajaran
    AND log.generation = COALESCE(c.generation, 1)
  GROUP BY log.section, log.batch_id, log.periode;
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
DECLARE
  v_actor text;
  v_generation integer;
BEGIN
  v_actor := public.spp_app_assert_card_print_access(p_username, p_password, p_kdsek);
  PERFORM public.spp_app_assert_card_print_student(p_id_siswa, p_nospp, p_kdsek, p_tahun_ajaran);
  IF COALESCE(p_section, '') NOT IN ('one_time', 'monthly') THEN
    RAISE EXCEPTION 'Identitas siswa, tahun ajaran, atau tabel kartu tidak valid.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_id_siswa || '|' || p_tahun_ajaran),
    pg_catalog.hashtext('spp_app_card_print')
  );
  INSERT INTO public.spp_app_card_print_cursors (
    id_siswa, tahun_ajaran, section, generation, updated_by
  ) VALUES (
    p_id_siswa, p_tahun_ajaran, p_section, 1, v_actor
  )
  ON CONFLICT (id_siswa, tahun_ajaran, section) DO NOTHING;

  UPDATE public.spp_app_card_print_cursors AS c
  SET generation = c.generation + 1,
      updated_at = now(),
      updated_by = v_actor
  WHERE c.id_siswa = p_id_siswa
    AND c.tahun_ajaran = p_tahun_ajaran
    AND c.section = p_section
  RETURNING c.generation INTO v_generation;

  RETURN QUERY SELECT p_section, v_generation, 0::smallint;
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

  -- Serialize reservations per student and academic year before reading the cursor.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_id_siswa || '|' || p_tahun_ajaran),
    pg_catalog.hashtext('spp_app_card_print')
  );
  INSERT INTO public.spp_app_card_print_cursors (
    id_siswa, tahun_ajaran, section, generation, updated_by
  ) VALUES
    (p_id_siswa, p_tahun_ajaran, 'monthly', 1, v_actor),
    (p_id_siswa, p_tahun_ajaran, 'one_time', 1, v_actor)
  ON CONFLICT (id_siswa, tahun_ajaran, section) DO NOTHING;
  SELECT c.generation INTO v_monthly_generation
  FROM public.spp_app_card_print_cursors AS c
  WHERE c.id_siswa = p_id_siswa AND c.tahun_ajaran = p_tahun_ajaran AND c.section = 'monthly';
  SELECT c.generation INTO v_one_time_generation
  FROM public.spp_app_card_print_cursors AS c
  WHERE c.id_siswa = p_id_siswa AND c.tahun_ajaran = p_tahun_ajaran AND c.section = 'one_time';
  SELECT COALESCE(max(log.row_no), 0) INTO v_monthly_last
  FROM public.spp_app_card_print_log AS log
  WHERE log.id_siswa = p_id_siswa AND log.tahun_ajaran = p_tahun_ajaran
    AND log.section = 'monthly' AND log.generation = v_monthly_generation;
  SELECT COALESCE(max(log.row_no), 0) INTO v_one_time_last
  FROM public.spp_app_card_print_log AS log
  WHERE log.id_siswa = p_id_siswa AND log.tahun_ajaran = p_tahun_ajaran
    AND log.section = 'one_time' AND log.generation = v_one_time_generation;
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
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_assert_card_print_access(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spp_app_assert_card_print_student(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_spp_card_print_state_v1(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_spp_card_print_position_v1(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_spp_card_print_rows_v1(text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_spp_card_print_state_v1(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_spp_card_print_position_v1(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_spp_card_print_rows_v1(text, text, text, text, text, text, jsonb) TO anon, authenticated;

COMMIT;
