// Aurora AI Chat - PWA JavaScript
class AuroraAI {
    constructor() {
        this.currentChatId = null;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.settings = this.loadSettings();
        
        this.init();
    }

    async init() {
        await this.initIndexedDB();
        this.setupEventListeners();
        this.setupVoiceRecognition();
        this.loadChatSessions();
        this.createNewChat();
        this.updateOnlineStatus();
        
        console.log('🌌 Aurora AI initialized successfully!');
    }

    // IndexedDB Management
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AuroraAI', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Chat sessions store
                if (!db.objectStoreNames.contains('chatSessions')) {
                    const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
                    chatStore.createIndex('timestamp', 'timestamp', { unique: false });
                    chatStore.createIndex('title', 'title', { unique: false });
                }
                
                // Messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                    messageStore.createIndex('chatId', 'chatId', { unique: false });
                    messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async saveToIndexedDB(storeName, data) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        return store.put(data);
    }

    async getFromIndexedDB(storeName, key) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllFromIndexedDB(storeName, indexName, indexValue) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            let request;
            if (indexName && indexValue) {
                const index = store.index(indexName);
                request = index.getAll(indexValue);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFromIndexedDB(storeName, key) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        return store.delete(key);
    }

    // Chat Session Management
    async createNewChat() {
        const chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const chatSession = {
            id: chatId,
            title: 'New Chat',
            timestamp: Date.now(),
            messageCount: 0,
            lastMessage: '',
            isActive: true
        };

        // Deactivate other chats
        const allChats = await this.getAllFromIndexedDB('chatSessions');
        for (const chat of allChats) {
            chat.isActive = false;
            await this.saveToIndexedDB('chatSessions', chat);
        }

        await this.saveToIndexedDB('chatSessions', chatSession);
        this.currentChatId = chatId;
        this.clearChatContainer();
        this.showWelcomeMessage();
        this.loadChatSessions();
        this.updateChatHeader('New Chat');
    }

    async loadChatSessions() {
        const sessions = await this.getAllFromIndexedDB('chatSessions');
        const sortedSessions = sessions.sort((a, b) => b.timestamp - a.timestamp);
        
        const container = document.getElementById('chatSessions');
        container.innerHTML = '';
        
        for (const session of sortedSessions) {
            const sessionElement = this.createChatSessionElement(session);
            container.appendChild(sessionElement);
        }
    }

    createChatSessionElement(session) {
        const div = document.createElement('div');
        div.className = `chat-session-item ${session.isActive ? 'active' : ''}`;
        div.dataset.chatId = session.id;
        
        div.innerHTML = `
            <div class="session-title">${session.title}</div>
            <div class="session-preview">${session.lastMessage || 'No messages yet'}</div>
            <div class="session-meta">
                <span class="message-count">${session.messageCount} messages</span>
                <span class="session-time">${this.formatTime(session.timestamp)}</span>
            </div>
            <button class="delete-session" data-chat-id="${session.id}">🗑️</button>
        `;
        
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-session')) {
                this.switchToChat(session.id);
            }
        });
        
        const deleteBtn = div.querySelector('.delete-session');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteChat(session.id);
        });
        
        return div;
    }

    async switchToChat(chatId) {
        // Update active states
        const allChats = await this.getAllFromIndexedDB('chatSessions');
        for (const chat of allChats) {
            chat.isActive = (chat.id === chatId);
            await this.saveToIndexedDB('chatSessions', chat);
        }
        
        this.currentChatId = chatId;
        await this.loadChatMessages(chatId);
        this.loadChatSessions();
        
        const session = await this.getFromIndexedDB('chatSessions', chatId);
        this.updateChatHeader(session.title);
    }

    async deleteChat(chatId) {
        if (confirm('Are you sure you want to delete this chat?')) {
            await this.deleteFromIndexedDB('chatSessions', chatId);
            
            // Delete all messages for this chat
            const messages = await this.getAllFromIndexedDB('messages', 'chatId', chatId);
            for (const message of messages) {
                await this.deleteFromIndexedDB('messages', message.id);
            }
            
            // If this was the current chat, create a new one
            if (this.currentChatId === chatId) {
                await this.createNewChat();
            }
            
            this.loadChatSessions();
        }
    }

    // Message Management
    async loadChatMessages(chatId) {
        this.clearChatContainer();
        const messages = await this.getAllFromIndexedDB('messages', 'chatId', chatId);
        const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
        
        for (const message of sortedMessages) {
            this.displayMessage(message.sender, message.content, false);
        }
        
        this.scrollToBottom();
    }

    async saveMessage(chatId, sender, content) {
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const message = {
            id: messageId,
            chatId: chatId,
            sender: sender,
            content: content,
            timestamp: Date.now()
        };
        
        await this.saveToIndexedDB('messages', message);
        
        // Update chat session
        const session = await this.getFromIndexedDB('chatSessions', chatId);
        if (session) {
            session.messageCount++;
            session.lastMessage = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            session.timestamp = Date.now();
            
            // Auto-generate title from first user message
            if (sender === 'user' && session.title === 'New Chat') {
                session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            }
            
            await this.saveToIndexedDB('chatSessions', session);
            this.loadChatSessions();
            this.updateChatHeader(session.title);
        }
    }

    // Message Display
    displayMessage(sender, content, animate = true) {
        const chatContainer = document.getElementById('chatContainer');
        const welcomeMessage = document.getElementById('welcomeMessage');
        
        // Hide welcome message
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (animate) {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(20px)';
        }
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? '👤' : '🤖';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Process message content (markdown, links, etc.)
        contentDiv.innerHTML = this.processMessageContent(content);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        if (animate) {
            // Trigger animation
            requestAnimationFrame(() => {
                messageDiv.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                messageDiv.style.opacity = '1';
                messageDiv.style.transform = 'translateY(0)';
            });
        }
        
        this.scrollToBottom();
        
        // Auto-read if enabled and it's an AI message
        if (sender === 'ai' && this.settings.autoVoice) {
            this.speakText(content);
        }
    }

    processMessageContent(content) {
        // Simple markdown processing
        let processed = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        // Auto-link URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        processed = processed.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        return processed;
    }

    clearChatContainer() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.innerHTML = '';
        this.showWelcomeMessage();
    }

    showWelcomeMessage() {
        const chatContainer = document.getElementById('chatContainer');
        const welcomeDiv = document.createElement('div');
        welcomeDiv.id = 'welcomeMessage';
        welcomeDiv.className = 'welcome-message';
        
        welcomeDiv.innerHTML = `
            <div class="welcome-content">
                <div class="welcome-icon">🌌</div>
                <h3>Selamat datang di Aurora AI!</h3>
                <p>Saya adalah asisten AI dengan tema aurora langit yang siap membantu Anda. Mulai percakapan dengan mengetik pesan di bawah!</p>
                <div class="quick-actions">
                    <button class="quick-btn" data-message="Halo, apa kabar?">👋 Sapa Aurora</button>
                    <button class="quick-btn" data-message="Apa yang bisa kamu bantu?">❓ Bantuan</button>
                    <button class="quick-btn" data-message="Ceritakan tentang fitur-fiturmu">✨ Fitur</button>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(welcomeDiv);
        
        // Add event listeners to quick action buttons
        const quickBtns = welcomeDiv.querySelectorAll('.quick-btn');
        quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.dataset.message;
                document.getElementById('messageInput').value = message;
                this.sendMessage();
            });
        });
    }

    // Message Sending
    async sendMessage(files = null) {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();

        if ((!message && !files) || !this.currentChatId) return;

        // Display user message
        if (message) {
            this.displayMessage('user', message);
            await this.saveMessage(this.currentChatId, 'user', message);
        }

        // Display file info if files are attached
        if (files && files.length > 0) {
            const fileInfo = Array.from(files).map(f => `📎 ${f.name}`).join(', ');
            this.displayMessage('user', `Files: ${fileInfo}`);
            await this.saveMessage(this.currentChatId, 'user', `Files: ${fileInfo}`);
        }

        // Clear input
        input.value = '';
        this.updateCharCount();
        this.autoResizeTextarea();
        this.hideFileUploadArea();

        // Show typing indicator
        this.showTypingIndicator();

        try {
            let response;
            if (this.isOnline) {
                if (files && files.length > 0) {
                    response = await this.sendFilesToAPI(message, files);
                } else {
                    response = await this.sendToAPI(message);
                }
            } else {
                response = this.getOfflineResponse(message);
            }

            this.hideTypingIndicator();
            this.displayMessage('ai', response);
            await this.saveMessage(this.currentChatId, 'ai', response);

        } catch (error) {
            this.hideTypingIndicator();
            const errorMsg = this.isOnline ?
                'Maaf, terjadi kesalahan. Silakan coba lagi.' :
                'Mode offline: Fitur terbatas tersedia.';
            this.displayMessage('ai', errorMsg);
            console.error('Send message error:', error);
        }
    }

    async sendToAPI(message) {
        const apiKey = this.settings.apiKey || undefined;
        const payload = { message };

        if (apiKey) {
            payload.apiKey = apiKey;
        }

        const response = await fetch('/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.reply;
    }

    async sendFilesToAPI(message, files) {
        const apiKey = this.settings.apiKey || undefined;

        if (files.length === 1) {
            // Single file upload
            const formData = new FormData();
            formData.append('file', files[0]);
            formData.append('message', message || 'Analyze this file');

            if (apiKey) {
                formData.append('apiKey', apiKey);
            }

            const response = await fetch('/chatbot/vision', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || `HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.reply;
        } else {
            // Multiple files upload
            const formData = new FormData();

            for (const file of files) {
                formData.append('files', file);
            }

            formData.append('message', message || 'Analyze these files');

            if (apiKey) {
                formData.append('apiKey', apiKey);
            }

            const response = await fetch('/chatbot/files', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || `HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.reply;
        }
    }

    getOfflineResponse(message) {
        const msg = message.toLowerCase();
        
        // Simple offline responses
        if (msg.includes('halo') || msg.includes('hai') || msg.includes('hello')) {
            return "Halo! 👋 Saya Aurora AI dalam mode offline. Meski terbatas, saya masih bisa berbincang dengan Anda!";
        } else if (msg.includes('siapa') && msg.includes('kamu')) {
            return "Saya Aurora AI, asisten virtual dengan tema langit aurora. Saat ini offline tapi tetap siap membantu! ✨";
        } else if (msg.includes('bantuan') || msg.includes('help')) {
            return "Dalam mode offline, saya bisa:\n• Menjawab pertanyaan sederhana\n• Menyimpan riwayat chat\n• Memberikan motivasi\n• Berbincang ringan\n\nUntuk fitur lengkap, sambungkan ke internet ya! 🌐";
        } else if (msg.includes('terima kasih')) {
            return "Sama-sama! 😊 Senang bisa membantu meski dalam keterbatasan mode offline.";
        } else {
            return "Maaf, dalam mode offline kemampuan saya terbatas. Saya tetap menyimpan pesan Anda dan akan merespons lebih baik saat online! 🌌";
        }
    }

    // Voice Features
    setupVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = this.settings.voiceLang || 'id-ID';
            
            this.recognition.onstart = () => {
                this.isListening = true;
                this.updateVoiceButton();
                this.updateChatStatus('Mendengarkan...');
            };
            
            this.recognition.onend = () => {
                this.isListening = false;
                this.updateVoiceButton();
                this.updateChatStatus('Ready to help');
            };
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                document.getElementById('messageInput').value = transcript;
                this.updateCharCount();
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.updateChatStatus('Voice error: ' + event.error);
            };
        }
    }

    toggleVoiceRecognition() {
        if (!this.recognition) {
            alert('Voice recognition not supported in your browser');
            return;
        }
        
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    speakText(text) {
        if (this.synthesis) {
            // Cancel any ongoing speech
            this.synthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.settings.voiceLang || 'id-ID';
            utterance.rate = 0.9;
            utterance.pitch = 1;
            
            this.synthesis.speak(utterance);
        }
    }

    // UI Updates
    showTypingIndicator() {
        document.getElementById('typingIndicator').classList.remove('hidden');
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        document.getElementById('typingIndicator').classList.add('hidden');
    }

    updateChatHeader(title) {
        document.getElementById('chatTitle').textContent = title;
    }

    updateChatStatus(status) {
        document.getElementById('chatStatus').textContent = status;
    }

    updateVoiceButton() {
        const voiceBtn = document.getElementById('voiceBtn');
        const voiceToggle = document.getElementById('voiceToggle');
        
        if (this.isListening) {
            voiceBtn.innerHTML = '<span>🔴</span>';
            voiceToggle.innerHTML = '<span>🔴</span>';
        } else {
            voiceBtn.innerHTML = '<span>🎤</span>';
            voiceToggle.innerHTML = '<span>🎤</span>';
        }
    }

    updateCharCount() {
        const input = document.getElementById('messageInput');
        const counter = document.getElementById('charCount');
        counter.textContent = input.value.length;
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }

    scrollToBottom() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateOnlineStatus() {
        const indicator = document.getElementById('offlineIndicator');
        if (this.isOnline) {
            indicator.classList.add('hidden');
            this.updateChatStatus('Online - Ready to help');
        } else {
            indicator.classList.remove('hidden');
            this.updateChatStatus('Offline - Limited functionality');
        }
    }

    // File Upload Functions
    showFileUploadArea() {
        document.getElementById('fileUploadArea').classList.remove('hidden');
    }

    hideFileUploadArea() {
        const uploadArea = document.getElementById('fileUploadArea');
        uploadArea.classList.add('hidden');
        uploadArea.classList.remove('dragover');

        // Clear file input
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
    }

    handleFileSelect(files) {
        if (!files || files.length === 0) return;

        // Validate files
        const validFiles = Array.from(files).filter(file => {
            const isImage = file.type.startsWith('image/');
            const isText = file.type.startsWith('text/');
            const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB

            if (!isImage && !isText) {
                alert(`File ${file.name} is not supported. Only image and text files are allowed.`);
                return false;
            }

            if (!isValidSize) {
                alert(`File ${file.name} is too large. Maximum size is 10MB.`);
                return false;
            }

            return true;
        });

        if (validFiles.length > 5) {
            alert('Maximum 5 files allowed at once.');
            return;
        }

        if (validFiles.length > 0) {
            this.sendMessage(validFiles);
        }
    }

    // Search functionality
    async searchMessages(query) {
        if (!query.trim() || !this.currentChatId) return [];

        const messages = await this.getAllFromIndexedDB('messages', 'chatId', this.currentChatId);
        const lowercaseQuery = query.toLowerCase();

        return messages.filter(message =>
            message.content.toLowerCase().includes(lowercaseQuery)
        ).sort((a, b) => b.timestamp - a.timestamp);
    }

    async openSearchModal() {
        const modal = document.getElementById('searchModal');
        modal.classList.remove('hidden');

        const searchInput = document.getElementById('searchInput');
        searchInput.focus();

        searchInput.oninput = async (e) => {
            const query = e.target.value;
            const results = await this.searchMessages(query);
            this.displaySearchResults(results);
        };
    }

    displaySearchResults(results) {
        const container = document.getElementById('searchResults');

        if (results.length === 0) {
            container.innerHTML = '<p class="no-results">No messages found</p>';
            return;
        }

        container.innerHTML = results.map(result => `
            <div class="search-result-item" data-timestamp="${result.timestamp}">
                <div class="result-sender">${result.sender === 'user' ? '👤 You' : '🤖 Aurora AI'}</div>
                <div class="result-content">${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}</div>
                <div class="result-time">${this.formatTime(result.timestamp)}</div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.onclick = () => {
                // Jump to message (simplified - would need scroll to specific message)
                this.closeModal('searchModal');
            };
        });
    }

    // Settings Management
    loadSettings() {
        const defaultSettings = {
            apiKey: '',
            voiceLang: 'id-ID',
            autoVoice: false,
            notificationsEnabled: true,
            theme: 'aurora'
        };
        
        const saved = localStorage.getItem('aurora_settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    }

    saveSettings() {
        localStorage.setItem('aurora_settings', JSON.stringify(this.settings));
    }

    openSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        // Populate current settings
        document.getElementById('apiKeyInput').value = this.settings.apiKey || '';
        document.getElementById('voiceLang').value = this.settings.voiceLang;
        document.getElementById('autoVoice').checked = this.settings.autoVoice;
        document.getElementById('notificationsEnabled').checked = this.settings.notificationsEnabled;
        
        modal.classList.remove('hidden');
    }

    saveSettingsFromModal() {
        this.settings.apiKey = document.getElementById('apiKeyInput').value;
        this.settings.voiceLang = document.getElementById('voiceLang').value;
        this.settings.autoVoice = document.getElementById('autoVoice').checked;
        this.settings.notificationsEnabled = document.getElementById('notificationsEnabled').checked;
        
        this.saveSettings();
        
        // Update voice recognition language
        if (this.recognition) {
            this.recognition.lang = this.settings.voiceLang;
        }
        
        this.closeModal('settingsModal');
    }

    resetSettings() {
        if (confirm('Reset all settings to default?')) {
            localStorage.removeItem('aurora_settings');
            this.settings = this.loadSettings();
            this.openSettingsModal(); // Refresh modal
        }
    }

    // Export functionality
    async exportChats() {
        try {
            const sessions = await this.getAllFromIndexedDB('chatSessions');
            const allMessages = await this.getAllFromIndexedDB('messages');
            
            const exportData = {
                sessions: sessions,
                messages: allMessages,
                exportDate: new Date().toISOString(),
                version: '1.0.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `aurora-ai-chats-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    }

    // Utility functions
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
        
        return date.toLocaleDateString();
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Send message events
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Input events
        document.getElementById('messageInput').addEventListener('input', () => {
            this.updateCharCount();
            this.autoResizeTextarea();
        });
        
        // Voice events
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceRecognition());
        document.getElementById('voiceToggle').addEventListener('click', () => this.toggleVoiceRecognition());

        // File upload events
        document.getElementById('fileBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });

        // Drag and drop events for file upload area
        const uploadArea = document.getElementById('fileUploadArea');

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!uploadArea.contains(e.relatedTarget)) {
                uploadArea.classList.remove('dragover');
            }
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files);
        });

        uploadArea.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        // Global drag and drop for main chat area
        const chatContainer = document.getElementById('chatContainer');

        chatContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.showFileUploadArea();
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!uploadArea.contains(e.target)) {
                this.handleFileSelect(e.dataTransfer.files);
            }
        });
        
        // Chat management
        document.getElementById('newChatBtn').addEventListener('click', () => this.createNewChat());
        document.getElementById('clearChatBtn').addEventListener('click', () => {
            if (confirm('Clear current chat?')) {
                this.clearChatContainer();
            }
        });
        
        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettingsModal());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettingsFromModal());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        
        // Export
        document.getElementById('exportBtn').addEventListener('click', () => this.exportChats());

        // Search
        document.getElementById('searchBtn').addEventListener('click', () => this.openSearchModal());
        
        // Modal close events
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                modal.classList.add('hidden');
            });
        });
        
        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
        
        // Online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateOnlineStatus();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateOnlineStatus();
        });
        
        // PWA install prompt
        document.getElementById('installBtn').addEventListener('click', async () => {
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const choiceResult = await window.deferredPrompt.userChoice;
                window.deferredPrompt = null;
                document.getElementById('installPrompt').classList.add('hidden');
            }
        });
        
        document.getElementById('dismissInstall').addEventListener('click', () => {
            document.getElementById('installPrompt').classList.add('hidden');
        });
        
        // Mobile menu toggle
        const mobileToggle = document.getElementById('mobileMenuToggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('open');
            });
        }
    }
}

// Initialize Aurora AI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.auroraAI = new AuroraAI();
});

// PWA specific event handlers
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    document.getElementById('installPrompt').classList.remove('hidden');
});

// Export for global access
window.AuroraAI = AuroraAI;
