-- Remove legacy signatures that conflict with the newer defaulted payment-method arguments.
BEGIN;

DROP FUNCTION IF EXISTS public.save_payment_batch_v1(text, text, text, date, jsonb);
DROP FUNCTION IF EXISTS public.save_payment_batch_v2(text, text, text, text, date, jsonb);

NOTIFY pgrst, 'reload schema';

COMMIT;
