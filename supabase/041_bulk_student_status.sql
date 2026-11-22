BEGIN;

CREATE OR REPLACE FUNCTION public.bulk_save_student_status_v1(
  p_username text,
  p_password text,
  p_ids text[],
  p_tahun_ajaran text,
  p_entry_type text,
  p_is_staff_child boolean,
  p_show_in_billing boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := public.spp_app_assert_admin(p_username, p_password);
  v_entry_type text := NULLIF(lower(btrim(COALESCE(p_entry_type, ''))), '');
  v_enrollment record;
  v_count integer := 0;
  v_distinct_count integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 2000
     OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih 1 sampai 2000 siswa.' USING ERRCODE = '22023';
  END IF;
  SELECT count(DISTINCT id) INTO v_distinct_count
  FROM unnest(p_ids) AS selected(id);
  IF v_distinct_count <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Daftar siswa terpilih tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_entry_type IS NULL AND p_is_staff_child IS NULL THEN
    RAISE EXCEPTION 'Pilih setidaknya satu status yang akan diubah.' USING ERRCODE = '22023';
  END IF;
  IF p_is_staff_child IS NULL AND p_show_in_billing IS NOT NULL THEN
    RAISE EXCEPTION 'Status tagihan tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF v_entry_type IS NOT NULL THEN
    IF v_entry_type NOT IN ('baru', 'naik') THEN
      RAISE EXCEPTION 'Status pendaftaran harus siswa baru atau naik/pindah kelas.' USING ERRCODE = '22023';
    END IF;
    IF p_tahun_ajaran IS NULL OR p_tahun_ajaran !~ '^[0-9]{4}-[0-9]{4}$'
       OR split_part(p_tahun_ajaran, '-', 2)::integer <> split_part(p_tahun_ajaran, '-', 1)::integer + 1 THEN
      RAISE EXCEPTION 'Pilih satu tahun ajaran yang valid.' USING ERRCODE = '22023';
    END IF;

    FOR v_enrollment IN
      SELECT e.id_siswa, e.entry_type
      FROM public.spp_app_enrollments e
      WHERE e.id_siswa = ANY (p_ids)
        AND e.tahun_ajaran = p_tahun_ajaran
      ORDER BY e.id_siswa
      FOR UPDATE
    LOOP
      v_count := v_count + 1;
      IF v_enrollment.entry_type IS DISTINCT FROM v_entry_type THEN
        UPDATE public.spp_app_enrollments
        SET entry_type = v_entry_type
        WHERE id_siswa = v_enrollment.id_siswa
          AND tahun_ajaran = p_tahun_ajaran;
        INSERT INTO public.spp_app_student_log (actor, action, id_siswa, detail)
        VALUES (v_actor, 'ubah_status_pendaftaran', v_enrollment.id_siswa, jsonb_build_object(
          'tahun_ajaran', p_tahun_ajaran,
          'entry_type_lama', v_enrollment.entry_type,
          'entry_type_baru', v_entry_type
        ));
      END IF;
    END LOOP;
    IF v_count <> cardinality(p_ids) THEN
      RAISE EXCEPTION 'Sebagian siswa tidak terdaftar pada tahun ajaran yang dipilih. Tidak ada perubahan yang disimpan.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_is_staff_child IS NOT NULL THEN
    PERFORM public.bulk_set_staff_child_v1(
      p_username,
      p_password,
      p_ids,
      p_is_staff_child,
      p_show_in_billing
    );
  END IF;

  RETURN CASE WHEN v_entry_type IS NOT NULL THEN v_count ELSE cardinality(p_ids) END;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_save_student_status_v1(
  text, text, text[], text, text, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_save_student_status_v1(
  text, text, text[], text, text, boolean, boolean
) TO anon, authenticated;

COMMIT;
