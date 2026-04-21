const SUPABASE_URL = 'https://fpmyvjkhbjvfqjoctlfy.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbXl2amtoYmp2ZnFqb2N0bGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTA1ODYsImV4cCI6MjA5MjM2NjU4Nn0.nSfdJhEBYkmAtedTaP0G9g4R_gwIXYL946maxKHgyo8';

const AUTH_URL  = `${SUPABASE_URL}/auth/v1`;
const TODOS_URL = `${SUPABASE_URL}/rest/v1/todos`;
const TRANS_URL = `${SUPABASE_URL}/rest/v1/transactions`;

// ── Session ───────────────────────────────────────────────
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

// ── Tema ──────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('nexus_theme', t);
  document.getElementById('themeBtn').textContent = t === 'dark' ? '☀' : '☾';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── Bildirimler ───────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const p = await Notification.requestPermission();
  updateNotifBtn(p);
}

function updateNotifBtn(p) {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  btn.title = p === 'granted' ? 'Bildirimler açık' : 'Bildirimlere izin ver';
  btn.classList.toggle('active', p === 'granted');
}

function fireOverdueNotifs() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  todos.filter(t => !t.done && t.due_date && new Date(t.due_date).getTime() < now)
    .slice(0, 5)
    .forEach(t => new Notification('Vadesi geçti — NEXUS', {
      body: t.text,
      icon: '/todo-app/icons/icon-192.png',
      tag: `todo-${t.id}`,
    }));
}

// ── Bütçe Hedefleri ───────────────────────────────────────
function loadBudget() {
  return JSON.parse(localStorage.getItem('nexus_budget') || '{"gelir":0,"gider":0}');
}

function saveBudget(b) { localStorage.setItem('nexus_budget', JSON.stringify(b)); }

function renderBudget() {
  const budget = loadBudget();
  const now = new Date();
  const monthTrans = transactions.filter(t => {
    const d = new Date(t.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const gelir = monthTrans.filter(t => t.type === 'gelir').reduce((s, t) => s + Number(t.amount), 0);
  const gider = monthTrans.filter(t => t.type === 'gider').reduce((s, t) => s + Number(t.amount), 0);

  const gelirPct = budget.gelir > 0 ? Math.min(100, Math.round(gelir / budget.gelir * 100)) : 0;
  const giderPct = budget.gider > 0 ? Math.min(100, Math.round(gider / budget.gider * 100)) : 0;

  document.getElementById('gelirProgress').style.width = gelirPct + '%';
  document.getElementById('giderProgress').style.width = giderPct + '%';
  document.getElementById('gelirPct').textContent = budget.gelir > 0
    ? `${formatMoney(gelir)} / ${formatMoney(budget.gelir)}`
    : 'Hedef belirlenmedi';
  document.getElementById('giderPct').textContent = budget.gider > 0
    ? `${formatMoney(gider)} / ${formatMoney(budget.gider)}`
    : 'Limit belirlenmedi';

  document.getElementById('giderProgress').classList.toggle('danger', giderPct >= 90);
  document.getElementById('gelirProgress').classList.toggle('success', gelirPct >= 100);
}

// ── Tekrar hesaplama ──────────────────────────────────────
function calcNextDue(fromIso, repeat) {
  const d = fromIso ? new Date(fromIso) : new Date();
  if (repeat === 'daily')   d.setDate(d.getDate() + 1);
  if (repeat === 'weekly')  d.setDate(d.getDate() + 7);
  if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// ── Auth API ──────────────────────────────────────────────
async function signUp(email, password) {
  return apiFetch(`${AUTH_URL}/signup`, { method: 'POST', body: JSON.stringify({ email, password }) });
}

async function signIn(email, password) {
  const data = await apiFetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  saveSession(data);
  return data;
}

async function signOut() {
  if (session) await fetch(`${AUTH_URL}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => {});
  clearSession();
}

async function handleHashTokens() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const params = Object.fromEntries(new URLSearchParams(hash));
  if (params.access_token && params.type === 'signup') {
    saveSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('confirmedBanner').classList.remove('hidden');
    return true;
  }
  if (params.access_token) {
    saveSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    history.replaceState(null, '', window.location.pathname);
    return false;
  }
  return false;
}

// ── Transactions API ──────────────────────────────────────
let transactions = [];
let transType = 'gelir';

async function loadTransactions() {
  try {
    const data = await apiFetch(`${TRANS_URL}?order=created_at.desc`, {
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    });
    transactions = Array.isArray(data) ? data : [];
  } catch { transactions = []; }
  renderFinance();
}

async function addTransaction(type, description, amount) {
  const btn = document.querySelector('#transactionForm button[type="submit"]');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '…';
  try {
    const data = await apiFetch(TRANS_URL, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify({ type, description, amount, user_id: session?.user?.id }),
    });
    transactions.unshift(Array.isArray(data) ? data[0] : data);
    renderFinance();
  } catch (err) { alert('Kayıt eklenemedi: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function removeTransaction(id) {
  try {
    await apiFetch(`${TRANS_URL}?id=eq.${id}`, { method: 'DELETE' });
    transactions = transactions.filter(t => t.id !== id);
    renderFinance();
  } catch (err) { alert('Silinemedi: ' + err.message); }
}

function formatMoney(n) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function renderFinance() {
  const list = document.getElementById('transactionList');
  list.innerHTML = '';

  const totalGelir = transactions.filter(t => t.type === 'gelir').reduce((s, t) => s + Number(t.amount), 0);
  const totalGider = transactions.filter(t => t.type === 'gider').reduce((s, t) => s + Number(t.amount), 0);
  const net = totalGelir - totalGider;

  document.getElementById('totalGelir').textContent = formatMoney(totalGelir);
  document.getElementById('totalGider').textContent = formatMoney(totalGider);
  const netEl = document.getElementById('netBakiye');
  netEl.textContent = formatMoney(net);
  netEl.className = 'summary-amount ' + (net >= 0 ? 'pozitif' : 'negatif');

  renderBudget();

  if (!transactions.length) {
    const li = document.createElement('li');
    li.className = 'empty-msg';
    li.textContent = 'Henüz kayıt eklenmedi.';
    list.appendChild(li);
    return;
  }

  transactions.forEach(t => {
    const li = document.createElement('li');
    li.className = `trans-item ${t.type}`;

    const badge = document.createElement('span');
    badge.className = 'trans-badge';
    badge.textContent = t.type === 'gelir' ? '▲' : '▼';

    const info = document.createElement('div');
    info.className = 'trans-info';

    const desc = document.createElement('span');
    desc.className = 'trans-desc';
    desc.textContent = t.description;

    const date = document.createElement('span');
    date.className = 'trans-date';
    date.textContent = t.created_at ? formatDate(t.created_at) : '';

    info.append(desc, date);

    const amount = document.createElement('span');
    amount.className = 'trans-amount';
    amount.textContent = (t.type === 'gider' ? '−' : '+') + formatMoney(t.amount);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => removeTransaction(t.id));

    li.append(badge, info, amount, delBtn);
    list.appendChild(li);
  });
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
  fireOverdueNotifs();
}

async function addTodo(text, due_date, repeat) {
  const body = { text, done: false, user_id: session?.user?.id };
  if (due_date) body.due_date = due_date;
  if (repeat && repeat !== 'none') body.repeat = repeat;
  const data = await apiFetch(TODOS_URL, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  todos.push(Array.isArray(data) ? data[0] : data);
  render();
}

async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  const nowDone = !todo.done;
  const completed_at = nowDone ? new Date().toISOString() : null;
  try {
    await apiFetch(`${TODOS_URL}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ done: nowDone, completed_at }),
    });
    todo.completed_at = completed_at;
  } catch {
    await apiFetch(`${TODOS_URL}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ done: nowDone }),
    });
  }
  todo.done = nowDone;

  // Tekrarlayan görev: tamamlanınca yenisini oluştur
  if (nowDone && todo.repeat && todo.repeat !== 'none') {
    const nextDue = calcNextDue(todo.due_date, todo.repeat);
    await addTodo(todo.text, nextDue, todo.repeat);
  } else {
    render();
  }
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

// ── Yardımcı formatlama ───────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateShort(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
}

function formatElapsed(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60 > 0 ? m % 60 + ' dk' : ''}`.trim();
  const d = Math.floor(h / 24);
  return `${d} gün ${h % 24 > 0 ? h % 24 + ' sa' : ''}`.trim();
}

function formatElapsedBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'Birkaç sn';
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60 > 0 ? m % 60 + ' dk' : ''}`.trim();
  const d = Math.floor(h / 24);
  return `${d} gün ${h % 24 > 0 ? h % 24 + ' sa' : ''}`.trim();
}

const REPEAT_LABEL = { daily: 'Her gün', weekly: 'Her hafta', monthly: 'Her ay' };

function buildItem(todo) {
  const now = Date.now();
  const isOverdue = !todo.done && todo.due_date && new Date(todo.due_date).getTime() < now;
  const isDueSoon = !todo.done && todo.due_date && !isOverdue &&
    new Date(todo.due_date).getTime() - now < 24 * 3600 * 1000;

  const li = document.createElement('li');
  li.className = 'todo-item' +
    (todo.done     ? ' completed' : '') +
    (isOverdue     ? ' overdue'   : '') +
    (isDueSoon     ? ' due-soon'  : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = todo.done;
  cb.addEventListener('change', () => toggleTodo(todo.id));

  const mood = document.createElement('span');
  mood.className = 'todo-mood';
  mood.textContent = todo.done ? '😊' : (isOverdue ? '🔴' : '😠');

  const span = document.createElement('span');
  span.className = 'todo-text';
  span.textContent = todo.text;
  span.title = 'Düzenlemek için çift tıkla';
  span.addEventListener('dblclick', () => startEdit(span, todo.id));

  const badges = document.createElement('span');
  badges.className = 'todo-badges';

  if (todo.repeat && todo.repeat !== 'none') {
    const rb = document.createElement('span');
    rb.className = 'badge badge-repeat';
    rb.textContent = '↻ ' + (REPEAT_LABEL[todo.repeat] || todo.repeat);
    badges.appendChild(rb);
  }

  if (todo.due_date) {
    const db = document.createElement('span');
    db.className = 'badge ' + (isOverdue ? 'badge-overdue' : isDueSoon ? 'badge-soon' : 'badge-due');
    db.textContent = (isOverdue ? '⚠ ' : '📅 ') + formatDateShort(todo.due_date);
    badges.appendChild(db);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit'; editBtn.textContent = '✎'; editBtn.title = 'Düzenle';
  editBtn.addEventListener('click', () => startEdit(span, todo.id));

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-delete'; delBtn.textContent = '✕'; delBtn.title = 'Sil';
  delBtn.addEventListener('click', () => removeTodo(todo.id));

  const top = document.createElement('div');
  top.className = 'todo-top';
  top.append(cb, mood, span, badges, editBtn, delBtn);

  const meta = document.createElement('div');
  meta.className = 'todo-meta';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'todo-date';
  dateSpan.innerHTML = `<span class="meta-label">Eklenme:</span> ${todo.created_at ? formatDate(todo.created_at) : '—'}`;

  const elapsedSpan = document.createElement('span');
  elapsedSpan.className = 'todo-elapsed';
  elapsedSpan.innerHTML = `<span class="meta-label">Geçen süre:</span> ${todo.created_at ? formatElapsed(todo.created_at) : '—'}`;

  meta.append(dateSpan, elapsedSpan);

  if (todo.done && todo.completed_at) {
    const cs = document.createElement('span');
    cs.className = 'todo-completed-at';
    cs.innerHTML = `<span class="meta-label">Tamamlanma:</span> ${formatDate(todo.completed_at)}`;
    const ce = document.createElement('span');
    ce.className = 'todo-completed-elapsed';
    ce.innerHTML = `<span class="meta-label">Tamamlanma süresi:</span> ${formatElapsedBetween(todo.created_at, todo.completed_at)}`;
    meta.append(cs, ce);
  }

  li.append(top, meta);
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
  loadTodos().catch(console.error);
  loadTransactions().catch(console.error);
  if ('Notification' in window) updateNotifBtn(Notification.permission);
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
  try { await signIn(email, password); showApp(); }
  catch (err) { setMsg(msg, err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Giriş Yap'; }
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
    setMsg(msg, '✉️ Doğrulama e-postası gönderildi.', 'success');
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
  } catch (err) { setMsg(msg, err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kayıt Ol'; }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(); showAuth();
});

document.getElementById('themeBtn').addEventListener('click', toggleTheme);
document.getElementById('notifBtn').addEventListener('click', requestNotifPermission);

// Todo form — seçenekler toggle
document.getElementById('todoExtraToggle').addEventListener('click', () => {
  const el = document.getElementById('todoExtra');
  const open = el.classList.toggle('open');
  document.getElementById('todoExtraToggle').textContent = open ? '− Seçenekler' : '+ Seçenekler';
});

document.getElementById('todoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input  = document.getElementById('todoInput');
  const text   = input.value.trim();
  if (!text) return;
  const due    = document.getElementById('todoDueDate').value;
  const repeat = document.getElementById('todoRepeat').value;
  input.value = '';
  document.getElementById('todoDueDate').value = '';
  document.getElementById('todoRepeat').value = 'none';
  document.getElementById('todoExtra').classList.remove('open');
  document.getElementById('todoExtraToggle').textContent = '+ Seçenekler';
  await addTodo(text, due ? new Date(due).toISOString() : null, repeat);
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

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    transType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('transactionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const desc   = document.getElementById('transDesc').value.trim();
  const amount = parseFloat(document.getElementById('transAmount').value);
  if (!desc || isNaN(amount) || amount <= 0) return;
  document.getElementById('transDesc').value = '';
  document.getElementById('transAmount').value = '';
  await addTransaction(transType, desc, amount);
});

// Bütçe hedefi
document.getElementById('editBudgetBtn').addEventListener('click', () => {
  document.getElementById('budgetForm').classList.toggle('hidden');
});

document.getElementById('saveBudgetBtn').addEventListener('click', () => {
  const gelir = parseFloat(document.getElementById('gelirHedef').value) || 0;
  const gider = parseFloat(document.getElementById('giderLimit').value) || 0;
  saveBudget({ gelir, gider });
  document.getElementById('budgetForm').classList.add('hidden');
  renderBudget();
});

// ── Mobil tab navigasyonu ─────────────────────────────────
function initMobileTabs() {
  const todoPanel    = document.getElementById('todoPanel');
  const financePanel = document.getElementById('financePanel');
  const tabTodo      = document.getElementById('mobileTabTodo');
  const tabFinance   = document.getElementById('mobileTabFinance');

  function switchPanel(active) {
    if (active === 'todo') {
      todoPanel.classList.add('mobile-active');
      financePanel.classList.remove('mobile-active');
      tabTodo.classList.add('active');
      tabFinance.classList.remove('active');
    } else {
      financePanel.classList.add('mobile-active');
      todoPanel.classList.remove('mobile-active');
      tabFinance.classList.add('active');
      tabTodo.classList.remove('active');
    }
  }

  switchPanel('todo');
  tabTodo.addEventListener('click', () => switchPanel('todo'));
  tabFinance.addEventListener('click', () => switchPanel('finance'));
}

// ── Boot ──────────────────────────────────────────────────
(async () => {
  applyTheme(localStorage.getItem('nexus_theme') || 'dark');
  initMobileTabs();

  const wasConfirmed = await handleHashTokens();
  if (!wasConfirmed && session?.access_token) {
    showApp();
  } else {
    showAuth();
    if (wasConfirmed) document.getElementById('confirmedBanner').classList.remove('hidden');
  }
})();
