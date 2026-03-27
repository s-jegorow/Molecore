import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import CustomToggleBlock from './CustomToggleBlock'
import CalloutBlock, { applyCalloutForeignKeys, initCalloutObserver } from './CalloutBlock'
import ParagraphWithBlanks from './ParagraphWithBlanks'
import ResizableImage from './ResizableImage'
import BackgroundColorTune from './BackgroundColorTune'
import WrapCalloutTune from './WrapCalloutTune'
import ColorTool from './ColorTool'
import HighlightTool from './HighlightTool'
import UnderlineTool from './UnderlineTool'
import StrikethroughTool from './StrikethroughTool'
import LinkTool from './LinkTool'
import TooltipTool from './TooltipTool'
import DragDrop from 'editorjs-drag-drop'
import PageBlock from './PageBlock'
import AudioBlock from './AudioBlock'
import FileBlock from './FileBlock'
import EmbedBlock from './EmbedBlock'
import RevealBlock from './RevealBlock'
import { UndoManager } from './UndoManager'
import { appState } from './state'

export type EditorChangeCallback = () => Promise<void>
export type UndoRedoUpdateCallback = () => void

let undoRedoUpdateCallback: UndoRedoUpdateCallback | undefined

/**
 * Initialize the EditorJS instance with all tools and configurations
 */
export function initEditor(
  onChange?: EditorChangeCallback,
  onUndoRedoUpdate?: UndoRedoUpdateCallback
): EditorJS {
  undoRedoUpdateCallback = onUndoRedoUpdate

  const editor = new EditorJS({
    holder: 'editor',

    tools: {
      paragraph: {
        class: ParagraphWithBlanks,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout']
      },
      header: {
        class: Header as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout']
      },
      list: {
        class: List as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout']
      },
      code: {
        class: Code as any,
        tunes: ['backgroundColor', 'wrapCallout']
      },
      table: {
        class: Table as any,
        tunes: ['backgroundColor', 'wrapCallout']
      },
      toggle: {
        class: CustomToggleBlock as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout']
      },
      callout: {
        class: CalloutBlock as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
      },
      image: ResizableImage as any,
      audio: AudioBlock as any,
      file: FileBlock as any,
      embed: EmbedBlock as any,
      reveal: RevealBlock as any,
      link: LinkTool as any,
      highlight: HighlightTool as any,
      color: ColorTool as any,
      underline: UnderlineTool as any,
      strikethrough: StrikethroughTool as any,
      tooltip: TooltipTool as any,
      page: PageBlock as any,
      backgroundColor: BackgroundColorTune as any,
      wrapCallout: WrapCalloutTune as any,
    },

    placeholder: 'Type / for commands...',
    autofocus: true,

    onReady: () => {
      // Enable drag and drop for blocks
      new DragDrop(editor)

      // Initialize undo manager with max 5 history states
      const undoManager = new UndoManager(editor, 5)
      appState.undoManager = undoManager

      // Capture initial state after a short delay
      setTimeout(async () => {
        await undoManager.captureState()
        if (undoRedoUpdateCallback) {
          undoRedoUpdateCallback()
        }
      }, 500)

      // Fix for EditorJS popovers on mobile devices
      // Touch events need special handling to properly trigger popover item clicks
      document.addEventListener('touchend', (e: TouchEvent) => {
        const target = e.target as HTMLElement

        // Check if touch is on a popover item
        const popoverItem = target.closest('.ce-popover__item')
        if (popoverItem) {
          e.preventDefault()
          e.stopPropagation()

          // Trigger click after a small delay to ensure proper event handling
          setTimeout(() => {
            (popoverItem as HTMLElement).click()
          }, 50)
        }
      }, { passive: false, capture: true })

      // Make links clickable in the editor
      const editorElement = document.getElementById('editor')
      if (editorElement) {
        editorElement.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement
          const link = target.closest('a')
          if (link && link.href) {
            e.preventDefault()
            window.open(link.href, '_blank', 'noopener,noreferrer')
          }
        })
      }

      // Set up MutationObserver for reliable callout foreignKey styling
      initCalloutObserver()
    },

    onChange: async () => {
      // Capture state for undo/redo
      if (appState.undoManager) {
        await appState.undoManager.captureState()
        if (undoRedoUpdateCallback) {
          undoRedoUpdateCallback()
        }
      }

      // Trigger custom onChange callback if provided
      if (onChange) {
        await onChange()
      }
    }
  })

  // Store editor in app state
  appState.editor = editor

  return editor
}

/**
 * Perform undo operation
 */
export async function performUndo(): Promise<void> {
  if (appState.undoManager) {
    await appState.undoManager.undo()
    if (undoRedoUpdateCallback) {
      undoRedoUpdateCallback()
    }
  }
}

/**
 * Perform redo operation
 */
export async function performRedo(): Promise<void> {
  if (appState.undoManager) {
    await appState.undoManager.redo()
    if (undoRedoUpdateCallback) {
      undoRedoUpdateCallback()
    }
  }
}

/**
 * Check if undo is available
 */
export function canUndo(): boolean {
  return appState.undoManager?.canUndo() ?? false
}

/**
 * Check if redo is available
 */
export function canRedo(): boolean {
  return appState.undoManager?.canRedo() ?? false
}
