BEGIN;

CREATE OR REPLACE FUNCTION public.save_student_status_v1(
  p_username text,
  p_password text,
  p_id_siswa text,
  p_tahun_ajaran text,
  p_entry_type text,
  p_entry_period text,
  p_is_staff_child boolean,
  p_show_in_billing boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_start integer;
  v_entry_date date;
BEGIN
  PERFORM public.spp_app_assert_admin(p_username, p_password);
  IF p_is_staff_child IS NULL THEN
    RAISE EXCEPTION 'Status anak guru/karyawan tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_tahun_ajaran IS NULL OR p_tahun_ajaran !~ '^[0-9]{4}-[0-9]{4}$'
     OR split_part(p_tahun_ajaran, '-', 2)::integer <> split_part(p_tahun_ajaran, '-', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_entry_period, '') !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Periode masuk tidak valid.' USING ERRCODE = '22023';
  END IF;
  v_start := split_part(p_tahun_ajaran, '-', 1)::integer;
  v_entry_date := to_date(p_entry_period, 'MMYYYY');
  IF v_entry_date NOT BETWEEN make_date(v_start, 7, 1) AND make_date(v_start + 1, 6, 1) THEN
    RAISE EXCEPTION 'Periode masuk harus berada dalam tahun ajaran.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.spp_app_payments p
    JOIN public.spp_app_payment_batches b ON b.id = p.batch_id
    WHERE p.id_siswa = p_id_siswa
      AND p.component IN ('spp', 'spp_bos', 'komp')
      AND CASE
        WHEN p.periode ~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN to_date(p.periode, 'MMYYYY')
        ELSE NULL
      END < v_entry_date
      AND b.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Periode masuk tidak boleh melewati pembayaran SPP/Komputer yang sudah tercatat.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.update_student_entry_status_v1(
    p_username,
    p_password,
    p_id_siswa,
    p_tahun_ajaran,
    p_entry_type,
    p_entry_period
  );

  PERFORM public.bulk_set_staff_child_v1(
    p_username,
    p_password,
    ARRAY[p_id_siswa],
    p_is_staff_child,
    CASE WHEN p_is_staff_child THEN COALESCE(p_show_in_billing, true) ELSE true END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_student_status_v1(
  text, text, text, text, text, text, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_student_status_v1(
  text, text, text, text, text, text, boolean, boolean
) TO anon, authenticated;

COMMIT;
