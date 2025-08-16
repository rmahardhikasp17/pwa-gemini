const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

sendButton.addEventListener('click', async () => {
  const message = userInput.value.trim();
  if (!message) return;

  // Tampilkan pesan user
  appendMessage('user', message);
  userInput.value = '';

  // Kirim ke server/backend
  try {
    const res = await fetch('/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (data.error) {
      appendMessage('bot', 'Error: ' + data.error);
    } else {
      appendMessage('bot', data.reply);
    }
  } catch (error) {
    appendMessage('bot', 'Error: ' + error.message);
  }
});

function appendMessage(sender, text) {
  const messageElement = document.createElement('div');
  messageElement.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
  messageElement.innerText = text;
  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}