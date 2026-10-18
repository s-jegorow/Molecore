import { applyCalloutForeignKeys } from './CalloutBlock'
import { uid } from './utils'

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

    // grab the selection here, editorjs clears it once the settings popover opens
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
    const fk = uid('callout')
    const color = 'blue'

    let indices: number[]

    if (this.selectedIndices.length > 0) {
      indices = this.selectedIndices
    } else {
      const idx = this.api.blocks.getBlockIndex(this.block.id)
      if (idx < 0) return
      indices = [idx]
    }

    if (indices.length === 0) return

    const firstIdx = Math.min(...indices)
    const count = indices.length

    this.api.blocks.insert('callout', {
      fk,
      items: count,
      color,
    }, undefined, firstIdx, false)

    setTimeout(() => applyCalloutForeignKeys(), 100)
    setTimeout(() => applyCalloutForeignKeys(), 400)
  }

  save() {
    return {}
  }
}
