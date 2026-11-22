-- Reset data operasional/tester.
-- Cadangkan database terlebih dahulu.
-- Konfirmasi: ganti [HAPUS_DATA_TESTER] menjadi teks tepat di bawah sebelum dijalankan.

DO $reset$
DECLARE
  v_confirm text := '[HAPUS_DATA_TESTER]';
  v_table text;
  v_student_id_max bigint := 0;
BEGIN
  IF v_confirm <> 'HAPUS_DATA_TESTER' THEN
    RAISE EXCEPTION 'Reset dibatalkan. Ganti placeholder dengan HAPUS_DATA_TESTER.';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'spp_app_activity_allocations',
    'spp_app_card_print_log',
    'spp_app_card_print_cursors',
    'spp_app_spp_history',
    'spp_app_arrears',
    'spp_app_payments',
    'spp_app_payment_batches',
    'spp_app_student_log',
    'spp_app_enrollments',
    'spp_app_students',
    'spp_app_year_cutoffs',
    'pembayaran'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', v_table);
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'spp_app_receipt_no_seq'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER SEQUENCE public.%I RESTART WITH 1', v_table);
    END IF;
  END LOOP;

  IF to_regclass('public.mastank') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(max(id::bigint), 0) FROM public.mastank WHERE id ~ ''^[0-9]{1,10}$'''
      INTO v_student_id_max;
  END IF;
  IF to_regclass('public.mastspp') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(max(id::bigint), 0)) FROM public.mastspp WHERE id ~ ''^[0-9]{1,10}$'''
      INTO v_student_id_max
      USING v_student_id_max;
  END IF;
  IF to_regclass('public.spp_app_student_id_seq') IS NOT NULL THEN
    PERFORM setval(
      'public.spp_app_student_id_seq',
      GREATEST(v_student_id_max, 1),
      v_student_id_max > 0
    );
  END IF;

  RAISE NOTICE 'Data operasional tester berhasil dihapus.';
END;
$reset$;
