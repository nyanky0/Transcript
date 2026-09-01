# 🎙️ LiveVoice AI — Live Transcribe & Multi-Model Router

Aplikasi web transkripsi audio secara *live / real-time* menggunakan mikrofon laptop/PC, dengan kemampuan berpindah model AI (*model switcher*) antara **Google Gemini Pro/Flash** dan **API CFRouter (DeepSeek V4 Flash, Qwen 3.8 Max, GLM, MiniMax, dll.)**.

---

## ✨ Fitur Utama

1. **📁 Unggah Berkas Audio (Audio File Upload & Transcribe)**:
   - Mendukung format: **MP3, WAV, M4A, WEBM, FLAC, OGG, AAC**.
   - Area Drag & Drop dengan pemutar audio bawaan (*HTML5 Audio Player*).
   - Opsi instruksi transkripsi:
     - **Transkrip Lengkap + Deteksi Pembicara (Speaker 1, 2) + Ringkasan**.
     - **Verbatim Presisi Kata per Kata**.
     - **Notula Rapat & Daftar Tugas (Action Items)**.
     - **Ringkasan Eksekutif Saja**.
   - Menggunakan Google Gemini Multimodal (`gemini-3.5-transcribe` / `gemini-3.5-flash-lite` / `gemini-3.7-flash`).

2. **📜 Riwayat Transkrip (History Management - IndexedDB Browser)**:
   - Tersimpan secara lokal dan aman di browser Anda seperti tab riwayat.
   - Menyimpan seluruh detail: Judul berkas / Sesi, Tanggal & Waktu, Durasi, Model AI yang dipakai, Teks transkrip lengkap, dan Hasil analisis AI.
   - Fitur pencarian (*Search / Filter*).
   - **Buka / Muat ke Editor**: Memuat kembali transkrip lama ke workspace live untuk diedit atau diolah lagi dengan AI.
   - **Salin & Unduh**: Ekspor cepat ke Markdown (`.md`), `.txt`, atau `.json`.
   - **Kelola & Hapus**: Hapus transkrip tertentu atau bersihkan semua riwayat secara manual kapan saja.

3. **🎙️ Multi-Audio Source (Mikrofon PC & Suara Desktop/Aplikasi)**:
   - **Pilihan Driver Mikrofon**: Deteksi otomatis semua perangkat input mikrofon (Realtek, USB Headset, Virtual Mic, dll.).
   - **Desktop / App Sound (System Audio)**: Menangkap suara dari:
     - 🌐 **Seluruh Desktop (Full Windows)**
     - 🪟 **Jendela Aplikasi Spesifik (OBS Studio, Zoom, Teams, Spotify, YouTube, VLC, dll.)**
   - **🔀 Mix Mode**: Merekam dan mentranskripsi suara Mikrofon Anda sekaligus suara lawan bicara / audio desktop secara bersamaan!

4. **⚡ Live Real-Time Transcription**:
   - Menampilkan teks kata demi kata secara instan di layar dengan latensi nol.
   - Pilihan bahasa: **Bahasa Indonesia (`id-ID`)**, **English (`en-US`)**, dan lainnya.
   - **Audio Canvas Visualizer**: Animasi frekuensi suara live + level volume.

5. **🔄 Model Switcher (Google AI & CFRouter)**:
   - **⭐ Kuota Besar 500 RPD**: `Gemini 3.5 Flash Lite` *(Default Utama)* & `Gemini 3.1 Flash Lite`
   - **🧠 Flagship & Penalaran Mendalam**: `Gemini 3.7 Flash`, `Gemini 3.6 Flash`, `Gemini 3.5 Flash`
   - **🎙️ Khusus Audio Transcribe (Unlimited RPD)**: `Gemini 3.5 Transcribe Live`, `Gemini 2.5 Flash Audio Dialog`
   - **⚡ CFRouter Models**: `DeepSeek V4 Flash`, `Qwen 3.8 Max`, `MiniMax M3`, `GLM 5.2`

3. **Dual Transcription Mode**:
   - **Realtime STT**: Live typing instan per kata + AI post-processing (polish, summarize, action items).
   - **Gemini Audio-In Native**: Merekam raw audio stream lalu mengirimkannya langsung ke Gemini 2.0 Flash Multimodal untuk transkripsi verbatim lengkap dengan pembagian speaker.

4. **AI Intelligence Hub**:
   - 🪄 **Rapikan & Perbaiki**: Memperbaiki tanda baca, huruf kapital, typo fonetik/salah dengar, dan membagi paragraf rapi.
   - 📄 **Ringkasan Eksekutif**: Membuat ringkasan eksekutif dan poin penting pembicaraan.
   - 📋 **Notula & Action Items**: Mengekstrak daftar tugas (*to-do list*), penanggung jawab, dan keputusan penting.
   - 💬 **Custom Prompt**: Memberikan instruksi bebas ke model terpilih.
   - ⚡ **Auto-Polish on Silence**: Otomatis merapikan kalimat setelah jeda hening berbicara.

5. **Ekspor & Utilitas**:
   - Salin ke clipboard dengan 1 klik.
   - Unduh transkrip dalam format `.txt`, `.md` (Markdown lengkap), atau `.json`.
   - Penyimpanan aman: API Key & preferensi disimpan secara lokal di browser (`localStorage`).

---

## 🚀 Cara Menjalankan Aplikasi

### Opsi 1: Klik Ganda `start.bat` (Windows)
Cukup klik ganda file [`start.bat`](file:///d:/Metrodata/Transcript/start.bat) di folder proyek ini. Browser Anda akan langsung terbuka di `http://localhost:3000`.

### Opsi 2: Menggunakan Terminal / PowerShell
Jalankan perintah berikut di folder proyek:
```bash
npx -y serve -l 3000 .
```
atau dengan Python:
```bash
python -m http.server 3000
```
Lalu buka browser (Google Chrome / Microsoft Edge) di:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ Panduan Konfigurasi API

1. Buka aplikasi dan klik tombol **"Pengaturan API"** di pojok kanan atas.
2. **Google Gemini**:
   - Masukkan API Key dari [Google AI Studio](https://aistudio.google.com/app/apikey).
3. **CFRouter / Custom API**:
   - Masukkan **API Base URL** (contoh: `https://api.your-router.com/v1` atau endpoint CFRouter Anda).
   - Masukkan **API Key** router Anda.
   - Masukkan nama custom model jika ingin model selain preset (seperti `deepseek-v4-flash-0731` atau `qwen3.8-max`).
4. Klik **"Simpan Pengaturan"**.
