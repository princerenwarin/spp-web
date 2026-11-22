-- Reset data operasional/tester.
-- Cadangkan database terlebih dahulu.
-- Konfirmasi: ganti [HAPUS_DATA_TESTER] menjadi teks tepat di bawah sebelum dijalankan.

DO $reset$
DECLARE
  v_confirm text := '[HAPUS_DATA_TESTER]';
  v_table text;
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
    'spp_app_student_id_seq',
    'spp_app_receipt_no_seq'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER SEQUENCE public.%I RESTART WITH 1', v_table);
    END IF;
  END LOOP;

  RAISE NOTICE 'Data operasional tester berhasil dihapus.';
END;
$reset$;
