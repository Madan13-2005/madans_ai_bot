// ===== CONFIGURATION =====
const API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'deepseek/deepseek-chat';
const BOT_NAME = 'Madan'; // Wake word name

// ===== STATE =====
let conversationHistory = [];
let isProcessing = false;
let isListening = false;
let voiceOutputEnabled = true;
let recognition = null;
let synthesis = window.speechSynthesis;
let currentMusic = null;

// ===== DOM ELEMENTS =====
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const statusText = document.getElementById('statusText');
const musicPlayer = document.getElementById('musicPlayer');
const musicTitle = document.getElementById('musicTitle');
const youtubeContainer = document.getElementById('youtubeContainer');
const youtubePlayer = document.getElementById('youtubePlayer');

// ===== LOG USER QUERY =====
function logQuery(query, type) {
  try {
    const logs = JSON.parse(localStorage.getItem('queryLogs') || '[]');
    logs.push({
      query: query,
      type: type,
      timestamp: new Date().toISOString()
    });
    if (logs.length > 500) {
      logs.splice(0, logs.length - 500);
    }
    localStorage.setItem('queryLogs', JSON.stringify(logs));
    console.log('Query logged:', query, type);
  } catch (e) {
    console.warn('Could not log query:', e);
  }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  userInput.addEventListener('input', autoResize);

  const savedTheme = localStorage.getItem('chatTheme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('themeIcon').className = 'fas fa-sun';
  }

  const savedVoice = localStorage.getItem('voiceOutput');
  if (savedVoice === 'false') {
    voiceOutputEnabled = false;
    document.getElementById('voiceIcon').className = 'fas fa-volume-mute';
  }

  initSpeechRecognition();
  loadHistory();
  userInput.focus();

  // Register Service Worker for PWA
  registerServiceWorker();
});

// ===== REGISTER SERVICE WORKER =====
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('ServiceWorker registered:', registration.scope);
        })
        .catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
    });
  }
}

// ===== PWA INSTALL PROMPT =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

function showInstallButton() {
  // Show install prompt toast
  showToast('📱 Tap to install MADAN AI app!');
}

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('App installed successfully!');
      }
      deferredPrompt = null;
    });
  }
}

// ===== INITIALIZE SPEECH RECOGNITION =====
function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('listening');
      micIcon.className = 'fas fa-waveform';
      statusText.textContent = '🎤 Listening...';
      showToast('Listening... Speak now!');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      userInput.value = transcript;

      if (event.results[event.results.length - 1].isFinal) {
        setTimeout(() => sendMessage(), 500);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
      if (event.error === 'not-allowed') {
        showToast('Microphone access denied. Please allow microphone.');
      } else {
        showToast('Voice recognition error. Try again.');
      }
    };

    recognition.onend = () => {
      stopListening();
    };
  } else {
    micBtn.style.display = 'none';
    console.warn('Speech recognition not supported');
  }
}

// ===== START VOICE INPUT =====
function startVoiceInput() {
  if (!recognition) {
    showToast('Voice input not supported in this browser');
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  try {
    recognition.start();
  } catch (e) {
    console.error('Error starting recognition:', e);
  }
}

// ===== STOP LISTENING =====
function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  micIcon.className = 'fas fa-microphone';
  statusText.textContent = 'Online • Ready to help';
}

// ===== SPEAK TEXT =====
function speak(text) {
  if (!voiceOutputEnabled || !synthesis) return;

  synthesis.cancel();

  let cleanText = text
    .replace(/[*_`#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[🎵🔍📺💬👋⏹️🕐📅]/g, '')
    .substring(0, 500);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = synthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Microsoft'));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  synthesis.speak(utterance);
}

// ===== TOGGLE VOICE OUTPUT =====
function toggleVoiceOutput() {
  voiceOutputEnabled = !voiceOutputEnabled;
  const icon = document.getElementById('voiceIcon');
  const btn = document.getElementById('voiceToggleBtn');

  if (voiceOutputEnabled) {
    icon.className = 'fas fa-volume-up';
    btn.classList.add('active');
    showToast('Voice output enabled');
  } else {
    icon.className = 'fas fa-volume-mute';
    btn.classList.remove('active');
    synthesis.cancel();
    showToast('Voice output disabled');
  }

  localStorage.setItem('voiceOutput', voiceOutputEnabled);
}

// ===== REMOVE WAKE WORD =====
function removeWakeWord(message) {
  const wakeWordPatterns = [
    /^(hey|hi|hello|ok|okay)\s+madan[,\s]*/i,
    /^madan[,\s]+/i,
    /^madan's ai[,\s]*/i,
    /^madan\s*/i
  ];

  let cleaned = message;
  for (const pattern of wakeWordPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim() || message.trim();
}

// ===== COMMAND DETECTION =====
function detectCommand(message) {
  const cleanedMessage = removeWakeWord(message);
  const lower = cleanedMessage.toLowerCase().trim();

  console.log('Original message:', message);
  console.log('Cleaned message:', cleanedMessage);

  // PLAY MUSIC
  if (lower.includes('play')) {
    const playIndex = lower.indexOf('play');
    let songName = cleanedMessage.substring(playIndex + 4).trim();
    songName = songName.replace(/^(song|music|the song|a song|me|for me)\s*/i, '').trim();
    songName = songName.replace(/\s*(song|for me|please)$/i, '').trim();

    if (songName && songName.length > 0) {
      return { type: 'play_music', data: songName };
    }
  }

  // Stop music
  if (lower.includes('stop') || lower.includes('pause') || lower.includes('turn off')) {
    if (lower.includes('music') || lower.includes('song') || lower.includes('playing') ||
      lower === 'stop' || currentMusic !== null) {
      return { type: 'stop_music' };
    }
  }

  // Search
  if (lower.includes('search') || lower.startsWith('google ')) {
    let query = lower.replace(/^(search|google)\s*/i, '').trim();
    query = query.replace(/\s*(for|on google|on the internet)$/i, '').trim();
    if (query) {
      return { type: 'search', data: query };
    }
  }

  // Open YouTube
  if (lower.includes('open youtube') || lower === 'youtube') {
    return { type: 'open_youtube' };
  }

  // Open Google
  if (lower.includes('open google') || lower === 'google') {
    return { type: 'open_google' };
  }

  // Time
  if (lower.includes('time') && (lower.includes('what') || lower.includes('current') || lower.includes('tell'))) {
    return { type: 'get_time' };
  }

  // Date
  if (lower.includes('date') || lower.includes('today') || lower.includes('what day')) {
    return { type: 'get_date' };
  }

  // Greeting
  if (message.toLowerCase().includes('madan') &&
    (lower.includes('hello') || lower.includes('hi') || lower.includes('hey'))) {
    return { type: 'greeting' };
  }

  // Who are you
  if (lower.includes('your name') || lower.includes('who are you') || lower.includes('what are you')) {
    return { type: 'introduce' };
  }

  return null;
}

// ===== EXECUTE COMMAND =====
async function executeCommand(command) {
  switch (command.type) {
    case 'play_music':
      return playMusic(command.data);
    case 'stop_music':
      return stopMusic();
    case 'search':
      window.open(`https://www.google.com/search?q=${encodeURIComponent(command.data)}`, '_blank');
      return `🔍 Searching for "${command.data}" on Google...`;
    case 'open_youtube':
      window.open('https://www.youtube.com', '_blank');
      return '📺 Opening YouTube...';
    case 'open_google':
      window.open('https://www.google.com', '_blank');
      return '🔍 Opening Google...';
    case 'get_time':
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `🕐 The current time is ${time}`;
    case 'get_date':
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `📅 Today is ${date}`;
    case 'greeting':
      return `👋 Hello! I'm ${BOT_NAME}'s AI, your personal assistant. How can I help you today?`;
    case 'introduce':
      return `I'm **${BOT_NAME}'s AI**, your personal voice assistant! You can call me by saying "Hey ${BOT_NAME}" followed by a command.`;
    default:
      return null;
  }
}

// ===== PLAY MUSIC =====
function playMusic(songName) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songName + ' song')}`;
  window.open(searchUrl, '_blank');

  currentMusic = songName;
  musicTitle.textContent = `🎵 ${songName}`;
  musicPlayer.classList.add('active');

  return `🎵 Playing "${songName}" on YouTube! Check the new tab.`;
}

// ===== STOP MUSIC =====
function stopMusic() {
  youtubeContainer.classList.remove('active');
  youtubePlayer.src = '';
  musicPlayer.classList.remove('active');
  currentMusic = null;
  musicTitle.textContent = 'No music playing';
  synthesis.cancel();
  showToast('Music stopped');
  return '⏹️ Music stopped.';
}

function closeMusicPlayer() {
  musicPlayer.classList.remove('active');
}

function closeYouTube() {
  youtubeContainer.classList.remove('active');
  youtubePlayer.src = '';
}

function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
}

function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function createMessageElement(content, isUser, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}${isError ? ' error-message' : ''}`;
  const avatarIcon = isUser ? 'fa-user' : 'fa-robot';

  messageDiv.innerHTML = `
    <div class="message-avatar">
      <i class="fas ${avatarIcon}"></i>
    </div>
    <div class="message-content">
      <div class="message-bubble">${isUser ? escapeHtml(content) : formatMarkdown(content)}</div>
      <span class="message-time">${formatTime(new Date())}</span>
    </div>
  `;

  return messageDiv;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMarkdown(text) {
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
  });
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
  formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  formatted = formatted.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  formatted = formatted.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  formatted = formatted.replace(/\n/g, '<br>');
  formatted = formatted.replace(/(<br>){3,}/g, '<br><br>');
  return formatted;
}

function showTyping() {
  typingIndicator.classList.add('active');
  chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTyping() {
  typingIndicator.classList.remove('active');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  const message = userInput.value.trim();

  if (message === '' || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;

  const userMessageEl = createMessageElement(message, true);
  chatBox.appendChild(userMessageEl);

  userInput.value = '';
  userInput.style.height = 'auto';
  chatBox.scrollTop = chatBox.scrollHeight;

  // Check for commands first
  const command = detectCommand(message);

  if (command) {
    // LOG THE COMMAND
    logQuery(message, 'command');

    showTyping();
    setTimeout(async () => {
      hideTyping();
      const response = await executeCommand(command);
      const botMessageEl = createMessageElement(response, false);
      chatBox.appendChild(botMessageEl);
      chatBox.scrollTop = chatBox.scrollHeight;
      speak(response);
      isProcessing = false;
      sendBtn.disabled = false;
      userInput.focus();
    }, 500);
    return;
  }

  // LOG THE QUESTION
  logQuery(message, 'question');

  conversationHistory.push({
    role: 'user',
    content: message
  });

  showTyping();

  try {
    const response = await callAI(message);
    hideTyping();
    const botMessageEl = createMessageElement(response, false);
    chatBox.appendChild(botMessageEl);
    speak(response);
    conversationHistory.push({
      role: 'assistant',
      content: response
    });
    saveHistory();
  } catch (error) {
    hideTyping();
    console.error('Error:', error);
    const errorMsg = `Sorry, I encountered an error: ${error.message}. Please try again.`;
    const errorMessage = createMessageElement(errorMsg, false, true);
    chatBox.appendChild(errorMessage);
    speak('Sorry, I encountered an error. Please try again.');
  }

  chatBox.scrollTop = chatBox.scrollHeight;
  isProcessing = false;
  sendBtn.disabled = false;
  userInput.focus();
}

// ===== CALL AI API =====
async function callAI(userMessage) {
  const systemPrompt = `You are ${BOT_NAME}'s AI, a helpful voice assistant.

RULES:
1. Give SHORT answers (under 100 words)
2. For MATH: Use Unicode symbols (x³, x², ∫, √)
3. NEVER use LaTeX like \\[ \\] or $ $
4. Be conversational - responses are spoken aloud`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-20)
  ];

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': window.location.href,
      'X-Title': 'MADAN AI Assistant'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      max_tokens: 500,
      temperature: 0.5,
      top_p: 0.9
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response from AI');
  }

  return data.choices[0].message.content;
}

function clearChat() {
  if (confirm('Are you sure you want to clear the chat history?')) {
    const welcomeMessage = chatBox.querySelector('.welcome-message');
    chatBox.innerHTML = '';
    if (welcomeMessage) {
      chatBox.appendChild(welcomeMessage);
    }
    conversationHistory = [];
    localStorage.removeItem('chatHistory');
    showToast('Chat cleared!');
  }
}

function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  const themeIcon = document.getElementById('themeIcon');
  themeIcon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
  localStorage.setItem('chatTheme', isLight ? 'light' : 'dark');
  showToast(`${isLight ? 'Light' : 'Dark'} theme activated!`);
}

function saveHistory() {
  try {
    localStorage.setItem('chatHistory', JSON.stringify(conversationHistory.slice(-50)));
  } catch (e) {
    console.warn('Could not save chat history:', e);
  }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
      conversationHistory = JSON.parse(saved);
      conversationHistory.forEach(msg => {
        const element = createMessageElement(msg.content, msg.role === 'user');
        chatBox.appendChild(element);
      });
      setTimeout(() => {
        chatBox.scrollTop = chatBox.scrollHeight;
      }, 100);
    }
  } catch (e) {
    console.warn('Could not load chat history:', e);
    conversationHistory = [];
  }
}
