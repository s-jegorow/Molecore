import EditorJS from '@editorjs/editorjs'
import { UndoManager } from './UndoManager'

class AppState {
  private _currentPageId: number | null = null
  private _editor: EditorJS | null = null
  private _undoManager: UndoManager | null = null
  isDemo: boolean = false
  suppressIdleUntil: number = 0

  get currentPageId(): number | null {
    return this._currentPageId
  }

  set currentPageId(id: number | null) {
    this._currentPageId = id
  }

  get editor(): EditorJS | null {
    return this._editor
  }

  set editor(editor: EditorJS | null) {
    this._editor = editor
  }

  get undoManager(): UndoManager | null {
    return this._undoManager
  }

  set undoManager(manager: UndoManager | null) {
    this._undoManager = manager
  }
}

export const appState = new AppState()
