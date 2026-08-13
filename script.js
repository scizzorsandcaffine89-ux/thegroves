import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const passwords = {
  'Sy': 'Siren',
  'Hy': 'Hydro'
};

const supabase = createClient(
'https://oqtykphsftvlcxruskpu.supabase.co',
'sb_publishable_RG6RHZ_DW1aXnxt7qgeFVQ_O3GGMJgk'
);

let currentUser = localStorage.getItem('chatUser') || null;
let messages = [];
let supabaseClient = null;
let useRemoteStorage = false;
let syncOk = null; // null = unknown, true = last remote op succeeded, false = it failed

// Messages stick around for about 3 days, then quietly age out.
const MESSAGE_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

const USER_COLORS = {
  Hy: '#5865f2', // blurple
  Sy: '#eb459e'  // pink
};

function userColor(userKey) {
  return USER_COLORS[userKey] || '#949ba4';
}

function updateSyncUI() {
  const dot = document.getElementById('syncDot');
  const banner = document.getElementById('connectionBanner');
  if (!dot || !banner) return;

  if (!useRemoteStorage) {
    dot.style.background = '#949ba4';
    dot.title = 'Local only — Supabase did not load on this device';
    banner.textContent = "Running on this device only right now — messages won't reach the other device until this reconnects.";
    banner.classList.remove('hidden');
    banner.classList.remove('banner-error');
  } else if (syncOk === false) {
    dot.style.background = '#f23f42';
    dot.title = 'Sync error — check console for details';
    banner.textContent = 'Sync error — the last message may not have reached the other device.';
    banner.classList.remove('hidden');
    banner.classList.add('banner-error');
  } else {
    dot.style.background = '#23a55a';
    dot.title = 'Synced';
    banner.classList.add('hidden');
  }
}

function isExpired(timestamp) {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > MESSAGE_LIFETIME_MS;
}

function pruneExpiredMessages() {
  const before = messages.length;
  messages = messages.filter((m) => !isExpired(m.timestamp));
  return messages.length !== before;
}

async function cleanupExpiredRemote() {
  if (!useRemoteStorage || !supabaseClient) return;

  const cutoff = new Date(Date.now() - MESSAGE_LIFETIME_MS).toISOString();
  try {
    const { error } = await supabaseClient.from('messages').delete().lt('created_at', cutoff);
    if (error) console.log('Remote cleanup error:', error.message);
  } catch (e) {
    console.log('Remote cleanup exception:', e.message);
  }
}

if (window.supabase && supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('PASTE_') && !supabaseAnonKey.includes('PASTE_')) {
  try {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    useRemoteStorage = true;
    console.log('Supabase initialized successfully');
  } catch (e) {
    console.log('Supabase init failed:', e);
    useRemoteStorage = false;
  }
} else {
  console.log('Supabase not available, using local storage only');
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
        .order('created_at', { ascending: true });

      if (!error && data) {
        messages = data.map((row) => ({
          user: row.sender,
          text: row.content,
          timestamp: row.created_at
        }));
        syncOk = true;
        pruneExpiredMessages();
        saveLocalMessages();
        cleanupExpiredRemote();
        updateSyncUI();
        return;
      }
      syncOk = false;
    } catch (e) {
      console.log('Remote load failed, using local');
      syncOk = false;
    }
  }

  messages = getLocalMessages();
  pruneExpiredMessages();
  saveLocalMessages();
  updateSyncUI();
}

async function saveMessages() {
  const messageToSave = messages[messages.length - 1];
  if (!messageToSave) return;

  // Always try Supabase first
  if (useRemoteStorage && supabaseClient) {
    try {
      console.log('Saving to Supabase:', messageToSave);
      const { error } = await supabaseClient.from('messages').insert([
        {
          sender: messageToSave.user,
          recipient: messageToSave.user== 'Sy' ? 'Hy' : 'Sy' ,
          content: messageToSave.text,
          created_at: messageToSave.timestamp
        }
      ]);

      if (error) {
        console.log('Supabase save error:', error.message);
        syncOk = false;
      } else {
        console.log('Message saved to Supabase successfully');
        syncOk = true;
      }
    } catch (e) {
      console.log('Supabase save exception:', e.message);
      syncOk = false;
    }
  }

  // Always save locally too
  saveLocalMessages();
  updateSyncUI();
}

function displayMessage(row) {
  messages.push({
    user: row.sender,
    text: row.content,
    timestamp: row.created_at
  });
  displayMessages();
}

function subscribeToMessages() {
  if (!useRemoteStorage || !supabaseClient) {
    return;
  }

  try {
    supabaseClient
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => displayMessage(payload.new)
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.log('Realtime channel issue:', status);
          syncOk = false;
          updateSyncUI();
        }
      });
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
  updateSyncUI();
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

  const visible = messages.filter((msg) => !isExpired(msg.timestamp));
  let lastUser = null;

  visible.forEach((msg) => {
    const senderName = msg.user === 'Sy' ? 'Siren' : 'Hydro';
    const color = userColor(msg.user);
    const grouped = msg.user === lastUser;
    lastUser = msg.user;

    const row = document.createElement('div');
    row.className = 'message-row' + (grouped ? ' grouped' : '');

    if (grouped) {
      row.innerHTML = `
        <div class="message-gutter"><span class="hover-time">${renderTimestamp(msg.timestamp)}</span></div>
        <div class="message-body">
          <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div class="message-gutter">
          <div class="message-avatar" style="background:${color}">${senderName.charAt(0)}</div>
        </div>
        <div class="message-body">
          <div class="message-meta">
            <span class="message-author" style="color:${color}">${senderName}</span>
            <span class="message-timestamp">${renderTimestamp(msg.timestamp)}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
      `;
    }

    messagesList.appendChild(row);
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

  // Keep aging messages out even if the tab is left open for a while.
  setInterval(() => {
    const changed = pruneExpiredMessages();
    if (changed) {
      saveLocalMessages();
      displayMessages();
    }
  }, 5 * 60 * 1000);

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

