const express = require('express');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

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
    // Allow images and text files
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and text files are allowed'), false);
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

// Basic chatbot endpoint
app.post('/chatbot', async (req, res) => {
  const { message, apiKey } = req.body;

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

    const result = await model.generateContent(message);
    const response = result.response.text();

    res.json({ reply: response });
  } catch (error) {
    console.error('Chatbot error:', error);

    // Handle specific error types
    if (error.message.includes('API key')) {
      return res.status(401).json({
        error: 'Invalid API key',
        details: 'Please check your Gemini API key configuration'
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
    } else if (file.mimetype.startsWith('text/')) {
      const textContent = fileBuffer.toString('utf-8');
      prompt += `\n\nText file content:\n${textContent}`;
      parts = [prompt];
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
      } else if (file.mimetype.startsWith('text/')) {
        const textContent = fileBuffer.toString('utf-8');
        prompt += `\n\nFile: ${file.originalname}\n${textContent}`;
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
app.get('/api/status', (req, res) => {
  res.json({
    online: true,
    gemini: !!process.env.GEMINI_API_KEY,
    features: {
      chat: true,
      vision: true,
      fileUpload: true,
      multiFile: true
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
