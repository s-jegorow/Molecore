import './style.css'
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import DragDrop from 'editorjs-drag-drop'
import { getPage, updatePage } from './api'
import { initSidebar, setActivePage } from './sidebar'

let currentPageId: number | null = null
let editor: EditorJS

// Editor initialisieren
function initEditor() {
  editor = new EditorJS({
    holder: 'editor',
    
    tools: {
      header: Header as any,
      list: List as any,
      code: Code as any,
      table: Table as any
    },
    
    placeholder: 'Type / for commands...',
    autofocus: true,
    
    onReady: () => {
      new DragDrop(editor)
    }
  })
}

async function loadPage(pageId: number) {
  try {
    const page = await getPage(pageId)

    // Editor neu initialisieren -> neue Page
    if (editor) {
      await editor.isReady
      await editor.clear()
      await editor.render(page.content)
    }

    // Titel aktualisieren
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = page.title
    }

    currentPageId = pageId
    setActivePage(pageId)

    console.log('Page loaded:', page.title)
  } catch (error) {
    console.error('Failed to load page:', error)
  }
}

const saveBtn = document.getElementById('save-btn')
saveBtn?.addEventListener('click', async () => {
  if (!currentPageId) return

  try {
    const content = await editor.save()
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    const title = pageTitleInput?.value || 'Untitled'

    await updatePage(currentPageId, { content, title })
    alert('Saved!')
  } catch (error) {
    console.error('Failed to save:', error)
    alert('Save failed!')
  }
})

// Title Input - Save on blur
const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
pageTitleInput?.addEventListener('blur', async () => {
  if (!currentPageId) return

  const newTitle = pageTitleInput.value || 'Untitled'

  try {
    await updatePage(currentPageId, { title: newTitle })
    // Sidebar aktualisieren
    const pageItem = document.querySelector(`[data-page-id="${currentPageId}"]`)
    if (pageItem) {
      pageItem.textContent = newTitle
    }
  } catch (error) {
    console.error('Failed to update title:', error)
  }
})


initEditor()
initSidebar(loadPage)
