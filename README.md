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

- Jalankan supabase/015_full_billing_totals.sql setelah 014: total tagihan dashboard dan laporan mencakup SPP, Komputer, DPP, DPS, Kegiatan, Seragam, dan tunggakan tahun lalu. Daftar siswa menampilkan nominal per komponen serta riwayat transaksi secara terpisah.
- Jalankan `./supabase/016_payment_components_and_reporting.sql` setelah 015. Pembayaran baru disimpan sebagai satu atau beberapa alokasi komponen secara atomik. SPP dan Komputer bulanan otomatis dialokasikan mulai dari periode tertunggak paling lama; kelebihan pembayaran hanya dibawa ke periode berikutnya pada komponen yang sama. Pembayaran sebelum migration ini tetap berkategori `legacy`/belum dialokasikan dan tidak otomatis menutup tagihan.
- Form pembayaran menampilkan SPP dan Komputer bersama pada tiap periode. Pilihan periode mengisi nominal sesuai saldo; nominal dapat disesuaikan untuk cicilan, dan **Tambah periode berikutnya** otomatis memilih bulan selanjutnya. Periode dapat dipilih ulang secara manual.
- Jalankan `./supabase/017_payment_import_and_reporting_fix.sql` setelah 016. Migration ini memperbaiki error laporan tunggakan dan menambahkan RPC impor pembayaran yang tervalidasi serta atomik.
- Migration 016 menambahkan **Laporan Tunggakan per Kelas** dengan saldo per periode, rincian cicilan, tautan WhatsApp, dan surat yang dapat dicetak. Baris dengan pembayaran lama yang belum dialokasikan diberi peringatan dan tombol penagihannya ditahan sampai direkonsiliasi.
- Menu pembayaran mendukung impor `.xlsx`, `.xls`, dan `.csv`. Gunakan template yang disediakan; setiap siswa, komponen, dan periode ditinjau sebelum diimpor. Periode kosong disarankan dari tunggakan terlama, tanggal kosong memakai tanggal hari ini, dan satu file dibatasi 500 transaksi. Impor membutuhkan login Admin dan migration 017.
- Dashboard pemasukan bulanan per unit serta rekap DPP/SPP tahun lalu hanya ditampilkan untuk Admin dan Yayasan. Dashboard akun Unit hanya menampilkan jumlah murid; laporan Unit tetap menampilkan nominal. RPC dashboard memeriksa role di database, bukan hanya menyembunyikan elemen UI.
- Jalankan `./supabase/018_payment_receipts_bos_and_reconciliation.sql` setelah 017. Migration ini mengelompokkan rincian menjadi satu transaksi/slip, menambah kode operator, alokasi BOS, rekap harian, dan koreksi pembatalan yang wajib beralasan. Backup data sebelum menjalankan migration.
- Jalankan `./supabase/019_two_month_billing_horizon.sql` setelah 018 untuk mengizinkan periode laporan tagihan sampai dua bulan setelah bulan aktif, dengan batas akhir Juni pada tahun ajaran yang dipilih. Periode awal pembayaran tetap mengikuti bulan masuk siswa; alokasi otomatis memilih saldo periode tertua.
- Jalankan `./supabase/020_card_print_tracking.sql` setelah 019, lalu `./supabase/021_card_print_cursor.sql`. Dialog **Cetak Kartu** menampilkan pratinjau langsung dari pembayaran yang dipilih, status cetak, dan posisi berikutnya yang tersimpan bersama per siswa, tahun ajaran, dan tabel kartu. Posisi kedua tabel dapat diatur terpisah ke baris berikutnya 1–16 melalui konfirmasi; cetakan lama tetap diarsipkan dan transaksi tersedia kembali untuk dipilih pada putaran baru. Pilihan yang sudah dicetak hanya dicetak ulang pada baris baru; setiap tabel memiliki batas 16 baris.
- Jalankan `./supabase/022_academic_year_cutoff_and_lifetime_fees.sql` setelah 021. Admin dapat menutup tahun ajaran secara manual setelah Juni; sisa SPP/Komputer berpindah satu kali ke tunggakan tahun lalu dengan rincian per periode, dan tunggakan dari tahun-tahun sebelumnya tetap terakumulasi. DPP, DPS, dan Seragam memakai saldo sepanjang masa per anak dan tidak ditagih ulang saat naik kelas.
- Untuk mencetak dengan konfirmasi printer/preview Chrome, jalankan `cetak-kartu-senyap.bat` atau buka aplikasi di Chrome biasa. Launcher tetap memakai profil cetak khusus, tetapi tidak lagi mengaktifkan mode senyap. Tutup semua jendela Chrome khusus cetak sebelum menjalankan ulang launcher agar proses lama yang masih memakai mode senyap tidak digunakan kembali; pilih printer dan periksa ukuran kertas 214 × 162 mm sebelum mencetak.
- Pembayaran manual dan impor mencetak satu slip per transaksi bergaya kuitansi: nomor dan tanggal, nama siswa dan kelas, komponen beserta periode, total terbilang, kode operator, serta ruang tanda tangan. Slip koreksi mencatat alasan dan referensi bukti asal; pembayaran tidak dihapus permanen. Data pembayaran lama ditandai `Riwayat lama` karena sumber manual/impor sebelumnya tidak tercatat.
- Tanggal uang masuk dapat berbeda dari waktu input/unggah. Layar rekap harian menampilkan ringkasan sumber manual, impor, BOS, dan riwayat lama. Laporan cetak memuat rincian per kuitansi dan siswa, dikelompokkan menurut sekolah lalu diurutkan dari kelas terkecil, dengan nominal per komponen, potongan BOS, total diterima, dan keterangan. Laporan dicetak dalam orientasi lanskap; BOS mengurangi net penerimaan orang tua. Operator mengatur kode unik melalui menu **Operator**.
- Kolom BOS tersedia pada setiap baris SPP di form pembayaran. Nominal SPP adalah total yang ditutup; setelah nominal BOS diisi, penerimaan orang tua dihitung sebagai SPP dikurangi BOS. Rincian SPP dan BOS masuk dalam satu batch dan satu slip, sedangkan dashboard pemasukan unit hanya menghitung bagian orang tua.
- Untuk satu transaksi pendaftaran siswa baru, tambahkan DPP, DPS, seragam, kegiatan, serta SPP/Komputer bulan masuk dalam satu form. Periode tagihan dimulai dari periode masuk siswa, sehingga bulan itu tidak ditagih ulang sebelum tanggal masuk.
- Tombol **Cetak Kartu** tersedia di Data Siswa dan Riwayat Pembayaran. Pilih transaksi yang telah dibayar di dialog untuk melihat pratinjau baris dan nominal sebelum mencetak; nama siswa tidak dicetak pada kartu. Posisi cetak berikutnya disimpan bersama di Supabase per siswa/tahun ajaran dan terpisah untuk tabel bulanan/nonbulanan. Reset meminta konfirmasi dan nomor baris berikutnya, sedangkan pilihan pembayaran tetap dapat diatur melalui daftar centang. Kartu tetap tanpa menggambar ulang garis formulir; siapkan kertas khusus 214 × 162 mm dan cetak pada skala 100% tanpa header/footer.
- Jalankan `./supabase/024_reporting_exports_dashboard_targets.sql` setelah 023. Migration ini menambahkan pengurutan direktori berdasarkan nama sekolah/kelas dan RPC target dashboard. Grafik memakai periode tagihan Juni–Juni: target SPP+Komputer bulanan mengikuti tarif yang berlaku, sedangkan target dan realisasi Kegiatan ditempatkan pada Juni pembuka. Unduhan Data Siswa dan Tunggakan menghasilkan `.xlsx`; ekspor tunggakan mengikuti cakupan filter dan memisahkan saldo tunggakan dari pembayaran belum dialokasikan.
