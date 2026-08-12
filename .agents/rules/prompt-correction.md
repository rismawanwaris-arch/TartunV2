---
description: Aturan untuk menginterpretasikan dan mengoreksi prompt pengguna agar selalu sesuai dengan standar kode (best practices) proyek.
always_on: true
---

# Aturan Interpretasi dan Koreksi Prompt

Ketika Anda menerima *prompt* atau instruksi dari pengguna, terapkan prinsip-prinsip berikut sebelum menulis kode:

1. **Fokus Pada Niat (Intent), Bukan Hanya Kata-kata Literal**: Pengguna mungkin menulis instruksi secara kasual, ambigu, atau tidak menggunakan istilah teknis yang tepat. Pahami *tujuan akhir* dari apa yang ingin mereka capai.
2. **Koreksi Otomatis ke Standar Proyek**: Jika pengguna meminta sesuatu yang bertentangan dengan aturan yang ada di `AGENTS.md` (misalnya: meminta menggunakan *callback* biasa untuk database, atau meminta menulis rute langsung di `server.js`), **jangan ikuti instruksi yang salah tersebut**. Alih-alih, koreksi dan tulis kode menggunakan standar yang benar (gunakan `async/await`, fungsi dari `db.js`, dan pisahkan di folder `routes/`).
3. **Terjemahkan ke Praktik Terbaik**: Terjemahkan permintaan informal pengguna menjadi kode Node.js yang aman, rapi, dan sesuai dengan arsitektur **Tartun V2**.
4. **Komunikasikan Penyesuaian Tersebut**: Jika Anda menyesuaikan instruksi pengguna agar sesuai standar, berikan penjelasan singkat. (Contoh: *"Saya menginterpretasikan permintaan Anda untuk mengambil data ini dengan menggunakan `db.getAsync` agar aman dan sesuai dengan standar struktur kode kita"*).

Aturan ini memastikan bahwa bagaimanapun gaya penulisan pengguna, hasil kode yang diberikan akan selalu berkualitas tinggi dan tidak merusak standar arsitektur proyek.
