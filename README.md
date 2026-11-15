# SPP Web App Starter

Aplikasi ini adalah starter web yang menggunakan Supabase sebagai backend untuk memindahkan sistem SPP desktop lama ke web.

## Struktur

- `index.html` — halaman utama aplikasi
- `styles.css` — styling UI
- `app.js` — logika login, dashboard, data siswa, dan pembayaran
- `config.js` — konfigurasi Supabase (`url` dan `anonKey`)

## Langkah setup

1. Buat project baru di Supabase.
2. Buka SQL Editor dan jalankan `../supabase/001_init_spp_schema.sql`. Jika belum pernah dijalankan, lanjutkan dengan `../supabase/005_legacy_mapping_upgrade.sql` agar kolom sekolah legacy dan tabel transaksi tersedia.
3. Jalankan `./supabase/007_legacy_login_rpc.sql`, lalu `./supabase/008_spp_catalog_settings.sql`, dan terakhir `./supabase/009_spp_school_classes.sql`. Migration `009` membuat pengaturan kelas per sekolah, ID VA sekolah dua digit, konfigurasi prefix bank, serta RPC untuk menyimpan perubahan katalog.
4. Di menu Sekolah, atur lalu simpan ID VA dua digit yang unik untuk semua sekolah aktif. Sekolah tanpa data siswa/transaksi dapat dihapus; sekolah yang sudah dipakai hanya dapat dinonaktifkan. Setelah itu, di menu Bank tambahkan prefix VA angka 5–50 digit dan aktifkan maksimal dua bank. Nomor VA siswa dibentuk dari `prefix bank + ID VA sekolah + ID siswa`.
5. Masukkan URL project dan anon key ke file `config.js`.
6. Buka `index.html` di browser, atau jalankan server lokal seperti:

   python -m http.server 8000

   lalu buka:

   http://localhost:8000

## Catatan

- Login legacy memverifikasi akun melalui RPC `login_mastusr`; browser tidak membaca tabel `mastusr` atau password secara langsung.
- Untuk sistem produksi lebih aman, sebaiknya migrasikan ke auth Supabase dan hapus password plaintext dari tabel legacy.
- Data sekolah dibaca dari `mastsek`, data siswa dari `mastspp`/`mastank`, dan transaksi dari `pembayaran`.
- Jalankan `./supabase/010_student_rules.sql` setelah 009 (backup dulu). Migration ini menyimpan data siswa (baru/naik kelas, no. SPP otomatis, riwayat SPP, log, import CSV) lewat RPC khusus Admin. Data siswa tetap terbaca dengan anon key.
- Jalankan `./supabase/011_student_selection_arrears.sql` setelah 010. Uang kegiatan/anak guru kini berlaku untuk siswa yang dicentang, dan ada input manual tagihan tahun lalu (tunggakan).
- Form siswa, Ubah SPP, kegiatan massal, anak guru, dan import CSV (bukan .xlsx) hanya untuk Admin dan ditulis ke Supabase. Login ulang sebagai Admin setelah deploy.
- Jalankan `./supabase/012_scalability.sql` setelah 011. Data dipaginasi 25 per halaman, dicari & dihitung di database (siap 5000+ siswa, 100rb transaksi), ada filter tahun ajaran.
- Pembayaran disimpan di Supabase (`spp_app_payments`) setelah migration 012; tanpa 012 hanya di browser.
- Jalankan `./supabase/013_student_edit_delete.sql` setelah 012: ubah nama siswa dan hapus massal data SPP siswa terpilih (ditolak jika masih ada pembayaran).

- Jalankan supabase/014_edit_all_fees.sql setelah 013: tombol **Ubah Tagihan** (modal) bisa mengubah DPP, DPS, Seragam, Kegiatan, SPP, dan Komputer; perubahan SPP/Komputer memakai periode berlaku.
