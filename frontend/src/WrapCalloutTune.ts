/**
 * WrapCalloutTune – adds "→ Callout" to every block's settings menu.
 * When activated, inserts a CalloutBlock header before the current block
 * (or before the first selected block) and marks the selected blocks
 * with data-callout-fk so they become callout children.
 *
 * NOTE: EditorJS clears multi-block selection when the settings menu opens,
 * so we capture the selection in the constructor (when the tune is created).
 */

import { applyCalloutForeignKeys } from './CalloutBlock'

function uid(): string {
  return 'callout-' + Math.random().toString(36).slice(2, 10)
}

export default class WrapCalloutTune {
  private api: any
  private block: any
  private selectedIndices: number[] = []

  static get isTune() {
    return true
  }

  constructor({ api, block }: any) {
    this.api = api
    this.block = block

    // Capture selected blocks NOW — EditorJS clears the selection
    // when the settings popover opens, so by the time onActivate runs
    // the .ce-block--selected class is already gone.
    const selectedEls = document.querySelectorAll('.ce-block--selected')
    if (selectedEls.length > 1) {
      for (let j = 0; j < selectedEls.length; j++) {
        const el = selectedEls[j] as HTMLElement
        const blockApi = this.api.blocks.getBlockByElement(el)
        if (blockApi) {
          this.selectedIndices.push(this.api.blocks.getBlockIndex(blockApi.id))
        }
      }
    }
  }

  render() {
    const count = this.selectedIndices.length
    return {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 8h10M7 12h6"/></svg>',
      title: count > 1 ? `→ Callout (${count})` : '→ Callout',
      closeOnActivate: true,
      onActivate: () => this._wrapInCallout(),
    }
  }

  private _wrapInCallout() {
    const fk = uid()
    const color = 'blue'

    let indices: number[]

    if (this.selectedIndices.length > 0) {
      // Multi-block selection captured in constructor
      indices = this.selectedIndices
    } else {
      // Just this single block
      const idx = this.api.blocks.getBlockIndex(this.block.id)
      if (idx < 0) return
      indices = [idx]
    }

    if (indices.length === 0) return

    const firstIdx = Math.min(...indices)
    const count = indices.length

    // Insert callout header block BEFORE the first selected block
    this.api.blocks.insert('callout', {
      fk,
      items: count,
      color,
    }, undefined, firstIdx, false)

    // The MutationObserver in CalloutBlock will auto-apply styling,
    // but also trigger it explicitly for immediate visual feedback
    setTimeout(() => applyCalloutForeignKeys(), 100)
    setTimeout(() => applyCalloutForeignKeys(), 400)
  }

  save() {
    return {}
  }
}
