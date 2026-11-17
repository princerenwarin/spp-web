BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.mastusr
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS mastusr_username_lower_idx
  ON public.mastusr (lower(btrim(idpemakai)));

CREATE OR REPLACE FUNCTION public.spp_app_hash_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_crypto_schema text;
  v_password_digest text;
  v_hash text;
BEGIN
  SELECT ns.nspname INTO v_crypto_schema
  FROM pg_catalog.pg_extension ext
  JOIN pg_catalog.pg_namespace ns ON ns.oid = ext.extnamespace
  WHERE ext.extname = 'pgcrypto';
  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Ekstensi pgcrypto belum tersedia.' USING ERRCODE = '55000';
  END IF;
  EXECUTE format(
    'SELECT encode(%I.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    v_crypto_schema
  ) INTO v_password_digest USING btrim(p_password);
  EXECUTE format(
    'SELECT %I.crypt($1, %I.gen_salt(''bf'', 12))',
    v_crypto_schema,
    v_crypto_schema
  ) INTO v_hash USING v_password_digest;
  RETURN v_hash;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_hash_password(text) FROM PUBLIC, anon, authenticated;

UPDATE public.mastusr
SET password_hash = public.spp_app_hash_password(password)
WHERE password_hash IS NULL
  AND NULLIF(btrim(COALESCE(password, '')), '') IS NOT NULL;

UPDATE public.mastusr
SET password = ''
WHERE password_hash IS NOT NULL
  AND COALESCE(password, '') <> '';

CREATE OR REPLACE FUNCTION public.spp_app_password_matches(
  p_password text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_crypto_schema text;
  v_password_digest text;
  v_matches boolean;
BEGIN
  IF NULLIF(btrim(COALESCE(p_password, '')), '') IS NULL
     OR p_password_hash IS NULL THEN
    RETURN false;
  END IF;
  SELECT ns.nspname INTO v_crypto_schema
  FROM pg_catalog.pg_extension ext
  JOIN pg_catalog.pg_namespace ns ON ns.oid = ext.extnamespace
  WHERE ext.extname = 'pgcrypto';
  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Ekstensi pgcrypto belum tersedia.' USING ERRCODE = '55000';
  END IF;
  EXECUTE format(
    'SELECT encode(%I.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    v_crypto_schema
  ) INTO v_password_digest USING btrim(p_password);
  EXECUTE format('SELECT %I.crypt($1, $2) = $2', v_crypto_schema)
    INTO v_matches USING v_password_digest, p_password_hash;
  RETURN COALESCE(v_matches, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_password_matches(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_mastusr(p_username text, p_password text)
RETURNS TABLE (
  idpemakai text,
  jabatan text,
  role text,
  id_sekolah text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    m.idpemakai::text,
    COALESCE(NULLIF(BTRIM(m.jabatan), ''), NULLIF(BTRIM(m.nama_lengkap), ''), 'Admin')::text,
    COALESCE(NULLIF(LOWER(BTRIM(m.role)), ''), 'unit')::text,
    COALESCE(NULLIF(BTRIM(m.id_sekolah), ''), 'ALL')::text
  FROM public.mastusr AS m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash)
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.login_mastusr(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_mastusr(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.spp_app_assert_admin(p_username text, p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text;
BEGIN
  SELECT account.idpemakai INTO v_actor
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND account.is_active
    AND public.spp_app_password_matches(p_password, account.password_hash)
    AND lower(btrim(COALESCE(account.role, ''))) = 'superadmin';
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Admin aktif yang dapat mengubah pengaturan.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$function$;

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
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND account.is_active
    AND public.spp_app_password_matches(p_password, account.password_hash);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Username/password salah atau akun diblokir.' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('superadmin', 'yayasan')
     AND (v_unit = 'ALL' OR v_unit <> btrim(p_kdsek)) THEN
    RAISE EXCEPTION 'Anda tidak memiliki akses ke kartu siswa dari unit lain.' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$function$;

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

  PERFORM public.spp_app_assert_admin(p_username, p_password);

  IF p_school_names IS NULL OR jsonb_typeof(p_school_names) <> 'array' THEN
    RAISE EXCEPTION 'Daftar nama sekolah tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_school_names) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Daftar sekolah tidak valid.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Kode sekolah tidak boleh berulang.' USING ERRCODE = '22023';
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

CREATE SEQUENCE IF NOT EXISTS public.spp_app_operator_code_seq;

CREATE OR REPLACE FUNCTION public.spp_app_next_operator_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := 'USR-' || lpad(nextval('public.spp_app_operator_code_seq')::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.spp_app_operator_codes operator_code
      WHERE lower(operator_code.kode_operator) = lower(v_code)
    );
  END LOOP;
  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_next_operator_code() FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  v_account record;
  v_code text;
BEGIN
  FOR v_account IN
    SELECT account.idpemakai
    FROM public.mastusr account
    WHERE NULLIF(btrim(account.idpemakai), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.spp_app_operator_codes operator_code
        WHERE lower(btrim(operator_code.idpemakai)) = lower(btrim(account.idpemakai))
      )
    ORDER BY lower(account.idpemakai)
  LOOP
    v_code := public.spp_app_next_operator_code();
    INSERT INTO public.spp_app_operator_codes (idpemakai, kode_operator, updated_at, updated_by)
    VALUES (v_account.idpemakai, v_code, now(), 'migration-025');
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.spp_app_user_accounts_v1(
  p_username text,
  p_password text
)
RETURNS TABLE (
  idpemakai text,
  nama_lengkap text,
  role text,
  id_sekolah text,
  is_active boolean,
  kode_operator text,
  jabatan text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  RETURN QUERY
  SELECT account.idpemakai::text,
    COALESCE(NULLIF(btrim(account.nama_lengkap), ''), NULLIF(btrim(account.jabatan), ''), '')::text,
    COALESCE(NULLIF(lower(btrim(account.role)), ''), 'unit')::text,
    COALESCE(NULLIF(btrim(account.id_sekolah), ''), 'ALL')::text,
    account.is_active,
    operator_code.kode_operator,
    account.jabatan::text
  FROM public.mastusr account
  LEFT JOIN public.spp_app_operator_codes operator_code
    ON lower(btrim(operator_code.idpemakai)) = lower(btrim(account.idpemakai))
  ORDER BY lower(account.idpemakai);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_create_user_v1(
  p_username text,
  p_password text,
  p_idpemakai text,
  p_nama_lengkap text,
  p_password_baru text,
  p_role text,
  p_id_sekolah text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_id text := btrim(COALESCE(p_idpemakai, ''));
  v_name text := btrim(COALESCE(p_nama_lengkap, ''));
  v_role text := lower(btrim(COALESCE(p_role, '')));
  v_school text := btrim(COALESCE(p_id_sekolah, ''));
  v_operator_code text;
BEGIN
  IF v_id !~ '^[A-Za-z0-9._-]{3,50}$' THEN
    RAISE EXCEPTION 'Username harus 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Nama pengguna wajib diisi dan maksimal 100 karakter.' USING ERRCODE = '22023';
  END IF;
  IF p_password_baru IS NULL
     OR char_length(p_password_baru) NOT BETWEEN 8 AND 128
     OR p_password_baru <> btrim(p_password_baru) THEN
    RAISE EXCEPTION 'Password harus 8–128 karakter tanpa spasi di awal atau akhir.'
      USING ERRCODE = '22023';
  END IF;
  IF v_role NOT IN ('superadmin', 'yayasan', 'unit') THEN
    RAISE EXCEPTION 'Role pengguna tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'unit' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.spp_app_school_settings school
      WHERE school.school_code = v_school AND school.is_active
    ) THEN
      RAISE EXCEPTION 'Pilih sekolah yang aktif untuk akun Unit.' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_school := 'ALL';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('spp_app_user_management'));
  IF EXISTS (
    SELECT 1 FROM public.mastusr account
    WHERE lower(btrim(account.idpemakai)) = lower(v_id)
  ) THEN
    RAISE EXCEPTION 'Username sudah digunakan.' USING ERRCODE = '23505';
  END IF;

  v_operator_code := public.spp_app_next_operator_code();
  INSERT INTO public.mastusr (
    idpemakai, password, password_hash, jabatan, nama_lengkap,
    role, id_sekolah, is_active
  ) VALUES (
    v_id, '', public.spp_app_hash_password(p_password_baru), v_name, v_name,
    v_role, v_school, true
  );
  INSERT INTO public.spp_app_operator_codes (idpemakai, kode_operator, updated_at, updated_by)
  VALUES (v_id, v_operator_code, now(), v_actor);
  RETURN v_operator_code;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Username atau kode operator sudah digunakan.' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_update_user_v1(
  p_username text,
  p_password text,
  p_idpemakai text,
  p_nama_lengkap text,
  p_role text,
  p_id_sekolah text,
  p_kode_operator text,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_target text;
  v_existing_role text;
  v_existing_school text;
  v_role text := lower(btrim(COALESCE(p_role, '')));
  v_name text := btrim(COALESCE(p_nama_lengkap, ''));
  v_school text := btrim(COALESCE(p_id_sekolah, ''));
  v_code text := upper(btrim(COALESCE(p_kode_operator, '')));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('spp_app_user_management'));
  SELECT account.idpemakai, lower(btrim(COALESCE(account.role, ''))),
    COALESCE(NULLIF(btrim(account.id_sekolah), ''), 'ALL')
  INTO v_target, v_existing_role, v_existing_school
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_idpemakai, '')));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Pengguna tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Nama pengguna wajib diisi dan maksimal 100 karakter.' USING ERRCODE = '22023';
  END IF;
  IF v_role NOT IN ('superadmin', 'yayasan', 'unit') THEN
    RAISE EXCEPTION 'Role pengguna tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Status pengguna tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_code !~ '^[A-Z0-9-]{2,20}$' THEN
    RAISE EXCEPTION 'Kode operator harus 2–20 karakter: huruf, angka, atau tanda hubung.'
      USING ERRCODE = '22023';
  END IF;
  IF v_role = 'unit' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.spp_app_school_settings school
      WHERE school.school_code = v_school AND school.is_active
    ) AND NOT (
      v_existing_role = 'unit'
      AND v_school <> 'ALL'
      AND lower(COALESCE(v_existing_school, '')) = lower(v_school)
    ) THEN
      RAISE EXCEPTION 'Pilih sekolah yang aktif untuk akun Unit.' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_school := 'ALL';
  END IF;
  IF lower(btrim(v_target)) = lower(btrim(v_actor))
     AND (v_role <> 'superadmin' OR NOT p_is_active) THEN
    RAISE EXCEPTION 'Role dan status akun Admin yang sedang digunakan tidak dapat diubah.'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.spp_app_operator_codes operator_code
    WHERE lower(operator_code.kode_operator) = lower(v_code)
      AND lower(btrim(operator_code.idpemakai)) <> lower(btrim(v_target))
  ) THEN
    RAISE EXCEPTION 'Kode operator sudah dipakai akun lain.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.mastusr account
    WHERE account.idpemakai = v_target
      AND account.is_active
      AND lower(btrim(COALESCE(account.role, ''))) = 'superadmin'
      AND (NOT p_is_active OR v_role <> 'superadmin')
  ) AND (
    SELECT count(*) FROM public.mastusr active_admin
    WHERE active_admin.is_active
      AND lower(btrim(COALESCE(active_admin.role, ''))) = 'superadmin'
  ) <= 1 THEN
    RAISE EXCEPTION 'Minimal satu akun Admin aktif harus dipertahankan.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.mastusr
  SET nama_lengkap = v_name,
      jabatan = v_name,
      role = v_role,
      id_sekolah = v_school,
      is_active = p_is_active
  WHERE idpemakai = v_target;
  INSERT INTO public.spp_app_operator_codes (idpemakai, kode_operator, updated_at, updated_by)
  VALUES (v_target, v_code, now(), v_actor)
  ON CONFLICT (idpemakai) DO UPDATE
    SET kode_operator = EXCLUDED.kode_operator,
        updated_at = now(),
        updated_by = v_actor;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Kode operator sudah dipakai akun lain.' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_set_user_active_v1(
  p_username text,
  p_password text,
  p_idpemakai text,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_target text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('spp_app_user_management'));
  SELECT account.idpemakai INTO v_target
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_idpemakai, '')));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Pengguna tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Status pengguna tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF lower(btrim(v_target)) = lower(btrim(v_actor)) AND NOT p_is_active THEN
    RAISE EXCEPTION 'Akun Admin yang sedang digunakan tidak dapat diblokir.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_is_active AND EXISTS (
    SELECT 1 FROM public.mastusr account
    WHERE account.idpemakai = v_target
      AND account.is_active
      AND lower(btrim(COALESCE(account.role, ''))) = 'superadmin'
  ) AND (
    SELECT count(*) FROM public.mastusr active_admin
    WHERE active_admin.is_active
      AND lower(btrim(COALESCE(active_admin.role, ''))) = 'superadmin'
  ) <= 1 THEN
    RAISE EXCEPTION 'Minimal satu akun Admin aktif harus dipertahankan.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.mastusr SET is_active = p_is_active WHERE idpemakai = v_target;
END;
$function$;

CREATE OR REPLACE FUNCTION public.spp_app_reset_user_password_v1(
  p_username text,
  p_password text,
  p_idpemakai text,
  p_password_baru text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target text;
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  IF p_password_baru IS NULL
     OR char_length(p_password_baru) NOT BETWEEN 8 AND 128
     OR p_password_baru <> btrim(p_password_baru) THEN
    RAISE EXCEPTION 'Password harus 8–128 karakter tanpa spasi di awal atau akhir.'
      USING ERRCODE = '22023';
  END IF;
  SELECT account.idpemakai INTO v_target
  FROM public.mastusr account
  WHERE lower(btrim(account.idpemakai)) = lower(btrim(COALESCE(p_idpemakai, '')));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Pengguna tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mastusr
  SET password_hash = public.spp_app_hash_password(p_password_baru),
      password = ''
  WHERE idpemakai = v_target;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_user_accounts_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_create_user_v1(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_update_user_v1(text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_set_user_active_v1(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spp_app_reset_user_password_v1(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_user_accounts_v1(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_create_user_v1(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_update_user_v1(text, text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_set_user_active_v1(text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spp_app_reset_user_password_v1(text, text, text, text) TO anon, authenticated;

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
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
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

CREATE OR REPLACE FUNCTION public.spp_app_revenue_by_unit_v1(
  p_username text,
  p_password text,
  p_tahun text
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
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
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
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (
  kdsek text,
  dpp_tagihan numeric,
  dpp_terbayar numeric,
  spp_tl_tagihan numeric,
  spp_tl_terbayar numeric
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
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
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

CREATE OR REPLACE FUNCTION public.spp_app_revenue_dashboard_v1(
  p_username text,
  p_password text,
  p_tahun text
)
RETURNS TABLE (
  kdsek text,
  bulan date,
  target_spp_komp numeric,
  realisasi_spp_komp numeric,
  target_giat numeric,
  realisasi_giat numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_start integer;
  v_opening date;
  v_july date;
  v_next_july date;
BEGIN
  SELECT lower(COALESCE(m.role, 'unit')) INTO v_role
  FROM public.mastusr m
  WHERE lower(btrim(m.idpemakai)) = lower(btrim(COALESCE(p_username, '')))
    AND m.is_active
    AND public.spp_app_password_matches(p_password, m.password_hash);
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'yayasan') THEN
    RAISE EXCEPTION 'Akses laporan pemasukan ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;

  v_start := split_part(p_tahun, '-', 1)::integer;
  v_opening := make_date(v_start, 6, 1);
  v_july := make_date(v_start, 7, 1);
  v_next_july := make_date(v_start + 1, 7, 1);

  RETURN QUERY
  WITH periods AS (
    SELECT generate_series(v_opening, v_next_july - interval '1 month', interval '1 month')::date AS bulan
  ),
  enrollments AS (
    SELECT e.id_siswa, e.tahun_ajaran, e.kdsek, e.entry_type, e.spp, e.komp, e.giat, e.periode_masuk
    FROM public.spp_app_enrollments e
    JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun AND s.show_in_billing
  ),
  targets AS (
    SELECT e.kdsek, period.bulan,
      sum(CASE
        WHEN period.bulan < v_july THEN 0
        WHEN e.periode_masuk IS NOT NULL
          AND period.bulan < to_date(e.periode_masuk, 'MMYYYY') THEN 0
        WHEN e.entry_type = 'baru' AND e.periode_masuk IS NOT NULL
          AND period.bulan = to_date(e.periode_masuk, 'MMYYYY') THEN 0
        ELSE COALESCE(rate.spp, e.spp) + COALESCE(rate.komp, e.komp)
      END) AS target_spp_komp,
      sum(CASE
        WHEN period.bulan = v_opening
          AND NOT (
            e.entry_type = 'baru'
            AND e.periode_masuk IS NOT NULL
            AND to_date(e.periode_masuk, 'MMYYYY') >= v_july
          )
          THEN e.giat
        ELSE 0
      END) AS target_giat
    FROM enrollments e
    CROSS JOIN periods period
    LEFT JOIN LATERAL (
      SELECT h.spp, h.komp
      FROM public.spp_app_spp_history h
      WHERE h.id_siswa = e.id_siswa
        AND h.tahun_ajaran = e.tahun_ajaran
        AND h.effective_date <= period.bulan
      ORDER BY h.effective_date DESC
      LIMIT 1
    ) rate ON true
    GROUP BY e.kdsek, period.bulan
  ),
  payment_periods AS (
    SELECT b.kdsek, p.id_siswa, p.component, p.nominal,
      CASE
        WHEN p.periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN to_date(p.periode, 'MMYYYY')
        ELSE NULL
      END AS bulan
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE b.voided_at IS NULL
      AND b.source <> 'bos'
      AND b.kdsek IS NOT NULL
      AND p.component IN ('spp', 'komp', 'giat')
  ),
  eligible_payments AS (
    SELECT payment.kdsek, payment.component, payment.nominal, payment.bulan,
      enrollment.entry_type, enrollment.periode_masuk, enrollment.giat,
      COALESCE(rate.spp, enrollment.spp) AS spp_rate,
      COALESCE(rate.komp, enrollment.komp) AS komp_rate
    FROM payment_periods payment
    JOIN enrollments enrollment
      ON enrollment.id_siswa = payment.id_siswa
      AND enrollment.kdsek = payment.kdsek
    LEFT JOIN LATERAL (
      SELECT h.spp, h.komp
      FROM public.spp_app_spp_history h
      WHERE h.id_siswa = enrollment.id_siswa
        AND h.tahun_ajaran = enrollment.tahun_ajaran
        AND h.effective_date <= payment.bulan
      ORDER BY h.effective_date DESC
      LIMIT 1
    ) rate ON true
    WHERE payment.bulan IS NOT NULL
      AND payment.bulan >= v_opening
      AND payment.bulan < v_next_july
  ),
  realizations AS (
    SELECT payment.kdsek,
      CASE WHEN payment.component = 'giat' THEN v_opening ELSE payment.bulan END AS bulan,
      sum(payment.nominal) FILTER (WHERE payment.component IN ('spp', 'komp')) AS realisasi_spp_komp,
      sum(payment.nominal) FILTER (WHERE payment.component = 'giat') AS realisasi_giat
    FROM eligible_payments payment
    WHERE (
        payment.component = 'giat'
        AND payment.bulan >= v_opening
        AND payment.giat > 0
        AND NOT (
          payment.entry_type = 'baru'
          AND payment.periode_masuk IS NOT NULL
          AND to_date(payment.periode_masuk, 'MMYYYY') >= v_july
        )
      ) OR (
        payment.component IN ('spp', 'komp')
        AND payment.bulan >= v_july
        AND (
          payment.periode_masuk IS NULL
          OR payment.bulan >= to_date(payment.periode_masuk, 'MMYYYY')
        )
        AND NOT (
          payment.entry_type = 'baru'
          AND payment.periode_masuk IS NOT NULL
          AND payment.bulan = to_date(payment.periode_masuk, 'MMYYYY')
        )
        AND (
          (payment.component = 'spp' AND payment.spp_rate > 0)
          OR (payment.component = 'komp' AND payment.komp_rate > 0)
        )
      )
    GROUP BY payment.kdsek,
      CASE WHEN payment.component = 'giat' THEN v_opening ELSE payment.bulan END
  )
  SELECT COALESCE(target.kdsek, realization.kdsek),
    COALESCE(target.bulan, realization.bulan),
    COALESCE(target.target_spp_komp, 0),
    COALESCE(realization.realisasi_spp_komp, 0),
    COALESCE(target.target_giat, 0),
    COALESCE(realization.realisasi_giat, 0)
  FROM targets target
  FULL OUTER JOIN realizations realization
    ON realization.kdsek = target.kdsek AND realization.bulan = target.bulan
  ORDER BY 2, 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.spp_app_revenue_dashboard_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spp_app_revenue_dashboard_v1(text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.save_spp_catalog_settings(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_spp_catalog_settings(text, text, text, jsonb) TO anon, authenticated;

COMMIT;
