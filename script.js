// FinanceBot PWA Script
class FinanceBot {
    constructor() {
        this.chatbox = document.getElementById('chatbox');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.loading = document.getElementById('loading');
        
        this.initializeEventListeners();
        this.initializeQuickSuggestions();
        this.checkOnlineStatus();
    }

    initializeEventListeners() {
        // Send button click
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Enter key press
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Input validation
        this.userInput.addEventListener('input', () => {
            const isEmpty = this.userInput.value.trim() === '';
            this.sendBtn.disabled = isEmpty;
            this.sendBtn.style.opacity = isEmpty ? '0.5' : '1';
        });

        // Online/offline status
        window.addEventListener('online', () => this.handleOnlineStatus(true));
        window.addEventListener('offline', () => this.handleOnlineStatus(false));
    }

    initializeQuickSuggestions() {
        const suggestionBtns = document.querySelectorAll('.suggestion-btn');
        suggestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                this.userInput.value = text;
                this.sendMessage();
            });
        });
    }

    checkOnlineStatus() {
        this.handleOnlineStatus(navigator.onLine);
    }

    handleOnlineStatus(isOnline) {
        const statusClass = isOnline ? 'online' : 'offline';
        document.body.classList.remove('online', 'offline');
        document.body.classList.add(statusClass);

        if (!isOnline) {
            this.addMessage('system', '📵 Anda sedang offline. Beberapa fitur mungkin tidak tersedia.');
        }
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message) return;

        // Disable input while processing
        this.toggleInput(false);
        
        // Add user message
        this.addMessage('user', message);
        this.userInput.value = '';

        // Show typing indicator
        const typingIndicator = this.addTypingIndicator();

        try {
            // Check if online
            if (!navigator.onLine) {
                throw new Error('Tidak ada koneksi internet');
            }

            const response = await fetch('/chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            
            // Remove typing indicator
            this.removeTypingIndicator(typingIndicator);
            
            if (data.error) {
                this.addMessage('error', 'Terjadi kesalahan: ' + data.error);
            } else {
                this.addMessage('bot', data.reply);
            }

        } catch (error) {
            console.error('Chat error:', error);
            
            // Remove typing indicator
            this.removeTypingIndicator(typingIndicator);
            
            let errorMessage = 'Maaf, terjadi kesalahan saat memproses pesan Anda.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Permintaan timeout. Silakan coba lagi.';
            } else if (!navigator.onLine) {
                errorMessage = 'Tidak ada koneksi internet. Silakan periksa koneksi Anda dan coba lagi.';
            }
            
            this.addMessage('error', errorMessage);
        } finally {
            // Re-enable input
            this.toggleInput(true);
        }
    }

    addMessage(sender, text, isHTML = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `${sender}-message`;
        
        if (sender === 'user') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <p>${this.escapeHtml(text)}</p>
                </div>
                <div class="message-avatar">👤</div>
            `;
        } else if (sender === 'bot') {
            messageDiv.innerHTML = `
                <div class="message-avatar">🤖</div>
                <div class="message-content">
                    ${isHTML ? text : this.formatBotMessage(text)}
                </div>
            `;
        } else if (sender === 'error') {
            messageDiv.innerHTML = `
                <div class="message-avatar">⚠️</div>
                <div class="message-content">
                    <p style="color: #dc2626;">${this.escapeHtml(text)}</p>
                </div>
            `;
        } else if (sender === 'system') {
            messageDiv.innerHTML = `
                <div class="message-avatar">ℹ️</div>
                <div class="message-content">
                    <p style="color: #2563eb; font-style: italic;">${this.escapeHtml(text)}</p>
                </div>
            `;
        }

        this.chatbox.appendChild(messageDiv);
        this.scrollToBottom();
        
        return messageDiv;
    }

    addTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'bot-message typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        
        this.chatbox.appendChild(typingDiv);
        this.scrollToBottom();
        
        return typingDiv;
    }

    removeTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }

    formatBotMessage(text) {
        // Convert line breaks to paragraphs
        const paragraphs = text.split('\n').filter(p => p.trim());
        return paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleInput(enabled) {
        this.userInput.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
        
        if (enabled) {
            this.userInput.focus();
        }
    }

    scrollToBottom() {
        this.chatbox.scrollTop = this.chatbox.scrollHeight;
    }

    showLoading() {
        this.loading.style.display = 'block';
    }

    hideLoading() {
        this.loading.style.display = 'none';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FinanceBot();
});

// Add typing indicator styles
const style = document.createElement('style');
style.textContent = `
    .typing-indicator .message-content {
        padding: 1rem;
    }
    
    .typing-dots {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    
    .typing-dots span {
        width: 6px;
        height: 6px;
        background: #6b7280;
        border-radius: 50%;
        animation: typingDots 1.4s infinite;
    }
    
    .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
    }
    
    .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
    }
    
    @keyframes typingDots {
        0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
        }
        30% {
            transform: translateY(-10px);
            opacity: 1;
        }
    }
    
    .offline .send-btn {
        background: #9ca3af !important;
        cursor: not-allowed !important;
    }
    
    .offline #userInput {
        background: #f3f4f6 !important;
        color: #6b7280 !important;
    }
`;
document.head.appendChild(style);
