import { getNotepad, updatePage } from './api'

let notepadId: number | null = null
let notepadContent: string = ''
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let isOpen = false

export function initNotepad() {
  const tab = document.getElementById('notepad-tab')
  const panel = document.getElementById('notepad-panel')
  const closeBtn = document.getElementById('notepad-close')
  const textarea = document.getElementById('notepad-textarea') as HTMLTextAreaElement

  if (!tab || !panel || !textarea) return

  tab.addEventListener('click', () => {
    if (isOpen) {
      closeNotepad()
    } else {
      openNotepad()
    }
  })

  if (closeBtn) {
    closeBtn.addEventListener('click', closeNotepad)
  }

  textarea.addEventListener('input', () => {
    notepadContent = textarea.value
    debounceSave()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNotepad()
  })
  window.addEventListener('beforeunload', (e) => {
    if (!saveTimeout) return
    flushNotepad()
    e.preventDefault()
    e.returnValue = ''
  })

  loadNotepad()
}

async function loadNotepad() {
  try {
    const notepad = await getNotepad()
    notepadId = notepad.id
    const blocks = notepad.content?.blocks || []
    notepadContent = blocks
      .filter((b: any) => b.type === 'paragraph')
      .map((b: any) => b.data?.text || '')
      .join('\n')

    const textarea = document.getElementById('notepad-textarea') as HTMLTextAreaElement
    if (textarea) {
      textarea.value = notepadContent
    }
  } catch (e) {
    console.error('Failed to load notepad:', e)
  }
}

function debounceSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => saveNotepad(), 1000)
}

function flushNotepad() {
  if (!saveTimeout) return
  clearTimeout(saveTimeout)
  saveNotepad(true)
}

async function saveNotepad(keepalive = false) {
  saveTimeout = null
  if (notepadId === null) return

  const blocks = notepadContent.split('\n').map(line => ({
    type: 'paragraph',
    data: { text: line }
  }))

  try {
    await updatePage(notepadId, {
      content: {
        time: Date.now(),
        blocks,
        version: '2.28.2'
      }
    }, { keepalive })
  } catch (e) {
    console.error('Failed to save notepad:', e)
  }
}

function openNotepad() {
  const panel = document.getElementById('notepad-panel')
  const tab = document.getElementById('notepad-tab')
  if (panel) panel.classList.add('open')
  if (tab) tab.classList.add('open')
  isOpen = true
  const textarea = document.getElementById('notepad-textarea') as HTMLTextAreaElement
  if (textarea) textarea.focus()
}

function closeNotepad() {
  const panel = document.getElementById('notepad-panel')
  const tab = document.getElementById('notepad-tab')
  if (panel) panel.classList.remove('open')
  if (tab) tab.classList.remove('open')
  isOpen = false
}

export function showNotepadTab() {
  const tab = document.getElementById('notepad-tab')
  if (tab) tab.style.display = 'flex'
}

export function hideNotepadTab() {
  const tab = document.getElementById('notepad-tab')
  if (tab) tab.style.display = 'none'
  closeNotepad()
}
