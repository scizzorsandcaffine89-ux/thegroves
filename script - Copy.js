const passwords = {
  Sy: 'Siren',
  Hy: 'Hydro'
};

const supabaseUrl = 'https://oqtykphsftvlcxruskpu.supabase.co';
const supabaseAnonKey = 'sb_publishable_RG6RHZ_DW1aXnxt7qgeFVQ_O3GGMJgk';

let currentUser = localStorage.getItem('chatUser') || null;
let messages = [];
let supabase = null;
let useRemoteStorage = false;

if (window.supabase && supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('PASTE_') && !supabaseAnonKey.includes('PASTE_')) {
  supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
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
  if (useRemoteStorage && supabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true });

    if (!error && data) {
      messages = data;
      return;
    }
  }

  messages = getLocalMessages();
}

async function saveMessages() {
  if (useRemoteStorage && supabase) {
    const { error } = await supabase.from('messages').insert([
      {
        user: currentUser,
        text: messages[messages.length - 1].text,
        timestamp: messages[messages.length - 1].timestamp
      }
    ]);

    if (!error) {
      return;
    }
  }

  saveLocalMessages();
}

function subscribeToMessages() {
  if (!useRemoteStorage || !supabase) {
    return;
  }

  supabase
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
}

function showChat() {
  const loginContainer = document.getElementById('loginContainer');
  const chatContainer = document.getElementById('chatContainer');

  loginContainer.classList.add('hidden');
  chatContainer.classList.remove('hidden');

  const friendName = currentUser === 'Sy' ? 'Siren' : 'You';
  document.getElementById('friendName').textContent = friendName;

  displayMessages();
  document.getElementById('messageInput').focus();
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
  messagesList.innerHTML = '';

  messages.forEach((msg) => {
    const messageDiv = document.createElement('div');
    const isMine = msg.user === currentUser;
    messageDiv.className = 'message ' + (isMine ? 'sent' : 'received');

    const senderName = msg.user === 'Sy' ? 'Siren' : 'You';

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
  const password = document.getElementById('passwordInput').value.trim();
  const errorMsg = document.getElementById('errorMsg');

  if (!passwords[password]) {
    errorMsg.textContent = 'Invalid password';
    document.getElementById('passwordInput').value = '';
    return;
  }

  errorMsg.textContent = '';
  setUser(password);
  await loadMessages();
  showChat();
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
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
  document.getElementById('loginContainer').classList.remove('hidden');
  document.getElementById('chatContainer').classList.add('hidden');
  document.getElementById('passwordInput').value = '';
  document.getElementById('errorMsg').textContent = '';
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('passwordInput').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    login();
  }
});

document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

async function initApp() {
  await loadMessages();
  subscribeToMessages();

  if (currentUser && passwords[currentUser]) {
    showChat();
  }
}

initApp();
