BEGIN;

CREATE TABLE IF NOT EXISTS public.spp_app_bank_settings (
  setting_id smallint PRIMARY KEY CHECK (setting_id = 1),
  bank_name text NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.spp_app_bank_settings (setting_id, bank_name)
VALUES (1, 'BCA')
ON CONFLICT (setting_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.spp_app_school_settings (
  school_code text PRIMARY KEY CHECK (char_length(btrim(school_code)) BETWEEN 1 AND 10),
  school_name text NOT NULL CHECK (char_length(btrim(school_name)) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spp_app_bank_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spp_app_school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read bank settings" ON public.spp_app_bank_settings;
CREATE POLICY "Read bank settings"
  ON public.spp_app_bank_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Read school settings" ON public.spp_app_school_settings;
CREATE POLICY "Read school settings"
  ON public.spp_app_school_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.spp_app_bank_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spp_app_school_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_bank_settings TO anon, authenticated;
GRANT SELECT ON TABLE public.spp_app_school_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_spp_catalog_settings(
  p_username text,
  p_password text,
  p_bank_name text,
  p_school_names jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF char_length(btrim(COALESCE(p_bank_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Nama bank wajib diisi dan maksimal 100 karakter.'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(p_username, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_password, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Username dan password Admin wajib diisi.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mastusr AS account
    WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
      AND btrim(COALESCE(account.password, '')) = btrim(COALESCE(p_password, ''))
      AND lower(btrim(COALESCE(account.role, ''))) = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Admin yang dapat mengubah pengaturan.'
      USING ERRCODE = '42501';
  END IF;

  IF p_school_names IS NULL OR jsonb_typeof(p_school_names) <> 'array' THEN
    RAISE EXCEPTION 'Daftar nama sekolah tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_school_names) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Daftar sekolah tidak valid.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_school_names) AS school(item)
    WHERE COALESCE(char_length(btrim(school.item->>'kdsek')), 0) NOT BETWEEN 1 AND 10
       OR COALESCE(char_length(btrim(school.item->>'nmsek')), 0) NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION 'Kode dan nama sekolah wajib diisi. Nama maksimal 100 karakter.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT btrim(school.item->>'kdsek')
    FROM jsonb_array_elements(p_school_names) AS school(item)
    GROUP BY btrim(school.item->>'kdsek')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Kode sekolah tidak boleh berulang.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.spp_app_bank_settings (setting_id, bank_name, updated_at)
  VALUES (1, btrim(p_bank_name), now())
  ON CONFLICT (setting_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name,
        updated_at = now();

  INSERT INTO public.spp_app_school_settings (school_code, school_name, updated_at)
  SELECT btrim(school.item->>'kdsek'), btrim(school.item->>'nmsek'), now()
  FROM jsonb_array_elements(p_school_names) AS school(item)
  ON CONFLICT (school_code) DO UPDATE
    SET school_name = EXCLUDED.school_name,
        updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.save_spp_catalog_settings(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_spp_catalog_settings(text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_spp_catalog_settings(text, text, text, jsonb) TO anon, authenticated;

COMMIT;
