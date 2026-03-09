import EditorJS from '@editorjs/editorjs'
import { UndoManager } from './UndoManager'

/**
 * Central application state management
 */
class AppState {
  private _currentPageId: number | null = null
  private _editor: EditorJS | null = null
  private _undoManager: UndoManager | null = null
  private _autoSaveTimeout: number | null = null
  private _isSaving: boolean = false

  get currentPageId(): number | null {
    return this._currentPageId
  }

  set currentPageId(id: number | null) {
    this._currentPageId = id
    // Make available globally for blocks that need it
    ;(window as any).currentPageId = id
  }

  get editor(): EditorJS | null {
    return this._editor
  }

  set editor(editor: EditorJS | null) {
    this._editor = editor
    // Make available globally for blocks that need it
    ;(window as any).editor = editor
  }

  get undoManager(): UndoManager | null {
    return this._undoManager
  }

  set undoManager(manager: UndoManager | null) {
    this._undoManager = manager
  }

  get autoSaveTimeout(): number | null {
    return this._autoSaveTimeout
  }

  set autoSaveTimeout(timeout: number | null) {
    this._autoSaveTimeout = timeout
  }

  get isSaving(): boolean {
    return this._isSaving
  }

  set isSaving(saving: boolean) {
    this._isSaving = saving
  }

  clearAutoSaveTimeout(): void {
    if (this._autoSaveTimeout !== null) {
      clearTimeout(this._autoSaveTimeout)
      this._autoSaveTimeout = null
    }
  }

  reset(): void {
    this._currentPageId = null
    this._editor = null
    this._undoManager = null
    this._isSaving = false
    this.clearAutoSaveTimeout()
  }
}

export const appState = new AppState()
