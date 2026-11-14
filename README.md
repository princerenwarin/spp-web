# SPP Web App Starter

Aplikasi ini adalah starter web yang menggunakan Supabase sebagai backend untuk memindahkan sistem SPP desktop lama ke web.

## Struktur

- `index.html` — halaman utama aplikasi
- `styles.css` — styling UI
- `app.js` — logika login, dashboard, data siswa, dan pembayaran
- `config.js` — konfigurasi Supabase (`url` dan `anonKey`)

## Langkah setup

1. Buat project baru di Supabase.
2. Buka SQL Editor dan jalankan file migrasi di folder `../supabase/001_init_spp_schema.sql`.
3. Masukkan URL project dan anon key ke file `config.js`.
4. Buka `index.html` di browser, atau jalankan server lokal seperti:

   python -m http.server 8000

   lalu buka:

   http://localhost:8000

## Catatan

- Aplikasi ini menggunakan login legacy yang membaca tabel `mastusr` dengan kolom `idpemakai` dan `password`.
- Untuk sistem produksi lebih aman, sebaiknya migrasikan ke auth Supabase dan hapus password plaintext dari tabel legacy.
- Data sekolah dari `mastsek`, data siswa dari `mastspp`, dan transaksi dari `tranhspp` sudah siap dipakai.
