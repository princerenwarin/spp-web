BEGIN;

ALTER TABLE public.spp_app_school_settings
  ADD COLUMN IF NOT EXISTS va_school_code text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_school_settings_va_code_unique
  ON public.spp_app_school_settings (va_school_code)
  WHERE va_school_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spp_app_school_classes (
  school_code text NOT NULL CHECK (char_length(btrim(school_code)) BETWEEN 1 AND 10),
  class_name text NOT NULL CHECK (char_length(btrim(class_name)) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_code, class_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_school_classes_unique_name
  ON public.spp_app_school_classes (school_code, lower(btrim(class_name)));

CREATE TABLE IF NOT EXISTS public.spp_app_va_settings (
  config_id text PRIMARY KEY CHECK (char_length(btrim(config_id)) BETWEEN 1 AND 100),
  bank_name text NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 100),
  va_prefix text NOT NULL CHECK (va_prefix ~ '^[0-9]{5,50}$'),
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spp_app_va_settings_active_prefix_unique
  ON public.spp_app_va_settings (va_prefix)
  WHERE is_active;

ALTER TABLE public.spp_app_school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_va_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read school classes" ON public.spp_app_school_classes;
CREATE POLICY "Read school classes"
  ON public.spp_app_school_classes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Read VA settings" ON public.spp_app_va_settings;
CREATE POLICY "Read VA settings"
  ON public.spp_app_va_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.spp_app_school_classes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spp_app_va_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_school_classes TO anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_va_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_spp_catalog_settings_v3(
  p_username text,
  p_password text,
  p_bank_name text,
  p_school_catalog jsonb,
  p_school_classes jsonb,
  p_va_settings jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_school_names jsonb;
  v_school record;
  v_has_references boolean;
  v_has_payment_references boolean;
  v_active_count integer;
BEGIN
  IF p_school_catalog IS NULL
     OR jsonb_typeof(p_school_catalog) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Daftar sekolah tidak valid.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_school_catalog) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Jumlah sekolah harus antara 1 dan 100.'
      USING ERRCODE = '22023';
  END IF;

  IF p_school_classes IS NULL OR jsonb_typeof(p_school_classes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Daftar kelas tidak valid. Maksimal 500 kelas.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_school_classes) > 500 THEN
    RAISE EXCEPTION 'Daftar kelas tidak valid. Maksimal 500 kelas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_va_settings IS NULL OR jsonb_typeof(p_va_settings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Daftar bank VA tidak valid.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_va_settings) > 100 THEN
    RAISE EXCEPTION 'Jumlah konfigurasi bank VA maksimal 100.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_school_catalog) AS school(item)
    WHERE COALESCE(char_length(btrim(school.item->>'kdsek')), 0) NOT BETWEEN 1 AND 10
       OR COALESCE(char_length(btrim(school.item->>'nmsek')), 0) NOT BETWEEN 1 AND 100
       OR jsonb_typeof(school.item->'is_active') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(school.item->'is_custom') IS DISTINCT FROM 'boolean'
       OR (
         COALESCE(school.item->>'is_active', 'false') = 'true'
         AND COALESCE(btrim(school.item->>'va_school_code'), '') !~ '^[0-9]{2}$'
       )
       OR (
         COALESCE(btrim(school.item->>'va_school_code'), '') <> ''
         AND btrim(school.item->>'va_school_code') !~ '^[0-9]{2}$'
       )
  ) THEN
    RAISE EXCEPTION 'Sekolah aktif wajib memiliki ID VA dua digit dan nama maksimal 100 karakter.'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) FILTER (WHERE (school.item->>'is_active')::boolean)
    FROM jsonb_array_elements(p_school_catalog) AS school(item)
  ) = 0 THEN
    RAISE EXCEPTION 'Minimal satu sekolah harus aktif.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT btrim(school.item->>'kdsek')
    FROM jsonb_array_elements(p_school_catalog) AS school(item)
    GROUP BY btrim(school.item->>'kdsek')
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT btrim(school.item->>'va_school_code')
    FROM jsonb_array_elements(p_school_catalog) AS school(item)
    WHERE NULLIF(btrim(school.item->>'va_school_code'), '') IS NOT NULL
    GROUP BY btrim(school.item->>'va_school_code')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Kode internal dan ID VA sekolah tidak boleh berulang.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_school_classes) AS class(item)
    WHERE COALESCE(char_length(btrim(class.item->>'school_code')), 0) NOT BETWEEN 1 AND 10
       OR COALESCE(char_length(btrim(class.item->>'class_name')), 0) NOT BETWEEN 1 AND 100
       OR jsonb_typeof(class.item->'is_active') IS DISTINCT FROM 'boolean'
       OR NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_school_catalog) AS school(item)
         WHERE btrim(school.item->>'kdsek') = btrim(class.item->>'school_code')
       )
  ) THEN
    RAISE EXCEPTION 'Kode sekolah dan nama kelas wajib valid. Nama kelas maksimal 100 karakter.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_school_classes) AS class(item)
    GROUP BY
      btrim(class.item->>'school_code'),
      lower(btrim(class.item->>'class_name'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nama kelas tidak boleh berulang dalam satu sekolah.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_va_settings) AS bank(item)
    WHERE COALESCE(char_length(btrim(bank.item->>'config_id')), 0) NOT BETWEEN 1 AND 100
       OR COALESCE(char_length(btrim(bank.item->>'bank_name')), 0) NOT BETWEEN 1 AND 100
       OR COALESCE(btrim(bank.item->>'va_prefix'), '') !~ '^[0-9]{5,50}$'
       OR jsonb_typeof(bank.item->'is_active') IS DISTINCT FROM 'boolean'
  ) THEN
    RAISE EXCEPTION 'Setiap bank wajib memiliki nama dan prefix VA angka minimal 5 digit (maksimal 50).'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM jsonb_array_elements(p_va_settings) AS bank(item)
  WHERE (bank.item->>'is_active')::boolean;
  IF v_active_count > 2 THEN
    RAISE EXCEPTION 'Maksimal dua bank VA boleh aktif.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT btrim(bank.item->>'config_id')
    FROM jsonb_array_elements(p_va_settings) AS bank(item)
    GROUP BY btrim(bank.item->>'config_id')
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT btrim(bank.item->>'va_prefix')
    FROM jsonb_array_elements(p_va_settings) AS bank(item)
    WHERE (bank.item->>'is_active')::boolean
    GROUP BY btrim(bank.item->>'va_prefix')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ID konfigurasi dan prefix bank VA aktif tidak boleh berulang.'
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'kdsek', btrim(school.item->>'kdsek'),
    'nmsek', btrim(school.item->>'nmsek')
  ))
  INTO v_school_names
  FROM jsonb_array_elements(p_school_catalog) AS school(item);

  PERFORM public.save_spp_catalog_settings(
    p_username,
    p_password,
    p_bank_name,
    v_school_names
  );

  FOR v_school IN
    SELECT current_school.school_code
    FROM (
      SELECT btrim(kdsek::text) AS school_code FROM public.mastsek
      UNION
      SELECT school_code FROM public.spp_app_school_settings
    ) AS current_school
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_school_catalog) AS school(item)
      WHERE btrim(school.item->>'kdsek') = current_school.school_code
    )
  LOOP
    v_has_references := EXISTS (
      SELECT 1 FROM public.mastspp
      WHERE btrim(kdsek::text) = v_school.school_code
    ) OR EXISTS (
      SELECT 1 FROM public.mastank
      WHERE btrim(COALESCE(id_sekolah::text, '')) = v_school.school_code
    ) OR EXISTS (
      SELECT 1 FROM public.mastusr
      WHERE btrim(COALESCE(id_sekolah::text, '')) = v_school.school_code
    );

    IF to_regclass('public.pembayaran') IS NOT NULL THEN
      EXECUTE $query$
        SELECT EXISTS (
          SELECT 1 FROM public.pembayaran
          WHERE btrim(COALESCE(id_sekolah::text, '')) = $1
        )
      $query$
        INTO v_has_payment_references
        USING v_school.school_code;
      v_has_references := v_has_references OR v_has_payment_references;
    END IF;

    IF v_has_references THEN
      RAISE EXCEPTION 'Sekolah % memiliki data terkait; nonaktifkan, jangan hapus.', v_school.school_code
        USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.spp_app_school_classes WHERE school_code = v_school.school_code;
    DELETE FROM public.spp_app_school_settings WHERE school_code = v_school.school_code;
    DELETE FROM public.mastsek WHERE btrim(kdsek::text) = v_school.school_code;
  END LOOP;

  UPDATE public.spp_app_school_settings
  SET va_school_code = NULL
  WHERE va_school_code IS NOT NULL;

  INSERT INTO public.spp_app_school_settings (
    school_code, school_name, va_school_code, is_active, is_custom, updated_at
  )
  SELECT
    btrim(school.item->>'kdsek'),
    btrim(school.item->>'nmsek'),
    NULLIF(btrim(school.item->>'va_school_code'), ''),
    (school.item->>'is_active')::boolean,
    (school.item->>'is_custom')::boolean,
    now()
  FROM jsonb_array_elements(p_school_catalog) AS school(item)
  ON CONFLICT (school_code) DO UPDATE
    SET school_name = EXCLUDED.school_name,
        va_school_code = EXCLUDED.va_school_code,
        is_active = EXCLUDED.is_active,
        is_custom = EXCLUDED.is_custom,
        updated_at = now();

  INSERT INTO public.spp_app_school_classes (school_code, class_name, is_active, updated_at)
  SELECT
    btrim(class.item->>'school_code'),
    btrim(class.item->>'class_name'),
    (class.item->>'is_active')::boolean,
    now()
  FROM jsonb_array_elements(p_school_classes) AS class(item)
  ON CONFLICT (school_code, class_name) DO UPDATE
    SET is_active = EXCLUDED.is_active,
        updated_at = now();

  DELETE FROM public.spp_app_school_classes AS existing
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_school_classes) AS class(item)
    WHERE btrim(class.item->>'school_code') = existing.school_code
      AND btrim(class.item->>'class_name') = existing.class_name
  );

  DELETE FROM public.spp_app_va_settings;

  INSERT INTO public.spp_app_va_settings (config_id, bank_name, va_prefix, is_active, updated_at)
  SELECT
    btrim(bank.item->>'config_id'),
    btrim(bank.item->>'bank_name'),
    btrim(bank.item->>'va_prefix'),
    (bank.item->>'is_active')::boolean,
    now()
  FROM jsonb_array_elements(p_va_settings) AS bank(item);

END;
$function$;

REVOKE ALL ON FUNCTION public.save_spp_catalog_settings_v3(text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_spp_catalog_settings_v3(text, text, text, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_spp_catalog_settings_v3(text, text, text, jsonb, jsonb, jsonb) TO anon, authenticated;

COMMIT;
