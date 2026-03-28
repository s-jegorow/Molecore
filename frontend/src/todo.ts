import { getTodo, updatePage } from './api'

interface TodoItem {
  text: string
  checked: boolean
}

let todoId: number | null = null
let items: TodoItem[] = []
let isOpen = false
let showProgress = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

export function initTodo() {
  document.getElementById('todo-tab')?.addEventListener('click', () => {
    if (isOpen) closeTodo()
    else openTodo()
  })
  document.getElementById('todo-close')?.addEventListener('click', closeTodo)
  document.getElementById('todo-add-btn')?.addEventListener('click', addItem)

  const input = document.getElementById('todo-input') as HTMLInputElement
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem()
  })

  const progressToggle = document.getElementById('todo-progress-toggle') as HTMLInputElement
  progressToggle?.addEventListener('change', () => {
    showProgress = progressToggle.checked
    updateProgress()
  })

  loadTodo()
}

async function loadTodo() {
  try {
    const page = await getTodo()
    todoId = page.id
    const blocks = page.content?.blocks || []
    // Checklist block: { type: 'checklist', data: { items: [{text, checked}] } }
    const checklist = blocks.find((b: any) => b.type === 'checklist')
    items = checklist?.data?.items || []
    renderList()
    updateProgress()
  } catch (e) {
    console.error('Failed to load todos:', e)
  }
}

function addItem() {
  const input = document.getElementById('todo-input') as HTMLInputElement
  const text = input?.value.trim()
  if (!text) return
  items.push({ text, checked: false })
  input.value = ''
  renderList()
  updateProgress()
  debounceSave()
}

function toggleItem(index: number) {
  items[index].checked = !items[index].checked
  renderList()
  updateProgress()
  debounceSave()
}

function deleteItem(index: number) {
  items.splice(index, 1)
  renderList()
  updateProgress()
  debounceSave()
}

function renderList() {
  const list = document.getElementById('todo-list')
  if (!list) return
  list.innerHTML = ''
  items.forEach((item, i) => {
    const li = document.createElement('li')
    li.className = 'todo-item' + (item.checked ? ' checked' : '')

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = item.checked
    checkbox.addEventListener('change', () => toggleItem(i))

    const label = document.createElement('span')
    label.className = 'todo-item-text'
    label.textContent = item.text

    const del = document.createElement('button')
    del.className = 'todo-delete-btn'
    del.textContent = '×'
    del.addEventListener('click', () => deleteItem(i))

    li.appendChild(checkbox)
    li.appendChild(label)
    li.appendChild(del)
    list.appendChild(li)
  })
}

function updateProgress() {
  const el = document.getElementById('todo-progress')
  if (!el) return
  if (!showProgress || items.length === 0) {
    el.style.display = 'none'
    return
  }
  const done = items.filter(i => i.checked).length
  el.textContent = `${done} / ${items.length}`
  el.style.display = 'inline'
}

function debounceSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveTodo, 800)
}

async function saveTodo() {
  if (todoId === null) return
  try {
    await updatePage(todoId, {
      content: {
        time: Date.now(),
        blocks: items.length > 0
          ? [{ type: 'checklist', data: { items } }]
          : [],
        version: '2.28.2'
      }
    })
  } catch (e) {
    console.error('Failed to save todos:', e)
  }
}

function openTodo() {
  document.getElementById('todo-panel')?.classList.add('open')
  document.getElementById('todo-tab')?.classList.add('open')
  isOpen = true
}

function closeTodo() {
  document.getElementById('todo-panel')?.classList.remove('open')
  document.getElementById('todo-tab')?.classList.remove('open')
  isOpen = false
}

export function showTodoTab() {
  const tab = document.getElementById('todo-tab')
  if (tab) tab.style.display = 'flex'
}

export function hideTodoTab() {
  const tab = document.getElementById('todo-tab')
  if (tab) tab.style.display = 'none'
  closeTodo()
}
