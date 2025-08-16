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
  try {
    const result = await model.generateContent(message);
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