# SPP Web App Starter

Aplikasi ini adalah starter web yang menggunakan Supabase sebagai backend untuk memindahkan sistem SPP desktop lama ke web.

## Struktur

- `index.html` — halaman utama aplikasi
- `styles.css` — styling UI
- `app.js` — logika login, dashboard, data siswa, dan pembayaran
- `config.js` — konfigurasi Supabase (`url` dan `anonKey`)

## Langkah setup

1. Buat project baru di Supabase.
2. Buka SQL Editor dan jalankan `../supabase/001_init_spp_schema.sql`, lalu `./supabase/007_legacy_login_rpc.sql`.
3. Jalankan `./supabase/008_spp_catalog_settings.sql` setelah migration `007`. Menu Sekolah dan Bank tersedia untuk akun dengan role `superadmin`.
4. Masukkan URL project dan anon key ke file `config.js`.
5. Buka `index.html` di browser, atau jalankan server lokal seperti:

   python -m http.server 8000

   lalu buka:

   http://localhost:8000

## Catatan

- Login legacy memverifikasi akun melalui RPC `login_mastusr`; browser tidak membaca tabel `mastusr` atau password secara langsung.
- Untuk sistem produksi lebih aman, sebaiknya migrasikan ke auth Supabase dan hapus password plaintext dari tabel legacy.
- Data sekolah dari `mastsek`, data siswa dari `mastspp`, dan transaksi dari `tranhspp` sudah siap dipakai.
