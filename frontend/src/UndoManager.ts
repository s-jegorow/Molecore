import type EditorJS from '@editorjs/editorjs'

interface HistoryState {
  content: any
  timestamp: number
}

export class UndoManager {
  private history: HistoryState[] = []
  private currentIndex: number = -1
  private maxHistory: number = 5
  private editor: EditorJS
  private isRestoring: boolean = false

  constructor(editor: EditorJS, maxHistory: number = 5) {
    this.editor = editor
    this.maxHistory = maxHistory
  }

  async captureState() {
    if (this.isRestoring) return

    try {
      const content = await this.editor.save()

      // Remove any future states if we're not at the end
      if (this.currentIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.currentIndex + 1)
      }

      // Add new state
      this.history.push({
        content,
        timestamp: Date.now()
      })

      // Limit history size
      if (this.history.length > this.maxHistory) {
        this.history.shift()
      } else {
        this.currentIndex++
      }

      console.log(`History captured. Index: ${this.currentIndex}, Total: ${this.history.length}`)
    } catch (err) {
      console.error('Failed to capture state:', err)
    }
  }

  async undo() {
    if (!this.canUndo()) {
      console.log('Cannot undo - no history')
      return false
    }

    try {
      this.currentIndex--
      const state = this.history[this.currentIndex]

      this.isRestoring = true
      await this.editor.render(state.content)
      this.isRestoring = false

      console.log(`Undo to index: ${this.currentIndex}`)
      return true
    } catch (err) {
      console.error('Undo failed:', err)
      this.currentIndex++
      this.isRestoring = false
      return false
    }
  }

  async redo() {
    if (!this.canRedo()) {
      console.log('Cannot redo - no future states')
      return false
    }

    try {
      this.currentIndex++
      const state = this.history[this.currentIndex]

      this.isRestoring = true
      await this.editor.render(state.content)
      this.isRestoring = false

      console.log(`Redo to index: ${this.currentIndex}`)
      return true
    } catch (err) {
      console.error('Redo failed:', err)
      this.currentIndex--
      this.isRestoring = false
      return false
    }
  }

  canUndo(): boolean {
    return this.currentIndex > 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  clear() {
    this.history = []
    this.currentIndex = -1
  }
}
