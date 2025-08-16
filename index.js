const express = require('express');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

dotenv.config(); // Load API key dari .env

const app = express();
app.use(express.json({ limit: '10mb' })); // Increased limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, text files, PDFs, and documents
    const allowedTypes = [
      'image/',
      'text/',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint', // .ppt
    ];

    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type) || file.mimetype === type);

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported. Allowed: images, text, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX`), false);
    }
  }
});

// Serve static files
app.use(express.static(__dirname));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function to get AI instance
function getAIInstance(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('No API key provided. Please set GEMINI_API_KEY environment variable or provide apiKey in request.');
  }
  return new GoogleGenerativeAI(key);
}

// Helper function to convert file to GenerativeAI format
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  };
}

// Helper function to extract text from different file types
async function extractTextFromFile(buffer, mimeType, originalName) {
  try {
    switch (mimeType) {
      case 'application/pdf':
        const pdfData = await pdfParse(buffer);
        return pdfData.text;

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await mammoth.extractRawText({buffer: buffer});
        return docxResult.value;

      case 'application/msword':
        // For older .doc files, we'll treat them as binary and let Gemini handle
        return `[Binary DOC file: ${originalName}]\n[Content extraction not available for legacy .doc format]`;

      default:
        if (mimeType.startsWith('text/')) {
          return buffer.toString('utf-8');
        }
        return null; // For images and other types
    }
  } catch (error) {
    console.error(`Error extracting text from ${mimeType}:`, error);
    return `[Error reading file: ${originalName}]`;
  }
}

// Demo responses for when API key is not available
function getDemoResponse(message) {
  const msg = message.toLowerCase();

  if (msg.includes('halo') || msg.includes('hai') || msg.includes('hello')) {
    return "Halo! 👋 Saya Aurora AI dalam mode demo. Saya adalah asisten virtual dengan tema langit aurora yang cantik! ✨\n\nUntuk mengaktifkan fitur penuh dengan AI Gemini, silakan masukkan API key yang valid di Settings (⚙️).";
  }

  if (msg.includes('siapa') && (msg.includes('kamu') || msg.includes('anda'))) {
    return "Saya Aurora AI! 🌌 Asisten virtual dengan tema aurora langit yang indah. Saat ini saya berjalan dalam mode demo.\n\nSaya dirancang untuk membantu Anda dengan berbagai pertanyaan dan tugas. Untuk pengalaman penuh, aktifkan API Gemini di pengaturan!";
  }

  if (msg.includes('bantuan') || msg.includes('help') || msg.includes('bisa')) {
    return "Dalam mode demo, saya bisa:\n\n🌟 Menjawab pertanyaan dasar\n💬 Berbincang ringan dengan Anda\n📱 Menunjukkan fitur PWA seperti multiple chat sessions\n🎤 Voice input/output\n📁 File upload (UI demo)\n📤 Export chat history\n🔍 Search messages\n\nUntuk AI responses yang sesungguhnya, masukkan API key Gemini yang valid!";
  }

  if (msg.includes('aurora') || msg.includes('cantik') || msg.includes('indah')) {
    return "Terima kasih! 😊 Tema aurora langit memang dirancang khusus untuk memberikan pengalaman visual yang memukau. Aurora adalah fenomena cahaya alami yang terjadi di langit kutub - sama seperti aplikasi ini yang menghadirkan keajaiban teknologi AI! 🌌✨";
  }

  if (msg.includes('api') && msg.includes('key')) {
    return "Untuk mendapatkan API key Gemini:\n\n1. 🌐 Kunjungi https://makersuite.google.com/app/apikey\n2. 🔑 Buat API key baru untuk Gemini\n3. ⚙️ Buka Settings di aplikasi ini\n4. 📝 Masukkan API key Anda\n5. 💾 Simpan pengaturan\n\nSetelah itu, saya akan bisa memberikan response AI yang sesungguhnya dari Google Gemini!";
  }

  if (msg.includes('fitur') || msg.includes('fungsi')) {
    return "🎉 Fitur Aurora AI PWA:\n\n📱 **Progressive Web App**\n   • Install ke device\n   • Offline capability\n   • Push notifications\n\n💬 **Chat Features**\n   • Multiple chat sessions\n   • Voice input/output\n   • File upload & vision\n   • Search chat history\n\n🎨 **Aurora Theme**\n   • Beautiful sky gradients\n   • Responsive design\n   • Dark/light mode\n\n⚙️ **Customizable**\n   • API key management\n   • Voice language settings\n   • Export options";
  }

  if (msg.includes('terima kasih') || msg.includes('thanks')) {
    return "Sama-sama! 😊 Senang bisa membantu Anda menjelajahi Aurora AI. Meski dalam mode demo, saya harap Anda menikmati pengalaman PWA yang telah dirancang dengan penuh perhatian. ✨\n\nJangan lupa untuk mencoba fitur-fitur lainnya seperti voice input dan export chat!";
  }

  // Default response
  return `Saya mendengar Anda mengatakan: "${message}" 🌌\n\nDalam mode demo ini, saya memberikan response sederhana. Untuk mendapatkan jawaban AI yang lebih cerdas dan kontekstual dari Google Gemini, silakan konfigurasikan API key yang valid.\n\n💡 **Tips**: Coba tanyakan tentang "bantuan", "fitur", atau "api key" untuk informasi lebih lanjut!`;
}

// In-memory chat context storage (in production, use Redis or database)
const chatContexts = new Map();

// Helper function to get chat context
function getChatContext(chatId) {
  if (!chatContexts.has(chatId)) {
    chatContexts.set(chatId, []);
  }
  return chatContexts.get(chatId);
}

// Helper function to add message to context
function addToContext(chatId, role, content) {
  const context = getChatContext(chatId);
  context.push({ role, content });

  // Keep only last 20 messages to avoid token limit
  if (context.length > 20) {
    context.splice(0, context.length - 20);
  }
}

// Helper function to build context prompt
function buildContextPrompt(chatId, currentMessage) {
  const context = getChatContext(chatId);

  if (context.length === 0) {
    return currentMessage;
  }

  let contextPrompt = "Berikut adalah riwayat percakapan sebelumnya:\n\n";

  context.forEach((msg, index) => {
    const role = msg.role === 'user' ? 'User' : 'Aurora AI';
    contextPrompt += `${role}: ${msg.content}\n`;
  });

  contextPrompt += `\nUser: ${currentMessage}\n\nAurora AI:`;

  return contextPrompt;
}

// Basic chatbot endpoint
app.post('/chatbot', async (req, res) => {
  const { message, apiKey, chatId } = req.body;

  // Validate request
  if (!message) {
    return res.status(400).json({
      error: 'Message is required',
      details: 'Please provide a message in the request body'
    });
  }

  try {
    const genAI = getAIInstance(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build prompt with context if chatId provided
    let promptToSend = message;
    if (chatId) {
      promptToSend = buildContextPrompt(chatId, message);
    }

    const result = await model.generateContent(promptToSend);
    const response = result.response.text();

    // Add to context if chatId provided
    if (chatId) {
      addToContext(chatId, 'user', message);
      addToContext(chatId, 'assistant', response);
    }

    res.json({ reply: response });
  } catch (error) {
    console.error('Chatbot error:', error);

    // Check if it's an API key error - fall back to demo mode
    if (error.message.includes('API key') || error.status === 400) {
      console.log('🌟 Falling back to demo mode');
      const demoResponse = getDemoResponse(message);
      return res.json({
        reply: demoResponse + "\n\n---\n*🌟 Mode Demo - Untuk AI sesungguhnya, konfigurasikan API key Gemini di Settings*"
      });
    }

    if (error.message.includes('quota') || error.message.includes('limit')) {
      return res.status(429).json({
        error: 'API quota exceeded',
        details: 'Gemini API quota has been exceeded. Please try again later.'
      });
    }

    res.status(500).json({
      error: 'Error generating response',
      details: error.message
    });
  }
});

// File upload and vision endpoint
app.post('/chatbot/vision', upload.single('file'), async (req, res) => {
  const { message, apiKey } = req.body;
  const file = req.file;

  try {
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const genAI = getAIInstance(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.path);

    let prompt = message || 'Analyze this image and describe what you see.';
    let parts = [prompt];

    // Handle different file types
    if (file.mimetype.startsWith('image/')) {
      const imagePart = fileToGenerativePart(fileBuffer, file.mimetype);
      parts.push(imagePart);
    } else {
      // Extract text from document files (PDF, DOCX, TXT, etc.)
      const extractedText = await extractTextFromFile(fileBuffer, file.mimetype, file.originalname);
      if (extractedText) {
        prompt += `\n\nFile: ${file.originalname} (${file.mimetype})\nContent:\n${extractedText}`;
        parts = [prompt];
      } else {
        // For unsupported file types
        prompt += `\n\nFile: ${file.originalname} (${file.mimetype})\n[Unable to extract text content from this file type]`;
        parts = [prompt];
      }
    }

    const result = await model.generateContent(parts);
    const response = result.response.text();

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({ reply: response });
  } catch (error) {
    console.error('Vision error:', error);

    // Clean up file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      error: 'Error processing file',
      details: error.message
    });
  }
});

// Bulk file upload endpoint
app.post('/chatbot/files', upload.array('files', 5), async (req, res) => {
  const { message, apiKey } = req.body;
  const files = req.files;

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const genAI = getAIInstance(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let prompt = message || 'Analyze these files and provide insights.';
    let parts = [prompt];

    // Process each file
    for (const file of files) {
      const fileBuffer = fs.readFileSync(file.path);

      if (file.mimetype.startsWith('image/')) {
        const imagePart = fileToGenerativePart(fileBuffer, file.mimetype);
        parts.push(imagePart);
      } else {
        // Extract text from document files
        const extractedText = await extractTextFromFile(fileBuffer, file.mimetype, file.originalname);
        if (extractedText) {
          prompt += `\n\n--- File: ${file.originalname} (${file.mimetype}) ---\n${extractedText}\n`;
        } else {
          prompt += `\n\n--- File: ${file.originalname} (${file.mimetype}) ---\n[Unable to extract text content]\n`;
        }
      }
    }

    // Update first part with accumulated text
    parts[0] = prompt;

    const result = await model.generateContent(parts);
    const response = result.response.text();

    // Clean up uploaded files
    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error('File cleanup error:', error);
      }
    });

    res.json({ reply: response });
  } catch (error) {
    console.error('Files processing error:', error);

    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('File cleanup error:', cleanupError);
        }
      });
    }

    res.status(500).json({
      error: 'Error processing files',
      details: error.message
    });
  }
});

// Share target endpoint for PWA sharing
app.post('/share-target', upload.single('files'), (req, res) => {
  const { title, text, url } = req.body;
  const file = req.file;

  // Redirect to main app with shared content as URL params
  const params = new URLSearchParams();
  if (title) params.append('title', title);
  if (text) params.append('text', text);
  if (url) params.append('url', url);
  if (file) {
    // For now, just indicate a file was shared
    params.append('file', 'shared');
    // Clean up the file
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error('File cleanup error:', error);
    }
  }

  res.redirect(`/?${params.toString()}`);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API status endpoint
app.get('/api/status', async (req, res) => {
  let geminiStatus = false;
  let demoMode = false;

  if (process.env.GEMINI_API_KEY) {
    try {
      // Test the API key with a simple request
      const testAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const testModel = testAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      // We won't actually make the request here to avoid quota usage
      geminiStatus = true;
    } catch (error) {
      console.log('API key test failed, using demo mode');
      demoMode = true;
    }
  } else {
    demoMode = true;
  }

  res.json({
    online: true,
    gemini: geminiStatus,
    demoMode: demoMode,
    features: {
      chat: true,
      vision: geminiStatus, // Only available with valid API key
      fileUpload: geminiStatus, // Only available with valid API key
      multiFile: geminiStatus, // Only available with valid API key
      demo: demoMode
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files (max 5)' });
    }
  }

  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌌 Aurora AI Server running on port ${PORT}`);
  console.log(`📱 PWA available at http://localhost:${PORT}`);
  console.log(`🔑 Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Not configured'}`);
});
