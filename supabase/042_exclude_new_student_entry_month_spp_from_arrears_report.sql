BEGIN;

CREATE OR REPLACE FUNCTION public.spp_app_class_billing_v1(
  p_tahun text,
  p_periode text,
  p_kdsek text DEFAULT NULL,
  p_kdkls text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id_siswa text,
  nospp text,
  nama text,
  kdsek text,
  kdkls text,
  no_wa text,
  billing jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
BEGIN
  IF p_tahun IS NULL OR p_tahun !~ '^[0-9]{4}-[0-9]{4}$'
     OR p_periode IS NULL OR p_periode !~ '^(0[1-9]|1[0-2])[0-9]{4}$' THEN
    RAISE EXCEPTION 'Tahun ajaran atau periode tidak valid.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id_siswa, e.nospp, s.nama, e.kdsek, e.kdkls, s.no_wa,
      e.entry_type, e.periode_masuk,
      public.spp_app_student_billing_v1(e.id_siswa, e.tahun_ajaran, p_periode) AS billing
    FROM public.spp_app_enrollments e
    JOIN public.spp_app_students s ON s.id_siswa = e.id_siswa
    WHERE e.tahun_ajaran = p_tahun
      AND (p_kdsek IS NULL OR e.kdsek = p_kdsek)
      AND (p_kdkls IS NULL OR e.kdkls = p_kdkls)
      AND NOT (s.is_staff_child AND NOT s.show_in_billing)
  ),
  entry_month_balance AS (
    SELECT candidates.*,
      COALESCE((
        SELECT (monthly_item.item->'spp'->>'sisa')::numeric
        FROM jsonb_array_elements(
          COALESCE(candidates.billing->'periode_bulanan', '[]'::jsonb)
        ) AS monthly_item(item)
        WHERE monthly_item.item->>'periode' = candidates.periode_masuk
        LIMIT 1
      ), 0) AS excluded_spp,
      COALESCE((
        SELECT (monthly_item.item->'komp'->>'sisa')::numeric
        FROM jsonb_array_elements(
          COALESCE(candidates.billing->'periode_bulanan', '[]'::jsonb)
        ) AS monthly_item(item)
        WHERE monthly_item.item->>'periode' = candidates.periode_masuk
        LIMIT 1
      ), 0) AS excluded_komp
    FROM candidates
  ),
  adjusted AS (
    SELECT entry_month_balance.id_siswa, entry_month_balance.nospp, entry_month_balance.nama,
      entry_month_balance.kdsek, entry_month_balance.kdkls, entry_month_balance.no_wa,
      CASE
        WHEN entry_month_balance.entry_type = 'baru'
          AND entry_month_balance.periode_masuk IS NOT NULL
        THEN jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                entry_month_balance.billing,
                '{sisa_spp}',
                to_jsonb(greatest(
                  COALESCE((entry_month_balance.billing->>'sisa_spp')::numeric, 0)
                    - entry_month_balance.excluded_spp,
                  0
                )),
                true
              ),
              '{sisa_komp}',
              to_jsonb(greatest(
                COALESCE((entry_month_balance.billing->>'sisa_komp')::numeric, 0)
                  - entry_month_balance.excluded_komp,
                0
              )),
              true
            ),
              '{sisa_total}',
              to_jsonb(greatest(
                COALESCE((entry_month_balance.billing->>'sisa_total')::numeric, 0)
                  - entry_month_balance.excluded_spp
                  - entry_month_balance.excluded_komp,
                0
              )),
              true
            ),
            '{periode_bulanan}',
            (
              SELECT COALESCE(jsonb_agg(
                CASE
                  WHEN monthly_item.item->>'periode' = entry_month_balance.periode_masuk
                  THEN jsonb_set(
                    jsonb_set(
                      monthly_item.item,
                      '{spp}',
                      jsonb_build_object(
                        'tagihan', 0,
                        'dibayar', 0,
                        'saldo_dibawa', 0,
                        'sisa', 0,
                        'status', '-'
                      ),
                      true
                    ),
                    '{komp}',
                    jsonb_build_object(
                      'tagihan', 0,
                      'dibayar', 0,
                      'saldo_dibawa', 0,
                      'sisa', 0,
                      'status', '-'
                    ),
                    true
                  )
                  ELSE monthly_item.item
                END
                ORDER BY monthly_item.ordinality
              ), '[]'::jsonb)
              FROM jsonb_array_elements(
                COALESCE(entry_month_balance.billing->'periode_bulanan', '[]'::jsonb)
              ) WITH ORDINALITY AS monthly_item(item, ordinality)
            ),
            true
        )
        ELSE entry_month_balance.billing
      END AS billing
    FROM entry_month_balance
  ),
  owing AS (
    SELECT adjusted.*
    FROM adjusted
    WHERE COALESCE((adjusted.billing->>'sisa_total')::numeric, 0) > 0
       OR COALESCE((adjusted.billing->>'belum_dialokasikan')::numeric, 0) > 0
  )
  SELECT owing.id_siswa, owing.nospp, owing.nama, owing.kdsek, owing.kdkls,
    owing.no_wa, owing.billing, count(*) OVER ()
  FROM owing
  ORDER BY lower(owing.nama), owing.id_siswa
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

COMMIT;
