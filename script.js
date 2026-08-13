const passwords = {
  'Sy': 'Siren',
  'Hy': 'Hydro'
};

const supabaseUrl = 'https://oqtykphsftvlcxruskpu.supabase.co';
const supabaseAnonKey = 'sb_publishable_RG6RHZ_DW1aXnxt7qgeFVQ_O3GGMJgk';

let currentUser = localStorage.getItem('chatUser') || null;
let messages = [];
let supabaseClient = null;
let useRemoteStorage = false;

if (window.supabase && supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('PASTE_') && !supabaseAnonKey.includes('PASTE_')) {
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  useRemoteStorage = true;
}

function getLocalMessages() {
  try {
    const stored = localStorage.getItem('chatMessages');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

function saveLocalMessages() {
  localStorage.setItem('chatMessages', JSON.stringify(messages));
}

function setUser(userKey) {
  currentUser = userKey;
  localStorage.setItem('chatUser', userKey);
}

function clearUser() {
  currentUser = null;
  localStorage.removeItem('chatUser');
}

async function loadMessages() {
  if (useRemoteStorage && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true });

      if (!error && data) {
        messages = data;
        return;
      }
    } catch (e) {
      console.log('Remote load failed, using local');
    }
  }

  messages = getLocalMessages();
}

async function saveMessages() {
  if (useRemoteStorage && supabaseClient) {
    try {
      const { error } = await supabaseClient.from('messages').insert([
        {
          user: currentUser,
          text: messages[messages.length - 1].text,
          timestamp: messages[messages.length - 1].timestamp
        }
      ]);

      if (!error) {
        return;
      }
    } catch (e) {
      console.log('Remote save failed, using local');
    }
  }

  saveLocalMessages();
}

function subscribeToMessages() {
  if (!useRemoteStorage || !supabaseClient) {
    return;
  }

  try {
    supabaseClient
      .channel('messages-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          messages.push(payload.new);
          displayMessages();
        }
      )
      .subscribe();
  } catch (e) {
    console.log('Subscribe failed');
  }
}

function showChat() {
  const loginContainer = document.getElementById('loginContainer');
  const chatContainer = document.getElementById('chatContainer');

  if (!loginContainer || !chatContainer) return;

  loginContainer.classList.add('hidden');
  chatContainer.classList.remove('hidden');

  const friendName = currentUser === 'Sy' ? 'Hydro' : 'Siren';
  const friendNameEl = document.getElementById('friendName');
  if (friendNameEl) friendNameEl.textContent = friendName;

  displayMessages();
  const input = document.getElementById('messageInput');
  if (input) input.focus();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function displayMessages() {
  const messagesList = document.getElementById('messagesList');
  if (!messagesList) return;
  
  messagesList.innerHTML = '';

  messages.forEach((msg) => {
    const messageDiv = document.createElement('div');
    const isMine = msg.user === currentUser;
    messageDiv.className = 'message ' + (isMine ? 'sent' : 'received');

    const senderName = msg.user === 'Sy' ? 'Siren' : 'Hydro';

    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-sender">${senderName}</div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
        <div class="message-time">${renderTimestamp(msg.timestamp)}</div>
      </div>
    `;

    messagesList.appendChild(messageDiv);
  });

  messagesList.scrollTop = messagesList.scrollHeight;
}

async function login() {
  const passwordInput = document.getElementById('passwordInput');
  const errorMsg = document.getElementById('errorMsg');
  
  if (!passwordInput || !errorMsg) {
    console.error('Login elements not found');
    return;
  }
  
  const password = passwordInput.value.trim();
  
  console.log('Login attempt with:', password);
  console.log('Valid passwords:', Object.keys(passwords));

  if (!passwords[password]) {
    console.log('Invalid password');
    errorMsg.textContent = 'Invalid password';
    passwordInput.value = '';
    return;
  }

  console.log('Password valid, logging in as:', password);
  errorMsg.textContent = '';
  setUser(password);
  await loadMessages();
  showChat();
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  
  const text = input.value.trim();

  if (!text || !currentUser) {
    return;
  }

  const message = {
    user: currentUser,
    text,
    timestamp: new Date().toISOString()
  };

  messages.push(message);
  await saveMessages();
  input.value = '';
  displayMessages();
}

function handleLogout() {
  clearUser();
  const loginContainer = document.getElementById('loginContainer');
  const chatContainer = document.getElementById('chatContainer');
  const passwordInput = document.getElementById('passwordInput');
  const errorMsg = document.getElementById('errorMsg');
  
  if (loginContainer) loginContainer.classList.remove('hidden');
  if (chatContainer) chatContainer.classList.add('hidden');
  if (passwordInput) passwordInput.value = '';
  if (errorMsg) errorMsg.textContent = '';
}

function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  const loginBtn = document.getElementById('loginBtn');
  const passwordInput = document.getElementById('passwordInput');
  const logoutBtn = document.getElementById('logoutBtn');
  const sendBtn = document.getElementById('sendBtn');
  const messageInput = document.getElementById('messageInput');
  
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      console.log('Login button clicked');
      login();
    });
  } else {
    console.error('loginBtn not found');
  }
  
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        login();
      }
    });
  } else {
    console.error('passwordInput not found');
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
  
  if (messageInput) {
    messageInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        sendMessage();
      }
    });
  }
  
  console.log('Event listeners setup complete');
}

async function initApp() {
  console.log('Initializing app...');
  await loadMessages();
  subscribeToMessages();

  if (currentUser && passwords[currentUser]) {
    showChat();
  }
  console.log('App initialized');
}

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initApp();
  });
} else {
  setupEventListeners();
  initApp();
}

