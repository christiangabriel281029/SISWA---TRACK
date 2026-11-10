# SISWA TRACK — paket awal website

Paket ini adalah fondasi aplikasi React yang responsif dan siap dikembangkan. Tampilan dashboard, login Supabase, daftar siswa, QR, scan kamera, absensi hari ini, peta GPS, dan ekspor CSV sudah disediakan.

## Penting sebelum dipakai
- Gunakan data uji terlebih dahulu, bukan NIK siswa sungguhan.
- Minta persetujuan sekolah dan pendampingan guru/pengelola data.
- Jangan pernah memasukkan `service_role` key ke frontend.
- QR berisi token acak, bukan NIK.
- GPS yang dicatat adalah lokasi perangkat pemindai, bukan lokasi pribadi siswa.
- Paket Supabase Free memiliki batas pemakaian; pantau dashboard Supabase.

## Menjalankan proyek
1. Ekstrak ZIP ini.
2. Pasang Node.js versi LTS di komputer, lalu buka terminal pada folder proyek.
3. Jalankan `npm install`.
4. Salin `.env.example` menjadi `.env`.
5. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari Supabase Project Settings → API.
6. Jalankan `npm run dev` untuk uji lokal, atau `npm run build` untuk memastikan build.

## Deploy gratis
Push folder proyek ke repository GitHub. Di Vercel, import repository tersebut, gunakan build command `npm run build`, output directory `dist`, lalu masukkan dua environment variable dari `.env`. Jangan commit file `.env`.

## Kecocokan database
Kode ini mengasumsikan tabel `profiles`, `students`, `student_private`, `attendance`, dan relasi FK yang dibuat pada proyek Supabase. `students` perlu memiliki kolom `student_code`, `full_name`, `qr_token`, `is_active`; `student_private` memiliki `student_id`, `nik`.

## Peringatan keamanan dan hal yang masih perlu dilengkapi
SQL yang sebelumnya dibuat di percakapan adalah aturan awal, bukan konfigurasi produksi yang telah diaudit. Sebelum data asli dipakai, perlu:
- meninjau ulang seluruh RLS, terutama hak update absensi Guru;
- memastikan `student_private` benar-benar hanya dapat diakses Admin;
- membatasi ALPA agar hanya dapat ditetapkan setelah batas waktu dan oleh petugas berwenang;
- menambahkan trigger audit otomatis untuk setiap perubahan absensi;
- menambahkan validasi sisi server untuk perubahan status dan pembuatan student_code;
- membuat proses pembuatan akun Guru hanya oleh Admin;
- menguji semua role memakai akun uji terpisah.

Aplikasi saat ini menyediakan alur dasar; fitur izin/sakit/Alpa, pengeditan data siswa, laporan bulanan/PDF, audit otomatis, dan kebijakan produksi masih memerlukan implementasi lanjutan. Jangan anggap aplikasi siap dipakai untuk absensi resmi sebelum semua pengujian tersebut selesai.
