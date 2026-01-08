import './style.css'
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import DragDrop from 'editorjs-drag-drop'
import { getPage, updatePage } from './api'

const CURRENT_PAGE_ID = 1

const editor = new EditorJS({
  holder: 'editor',

  tools: {
    header: Header as any,
    list: List as any,
    code: Code as any,
    table: Table as any
  },

  placeholder: 'Type / for commands...',
  autofocus: true,

  // Drag & Drop aktivieren
  onReady: () => {
    new DragDrop(editor)
  }
})

async function loadPage() {
  try {
    const page = await getPage(CURRENT_PAGE_ID)
    await editor.isReady
    await editor.render(page.content)
    console.log('Page loaded:', page.title)
  } catch (error) {
    console.error('Failed to load page:', error)
  }
}

const saveBtn = document.getElementById('save-btn')
saveBtn?.addEventListener('click', async () => {
  try {
    const content = await editor.save()
    await updatePage(CURRENT_PAGE_ID, { content })
    alert('Saved!')
  } catch (error) {
    console.error('Failed to save:', error)
    alert('Save failed!')
  }
})

loadPage()
