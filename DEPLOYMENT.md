# Deployment Guide - Aurora AI Chatbot

## Deploy ke Vercel

### 1. Persiapan Repository
1. Push semua file ke repository GitHub/GitLab
2. Pastikan semua file sudah ter-commit dengan benar

### 2. Environment Variables di Vercel
**PENTING:** Setel environment variables berikut di Vercel Dashboard:

1. Login ke [Vercel Dashboard](https://vercel.com/dashboard)
2. Pilih project Anda
3. Masuk ke **Settings** > **Environment Variables**
4. Tambahkan variabel berikut:

```
Name: GEMINI_API_KEY
Value: [API key Gemini Anda]
```

```
Name: NODE_ENV
Value: production
```

### 3. Mendapatkan Gemini API Key
1. Kunjungi [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Login dengan akun Google Anda
3. Klik "Create API Key"
4. Copy API key yang dihasilkan
5. Paste ke environment variable `GEMINI_API_KEY` di Vercel

### 4. Deploy
1. Connect repository ke Vercel
2. Set build command: `npm install` (default)
3. Set output directory: `.` (default)
4. Deploy

### 5. Verifikasi Deployment
1. Akses URL production Anda
2. Test chat tanpa API key (harus masuk demo mode)
3. Set API key di Settings aplikasi
4. Test chat dengan API key (harus mendapat response dari Gemini)

## Troubleshooting

### Error: "❌ Terjadi kesalahan saat mengirim pesan"
**Penyebab umum:**
1. API key tidak diset di Vercel environment variables
2. API key tidak valid
3. Kuota Gemini API habis
4. Koneksi internet bermasalah

**Solusi:**
1. Periksa environment variables di Vercel Dashboard
2. Pastikan API key valid di Google AI Studio  
3. Periksa quota usage di Google AI Studio
4. Test koneksi internet

### Aplikasi Berjalan di Demo Mode
Ini normal jika:
- Belum set GEMINI_API_KEY di Vercel
- API key tidak valid
- Atau quota API habis

Demo mode tetap berfungsi untuk testing UI.

### Error 500 Internal Server Error
1. Check logs di Vercel Dashboard > Functions
2. Pastikan semua dependencies ter-install
3. Periksa environment variables

## Mode Demo vs Production

### Demo Mode (tanpa API key):
- ✅ UI berfungsi normal
- ✅ PWA features tersedia
- ✅ File upload UI (tanpa processing)
- ✅ Voice input/output
- ✅ Multiple chat sessions
- ✅ Export chat history
- ❌ AI responses dari Gemini (hanya demo responses)

### Production Mode (dengan API key):
- ✅ Semua fitur demo mode
- ✅ AI responses dari Google Gemini
- ✅ Image/document analysis
- ✅ Context-aware conversations
- ✅ Multiple file processing

## Best Practices

1. **Security**: Jangan commit API key ke repository
2. **Environment**: Gunakan environment variables untuk secrets
3. **Monitoring**: Monitor usage quota di Google AI Studio
4. **Backup**: Export chat history secara berkala
5. **Updates**: Update dependencies secara berkala

## Support

Jika masih ada masalah:
1. Check Vercel function logs
2. Check browser console untuk error
3. Test API key langsung di Google AI Studio
4. Pastikan semua environment variables sudah benar
