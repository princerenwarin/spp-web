-- Resolve legacy desktop IDs during student imports to prevent duplicate enrollments.
-- Run after 048_zero_missing_historical_tariffs.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.import_students_v1(
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
  v_id text;
  v_map_key text;
  v_mapped_id text;
  v_no integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Import harus berisi 1 sampai 2000 baris.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_no := v_no + 1;
    BEGIN
      v_id := btrim(COALESCE(v_row->>'id_siswa', ''));
      v_map_key := COALESCE(NULLIF(btrim(COALESCE(v_row->>'source_id', '')), ''), v_id);
      IF v_map_key <> '' THEN
        v_mapped_id := NULL;
        SELECT mapping.id_siswa INTO v_mapped_id
        FROM public.spp_app_desktop_student_id_map mapping
        WHERE mapping.legacy_id = v_map_key;
        IF FOUND THEN
          v_row := jsonb_set(v_row, '{id_siswa}', to_jsonb(v_mapped_id), true);
          v_row := jsonb_set(v_row, '{jenis}', to_jsonb('naik'::text), true);
        END IF;
      END IF;
      v_results := v_results || public.spp_app_enroll(v_actor, v_row);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Baris %: %', v_no, SQLERRM USING ERRCODE = '22023';
    END;
  END LOOP;

  INSERT INTO public.spp_app_student_log (actor, action, detail)
  VALUES (v_actor, 'import_massal', jsonb_build_object('jumlah', v_no));
  RETURN v_results;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_students_v1(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students_v1(text, text, jsonb) TO anon, authenticated;

COMMIT;
