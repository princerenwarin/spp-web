-- Read-only audit for students with the same name and enrollment who have
-- activity charges under different IDs. Requires migration 046 or later.
WITH enrollments AS (
  SELECT
    enrollment.id_siswa,
    enrollment.tahun_ajaran,
    enrollment.kdsek,
    enrollment.kdkls,
    enrollment.giat,
    enrollment.nospp,
    student.nama,
    lower(regexp_replace(btrim(student.nama), '[^[:alnum:]]', '', 'g')) AS name_key
  FROM public.spp_app_enrollments enrollment
  JOIN public.spp_app_students student
    ON student.id_siswa = enrollment.id_siswa
  WHERE enrollment.giat > 0
)
SELECT
  e1.id_siswa AS student_id_1,
  e2.id_siswa AS student_id_2,
  e1.nama AS name_1,
  e2.nama AS name_2,
  e1.tahun_ajaran,
  e1.kdsek,
  e1.kdkls,
  e1.giat AS activity_charge_1,
  e2.giat AS activity_charge_2,
  e1.giat + e2.giat AS combined_activity_charge,
  e1.nospp AS nospp_1,
  e2.nospp AS nospp_2,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.spp_app_desktop_student_id_map mapping
    WHERE (mapping.legacy_id = e1.id_siswa AND mapping.id_siswa = e2.id_siswa)
       OR (mapping.legacy_id = e2.id_siswa AND mapping.id_siswa = e1.id_siswa)
  ) THEN 'ID lama terpetakan'
    ELSE 'ID berbeda, data enrollment cocok'
  END AS possible_duplicate_source
FROM enrollments e1
JOIN enrollments e2
  ON e1.id_siswa < e2.id_siswa
 AND e1.tahun_ajaran = e2.tahun_ajaran
 AND e1.kdsek = e2.kdsek
 AND e1.kdkls = e2.kdkls
 AND e1.name_key = e2.name_key
WHERE e1.name_key <> ''
ORDER BY e1.tahun_ajaran, e1.kdsek, e1.kdkls, e1.id_siswa, e2.id_siswa;
