const express = require('express');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path'); // Tambahan baru

dotenv.config(); // Load API key dari .env

const app = express();
app.use(express.json()); // Biar bisa baca JSON dari request

app.use(express.static(__dirname)); // Tambahan baru: Serve static files
app.get('/', (req, res) => { // Tambahan baru: Handle GET /
  res.sendFile(path.join(__dirname, 'index.html'));
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Model Gemini sederhana

// Endpoint buat chatbot
app.post('/chatbot', async (req, res) => {
  const { message } = req.body;

  // Check if the message is finance-related
  const financeKeywords = [
    'keuangan', 'uang', 'tabungan', 'investasi', 'anggaran', 'budget', 'finansial',
    'finance', 'money', 'saving', 'investment', 'stock', 'saham', 'deposito',
    'kredit', 'hutang', 'cicilan', 'pinjaman', 'asuransi', 'dana darurat',
    'financial', 'bank', 'ekonomi', 'bisnis', 'profit', 'loss', 'modal',
    'passive income', 'reksadana', 'obligasi', 'crypto', 'cryptocurrency',
    'trading', 'forex', 'property', 'properti', 'pengeluaran', 'pemasukan',
    'cash flow', 'arus kas', 'retirement', 'pensiun', 'wealth', 'kekayaan'
  ];

  const isFinanceRelated = financeKeywords.some(keyword =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  // Simple additional check for common finance questions
  const financePatterns = [
    /bagaimana.*menabung/i,
    /cara.*investasi/i,
    /tips.*keuangan/i,
    /how.*save/i,
    /how.*invest/i,
    /financial.*advice/i,
    /money.*management/i,
    /berapa.*biaya/i,
    /harga.*saham/i,
    /rekomendasi.*investasi/i
  ];

  const hasFinancePattern = financePatterns.some(pattern => pattern.test(message));

  if (!isFinanceRelated && !hasFinancePattern) {
    return res.json({
      reply: "Maaf, saya hanya bisa membantu pertanyaan seputar keuangan. Silakan tanyakan tentang investasi, tabungan, budgeting, atau topik finansial lainnya."
    });
  }

  try {
    // Add finance context to the prompt
    const financePrompt = `Anda adalah asisten keuangan yang ahli. Jawab pertanyaan berikut tentang keuangan, investasi, tabungan, budgeting, atau manajemen uang dalam bahasa Indonesia yang mudah dipahami: ${message}`;

    const result = await model.generateContent(financePrompt);
    const response = result.response.text();
    res.json({ reply: response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generating response' });
  }
});

// Jalankan server di port 3000
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
