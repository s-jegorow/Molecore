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

  // Load notepad content
  loadNotepad()
}

async function loadNotepad() {
  try {
    const notepad = await getNotepad()
    notepadId = notepad.id
    // Extract text from blocks
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
  saveTimeout = setTimeout(saveNotepad, 1000)
}

async function saveNotepad() {
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
    })
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
