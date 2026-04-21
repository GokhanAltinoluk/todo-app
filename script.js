const STORAGE_KEY = 'todos_v1';

let todos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let filter = 'all';

const form = document.getElementById('todoForm');
const input = document.getElementById('todoInput');
const list = document.getElementById('todoList');
const remainingEl = document.getElementById('remaining');
const clearBtn = document.getElementById('clearCompleted');
const filterBtns = document.querySelectorAll('.filter-btn');

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function getId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
  checkbox.addEventListener('change', () => toggle(todo.id));

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
  deleteBtn.addEventListener('click', () => remove(todo.id));

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

  function commit() {
    span.contentEditable = 'false';
    const newText = span.textContent.trim();
    if (!newText) {
      remove(id);
      return;
    }
    const todo = todos.find(t => t.id === id);
    if (todo) { todo.text = newText; save(); render(); }
    span.removeEventListener('blur', commit);
    span.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { span.textContent = todos.find(t => t.id === id)?.text || ''; commit(); }
  }

  span.addEventListener('blur', commit);
  span.addEventListener('keydown', onKey);
}

function toggle(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) { todo.done = !todo.done; save(); render(); }
}

function remove(id) {
  todos = todos.filter(t => t.id !== id);
  save();
  render();
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.push({ id: getId(), text, done: false });
  input.value = '';
  save();
  render();
});

clearBtn.addEventListener('click', () => {
  todos = todos.filter(t => !t.done);
  save();
  render();
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

render();
