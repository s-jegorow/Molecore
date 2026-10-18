import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import CustomToggleBlock from './CustomToggleBlock'
import CalloutBlock, { initCalloutObserver } from './CalloutBlock'
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
import AlignmentTune from './AlignmentTune'
import { UndoManager } from './UndoManager'
import { appState } from './state'
import { isSafeUrl } from './utils'

export type EditorChangeCallback = () => Promise<void>
export type UndoRedoUpdateCallback = () => void

let undoRedoUpdateCallback: UndoRedoUpdateCallback | undefined

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
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      header: {
        class: Header as any,
        config: { levels: [1, 2, 3], defaultLevel: 2 },
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      list: {
        class: List as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      code: {
        class: Code as any,
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      table: {
        class: Table as any,
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      toggle: {
        class: CustomToggleBlock as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['backgroundColor', 'wrapCallout', 'alignment']
      },
      callout: {
        class: CalloutBlock as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough', 'tooltip'],
        tunes: ['alignment']
      },
      image: {
        class: ResizableImage as any,
        tunes: ['alignment']
      },
      audio: {
        class: AudioBlock as any,
        tunes: ['alignment']
      },
      file: {
        class: FileBlock as any,
        tunes: ['alignment']
      },
      embed: {
        class: EmbedBlock as any,
        tunes: ['alignment']
      },
      reveal: {
        class: RevealBlock as any,
        tunes: ['alignment']
      },
      link: LinkTool as any,
      highlight: HighlightTool as any,
      color: ColorTool as any,
      underline: UnderlineTool as any,
      strikethrough: StrikethroughTool as any,
      tooltip: TooltipTool as any,
      page: PageBlock as any,
      backgroundColor: BackgroundColorTune as any,
      wrapCallout: WrapCalloutTune as any,
      alignment: AlignmentTune as any,
    },

    placeholder: 'Type / for commands...',
    autofocus: true,

    onReady: () => {
      new DragDrop(editor)

      const undoManager = new UndoManager(editor, 50)
      appState.undoManager = undoManager

      setTimeout(async () => {
        await undoManager.captureState()
        if (undoRedoUpdateCallback) {
          undoRedoUpdateCallback()
        }
      }, 500)

      // mobile: popover items ignore taps without this
      document.addEventListener('touchend', (e: TouchEvent) => {
        const target = e.target as HTMLElement

        const popoverItem = target.closest('.ce-popover__item')
        if (popoverItem) {
          e.preventDefault()
          e.stopPropagation()

          setTimeout(() => {
            (popoverItem as HTMLElement).click()
          }, 50)
        }
      }, { passive: false, capture: true })

      const editorElement = document.getElementById('editor')
      if (editorElement) {
        editorElement.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement
          const link = target.closest('a')
          if (link && link.href) {
            e.preventDefault()
            if (isSafeUrl(link.href)) window.open(link.href, '_blank', 'noopener,noreferrer')
          }
        })
      }

      initCalloutObserver()
    },

    onChange: async () => {
      if (appState.undoManager) {
        await appState.undoManager.captureState()
        if (undoRedoUpdateCallback) {
          undoRedoUpdateCallback()
        }
      }

      if (onChange) {
        await onChange()
      }
    }
  })

  appState.editor = editor

  return editor
}

export async function performUndo(): Promise<void> {
  if (appState.undoManager) {
    await appState.undoManager.undo()
    if (undoRedoUpdateCallback) {
      undoRedoUpdateCallback()
    }
  }
}

export async function performRedo(): Promise<void> {
  if (appState.undoManager) {
    await appState.undoManager.redo()
    if (undoRedoUpdateCallback) {
      undoRedoUpdateCallback()
    }
  }
}

export function canUndo(): boolean {
  return appState.undoManager?.canUndo() ?? false
}

export function canRedo(): boolean {
  return appState.undoManager?.canRedo() ?? false
}
