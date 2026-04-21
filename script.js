const SUPABASE_URL = 'https://fpmyvjkhbjvfqjoctlfy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbXl2amtoYmp2ZnFqb2N0bGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTA1ODYsImV4cCI6MjA5MjM2NjU4Nn0.nSfdJhEBYkmAtedTaP0G9g4R_gwIXYL946maxKHgyo8';

const API = `${SUPABASE_URL}/rest/v1/todos`;
const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

let todos = [];
let filter = 'all';

const form = document.getElementById('todoForm');
const input = document.getElementById('todoInput');
const list = document.getElementById('todoList');
const remainingEl = document.getElementById('remaining');
const clearBtn = document.getElementById('clearCompleted');
const filterBtns = document.querySelectorAll('.filter-btn');

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function loadTodos() {
  todos = await apiFetch(`${API}?order=created_at.asc`);
  render();
}

async function addTodo(text) {
  const created = await apiFetch(API, {
    method: 'POST',
    body: JSON.stringify({ text, done: false }),
  });
  todos.push(created[0]);
  render();
}

async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  await apiFetch(`${API}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done: !todo.done }),
  });
  todo.done = !todo.done;
  render();
}

async function updateTodo(id, text) {
  await apiFetch(`${API}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  });
  todos.find(t => t.id === id).text = text;
  render();
}

async function removeTodo(id) {
  await apiFetch(`${API}?id=eq.${id}`, { method: 'DELETE' });
  todos = todos.filter(t => t.id !== id);
  render();
}

async function clearCompleted() {
  const ids = todos.filter(t => t.done).map(t => t.id);
  if (!ids.length) return;
  await apiFetch(`${API}?id=in.(${ids.join(',')})`, { method: 'DELETE' });
  todos = todos.filter(t => !t.done);
  render();
}

function getVisible() {
  if (filter === 'active') return todos.filter(t => !t.done);
  if (filter === 'completed') return todos.filter(t => t.done);
  return todos;
}

function render() {
  const visible = getVisible();
  list.innerHTML = '';

  if (visible.length === 0) {
    const msg = document.createElement('li');
    msg.className = 'empty-msg';
    msg.textContent = filter === 'completed' ? 'Tamamlanan görev yok.' :
                      filter === 'active'    ? 'Aktif görev yok.'     :
                                               'Henüz görev eklenmedi.';
    list.appendChild(msg);
  } else {
    visible.forEach(todo => list.appendChild(buildItem(todo)));
  }

  const activeCount = todos.filter(t => !t.done).length;
  remainingEl.textContent = `${activeCount} görev kaldı`;
  clearBtn.style.display = todos.some(t => t.done) ? 'inline' : 'none';
}

function buildItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' completed' : '');
  li.dataset.id = todo.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.done;
  checkbox.addEventListener('change', () => toggleTodo(todo.id));

  const span = document.createElement('span');
  span.className = 'todo-text';
  span.textContent = todo.text;
  span.title = 'Düzenlemek için çift tıkla';
  span.addEventListener('dblclick', () => startEdit(span, todo.id));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit';
  editBtn.textContent = '✎';
  editBtn.title = 'Düzenle';
  editBtn.addEventListener('click', () => startEdit(span, todo.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Sil';
  deleteBtn.addEventListener('click', () => removeTodo(todo.id));

  li.append(checkbox, span, editBtn, deleteBtn);
  return li;
}

function startEdit(span, id) {
  if (span.contentEditable === 'true') return;
  span.contentEditable = 'true';
  span.focus();

  const range = document.createRange();
  range.selectNodeContents(span);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  const originalText = todos.find(t => t.id === id)?.text || '';

  async function commit() {
    span.contentEditable = 'false';
    const newText = span.textContent.trim();
    span.removeEventListener('blur', commit);
    span.removeEventListener('keydown', onKey);
    if (!newText) { removeTodo(id); return; }
    if (newText !== originalText) await updateTodo(id, newText);
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { span.textContent = originalText; span.contentEditable = 'false'; }
  }

  span.addEventListener('blur', commit);
  span.addEventListener('keydown', onKey);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await addTodo(text);
});

clearBtn.addEventListener('click', clearCompleted);

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

loadTodos();
