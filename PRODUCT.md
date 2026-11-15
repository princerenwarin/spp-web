# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pengguna internal meliputi Admin, Yayasan, kepala sekolah, dan guru. Orang tua bukan pengguna aplikasi. Pengguna mencatat data dan pembayaran SPP serta membuat dan melihat laporan. Antarmuka saat ini menunjukkan akun Admin, Yayasan, dan akun dengan cakupan unit; pemetaan hak akses khusus kepala sekolah dan guru belum dipastikan.

## Product Purpose

Mencatat data siswa dan pembayaran SPP, lalu membuat laporan untuk kebutuhan pemantauan internal.

## Positioning

Mekanisme atau pembeda produk yang spesifik belum dikonfirmasi.

## Operating Context

Aplikasi digunakan dalam konteks sekolah yang mengelola siswa berdasarkan sekolah, kelas, dan tahun ajaran. Alur yang tersedia mencakup pencatatan siswa baru atau naik kelas, pengaturan tagihan, input pembayaran, dan peninjauan laporan.

## Capabilities and Constraints

- Antarmuka menyediakan dashboard, data siswa, input dan riwayat pembayaran, laporan ringkasan per sekolah, serta laporan rinci per siswa.
- Pengaturan siswa mencakup DPP, DPS, seragam, kegiatan, SPP, komputer, dan tunggakan tahun lalu. SPP dan komputer dapat diberlakukan mulai bulan tertentu agar bulan sebelumnya tidak berubah.
- Aplikasi menyediakan impor CSV dan template CSV, pengaturan massal untuk uang kegiatan dan status anak guru, serta log perubahan.
- Pengaturan Admin mencakup sekolah, kelas, dan virtual account. Nomor VA dibentuk dari prefix bank, ID VA sekolah, dan ID siswa; hingga dua prefix bank dapat aktif.
- Aplikasi web menggunakan Supabase untuk data operasional. Operasi data siswa dan pembayaran bergantung pada konfigurasi serta migration Supabase yang dijelaskan di README proyek.
- Akses orang tua tidak termasuk dalam cakupan pengguna yang dikonfirmasi.

## Brand Commitments

Antarmuka saat ini menggunakan nama “Laporan SPP” dan menyebut Yayasan Santo Dominikus Cimahi serta KSP. CU Karsa Kencana Mitra Sejahtera. Logo yang tersedia berada di `assets/kombinasi.png`, `assets/kkms.png`, dan `assets/yayasan.png`.

## Evidence on Hand

- Implementasi dan alur produk: `index.html`, `app.js`, dan `README.md` di proyek `spp-web`.
- Aset identitas yang tersedia: `assets/kombinasi.png`, `assets/kkms.png`, dan `assets/yayasan.png`.
- Detail pembentukan akun siswa dan aturan operasional juga tercatat di `aturan data siswa.txt` pada direktori induk proyek.
- Belum ada bukti testimonial, benchmark, atau klaim hasil yang dikonfirmasi; jangan mengarangnya.

## Product Principles

- Catat data siswa dan transaksi pembayaran secara konsisten.
- Sajikan laporan yang membantu pemantauan internal lintas sekolah dan per siswa.
- Pertahankan histori tagihan dan pembayaran ketika tarif berubah.
- Batasi pengalaman produk pada pengguna internal yang telah dikonfirmasi.
