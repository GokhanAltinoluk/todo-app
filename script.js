const SUPABASE_URL = 'https://fpmyvjkhbjvfqjoctlfy.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbXl2amtoYmp2ZnFqb2N0bGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTA1ODYsImV4cCI6MjA5MjM2NjU4Nn0.nSfdJhEBYkmAtedTaP0G9g4R_gwIXYL946maxKHgyo8';

const AUTH_URL  = `${SUPABASE_URL}/auth/v1`;
const TODOS_URL = `${SUPABASE_URL}/rest/v1/todos`;

// ── Session ──────────────────────────────────────────────
let session = JSON.parse(localStorage.getItem('sb_session') || 'null');

function saveSession(s) { session = s; localStorage.setItem('sb_session', JSON.stringify(s)); }
function clearSession()  { session = null; localStorage.removeItem('sb_session'); }

function authHeaders() {
  return {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${session?.access_token || ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.error_description || data?.message || data?.msg || 'Bir hata oluştu.');
  return data;
}

// ── Auth API ──────────────────────────────────────────────
async function signUp(email, password) {
  return apiFetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function signIn(email, password) {
  const data = await apiFetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveSession(data);
  return data;
}

async function signOut() {
  if (session) {
    await fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {});
  }
  clearSession();
}

async function exchangeToken(token, type) {
  const data = await apiFetch(`${AUTH_URL}/verify`, {
    method: 'POST',
    body: JSON.stringify({ token, type }),
  });
  if (data.access_token) saveSession(data);
  return data;
}

// ── Hash token handling (email confirmation redirect) ─────
async function handleHashTokens() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const params = Object.fromEntries(new URLSearchParams(hash));

  if (params.access_token && params.type === 'signup') {
    saveSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('confirmedBanner').classList.remove('hidden');
    return true; // confirmed, show auth screen so user can log in again
  }
  if (params.access_token) {
    saveSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    history.replaceState(null, '', window.location.pathname);
    return false; // already logged in
  }
  return false;
}

// ── Todos API ─────────────────────────────────────────────
let todos = [];
let filter = 'all';

async function loadTodos() {
  const data = await apiFetch(`${TODOS_URL}?order=created_at.asc`, {
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
  });
  todos = Array.isArray(data) ? data : [];
  render();
}

async function addTodo(text) {
  const headers = { ...authHeaders(), 'Prefer': 'return=representation' };
  const data = await apiFetch(TODOS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, done: false, user_id: session?.user?.id }),
  });
  todos.push(Array.isArray(data) ? data[0] : data);
  render();
}

async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  await apiFetch(`${TODOS_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ done: !todo.done }),
  });
  todo.done = !todo.done;
  render();
}

async function updateTodo(id, text) {
  await apiFetch(`${TODOS_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ text }),
  });
  todos.find(t => t.id === id).text = text;
  render();
}

async function removeTodo(id) {
  await apiFetch(`${TODOS_URL}?id=eq.${id}`, { method: 'DELETE' });
  todos = todos.filter(t => t.id !== id);
  render();
}

async function clearCompleted() {
  const ids = todos.filter(t => t.done).map(t => t.id);
  if (!ids.length) return;
  await apiFetch(`${TODOS_URL}?id=in.(${ids.join(',')})`, { method: 'DELETE' });
  todos = todos.filter(t => !t.done);
  render();
}

// ── Render ────────────────────────────────────────────────
function getVisible() {
  if (filter === 'active')    return todos.filter(t => !t.done);
  if (filter === 'completed') return todos.filter(t =>  t.done);
  return todos;
}

function render() {
  const visible = getVisible();
  const list = document.getElementById('todoList');
  list.innerHTML = '';

  if (!visible.length) {
    const li = document.createElement('li');
    li.className = 'empty-msg';
    li.textContent = filter === 'completed' ? 'Tamamlanan görev yok.'
                   : filter === 'active'    ? 'Aktif görev yok.'
                   : 'Henüz görev eklenmedi.';
    list.appendChild(li);
  } else {
    visible.forEach(t => list.appendChild(buildItem(t)));
  }

  const activeCount = todos.filter(t => !t.done).length;
  document.getElementById('remaining').textContent = `${activeCount} görev kaldı`;
  document.getElementById('clearCompleted').style.display =
    todos.some(t => t.done) ? 'inline' : 'none';
}

function buildItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' completed' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = todo.done;
  cb.addEventListener('change', () => toggleTodo(todo.id));

  const span = document.createElement('span');
  span.className = 'todo-text';
  span.textContent = todo.text;
  span.title = 'Düzenlemek için çift tıkla';
  span.addEventListener('dblclick', () => startEdit(span, todo.id));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit'; editBtn.textContent = '✎'; editBtn.title = 'Düzenle';
  editBtn.addEventListener('click', () => startEdit(span, todo.id));

  const mood = document.createElement('span');
  mood.className = 'todo-mood';
  mood.textContent = todo.done ? '😊' : '😠';

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-delete'; delBtn.textContent = '✕'; delBtn.title = 'Sil';
  delBtn.addEventListener('click', () => removeTodo(todo.id));

  li.append(cb, mood, span, editBtn, delBtn);
  return li;
}

function startEdit(span, id) {
  if (span.contentEditable === 'true') return;
  span.contentEditable = 'true';
  span.focus();
  const range = document.createRange();
  range.selectNodeContents(span); range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  const original = todos.find(t => t.id === id)?.text || '';

  async function commit() {
    span.contentEditable = 'false';
    span.removeEventListener('blur', commit);
    span.removeEventListener('keydown', onKey);
    const text = span.textContent.trim();
    if (!text) { removeTodo(id); return; }
    if (text !== original) await updateTodo(id, text);
  }

  function onKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { span.textContent = original; span.contentEditable = 'false'; }
  }

  span.addEventListener('blur', commit);
  span.addEventListener('keydown', onKey);
}

// ── UI helpers ────────────────────────────────────────────
function showApp() {
  document.getElementById('authWrap').classList.add('hidden');
  document.getElementById('appWrap').classList.remove('hidden');
  document.getElementById('userEmail').textContent = session?.user?.email || '';
  loadTodos();
}

function showAuth() {
  document.getElementById('appWrap').classList.add('hidden');
  document.getElementById('authWrap').classList.remove('hidden');
}

function setMsg(el, text, type) {
  el.textContent = text;
  el.className = 'auth-msg ' + (type || '');
}

function switchTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
}

// ── Event listeners ───────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const msg = document.getElementById('loginMsg');
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
  try {
    await signIn(email, password);
    showApp();
  } catch (err) {
    setMsg(msg, err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Giriş Yap';
  }
});

document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  const msg = document.getElementById('registerMsg');
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  btn.disabled = true; btn.textContent = 'Kayıt olunuyor…';
  try {
    await signUp(email, password);
    setMsg(msg,
      '✉️ Doğrulama e-postası gönderildi. Lütfen gelen kutunu kontrol et.',
      'success'
    );
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
  } catch (err) {
    setMsg(msg, err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Kayıt Ol';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut();
  showAuth();
});

document.getElementById('todoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await addTodo(text);
});

document.getElementById('clearCompleted').addEventListener('click', clearCompleted);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// ── Boot ──────────────────────────────────────────────────
(async () => {
  const wasConfirmed = await handleHashTokens();
  if (!wasConfirmed && session?.access_token) {
    showApp();
  } else {
    showAuth();
    if (wasConfirmed) {
      document.getElementById('confirmedBanner').classList.remove('hidden');
    }
  }
})();
