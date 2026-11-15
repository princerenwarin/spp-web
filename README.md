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

- Jalankan supabase/015_full_billing_totals.sql setelah 014: total tagihan (dashboard, laporan, daftar siswa) mencakup SPP, Komputer, DPP, DPS, Kegiatan, Seragam, dan tunggakan tahun lalu; daftar siswa punya rincian per komponen.
- Jalankan `./supabase/016_payment_components_and_reporting.sql` setelah 015. Pembayaran baru disimpan sebagai satu atau beberapa alokasi komponen secara atomik. SPP dan Komputer bulanan otomatis dialokasikan mulai dari periode tertunggak paling lama; kelebihan pembayaran hanya dibawa ke periode berikutnya pada komponen yang sama. Pembayaran sebelum migration ini tetap berkategori `legacy`/belum dialokasikan dan tidak otomatis menutup tagihan.
- Jalankan `./supabase/017_payment_import_and_reporting_fix.sql` setelah 016. Migration ini memperbaiki error laporan tunggakan dan menambahkan RPC impor pembayaran yang tervalidasi serta atomik.
- Migration 016 menambahkan **Laporan Tunggakan per Kelas** dengan saldo per periode, rincian cicilan, tautan WhatsApp, dan surat yang dapat dicetak. Baris dengan pembayaran lama yang belum dialokasikan diberi peringatan dan tombol penagihannya ditahan sampai direkonsiliasi.
- Menu pembayaran mendukung impor `.xlsx`, `.xls`, dan `.csv`. Gunakan template yang disediakan; setiap siswa, komponen, dan periode ditinjau sebelum diimpor. Periode kosong disarankan dari tunggakan terlama, tanggal kosong memakai tanggal hari ini, dan satu file dibatasi 500 transaksi. Impor membutuhkan login Admin dan migration 017.
- Dashboard pemasukan bulanan per unit serta rekap DPP/SPP tahun lalu hanya ditampilkan untuk Admin dan Yayasan. Dashboard akun Unit hanya menampilkan jumlah murid; laporan Unit tetap menampilkan nominal. RPC dashboard memeriksa role di database, bukan hanya menyembunyikan elemen UI.
