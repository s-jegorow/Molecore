import { appState } from './state'
import { BLOCK_COLORS, uid } from './utils'

const CALLOUT_COLOR_ORDER = ['black', 'blue', 'red', 'orange', 'green', 'purple', 'pink', 'lightgray']

const DEFAULT_COLOR = 'black'

export default class CalloutBlock {
  private data: { fk: string; items: number; color: string }
  private wrapper: HTMLElement | null = null

  static get toolbox() {
    return {
      title: 'Callout',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 8h10M7 12h6"/></svg>',
    }
  }

  static get enableLineBreaks() { return false }
  static get isReadOnlySupported() { return true }

  constructor({ data }: any) {
    this.data = {
      fk:    data?.fk    || uid('callout'),
      items: data?.items ?? 0,
      color: data?.color || DEFAULT_COLOR,
    }
  }

  render(): HTMLElement {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('callout-block-header')
    this.wrapper.contentEditable = 'false'

    this.wrapper.setAttribute('data-callout-fk', this.data.fk)
    this.wrapper.setAttribute('data-callout-items', String(this.data.items))
    this.wrapper.setAttribute('data-callout-color', this.data.color)

    this._applyColor()

    this.wrapper.innerHTML = ''

    return this.wrapper
  }

  save(): { fk: string; items: number; color: string } {
    const items = this.wrapper
      ? parseInt(this.wrapper.getAttribute('data-callout-items') || '0', 10)
      : this.data.items
    return {
      fk: this.data.fk,
      items,
      color: this.data.color,
    }
  }

  static validate(data: any): boolean {
    return !!data.fk
  }

  renderSettings(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px;'

    CALLOUT_COLOR_ORDER.forEach(name => {
      const colors = BLOCK_COLORS[name]
      const btn = document.createElement('button')
      btn.style.cssText = `
        width:28px;height:28px;border-radius:4px;
        border:2px solid ${colors.border};background:${colors.bg};
        cursor:pointer;transition:transform .1s ease;
      `
      btn.title = name.charAt(0).toUpperCase() + name.slice(1)
      if (this.data.color === name) {
        btn.style.transform = 'scale(1.15)'
        btn.style.boxShadow = '0 0 0 2px rgba(33,150,243,.3)'
      }
      btn.addEventListener('pointerdown', (e: Event) => {
        e.preventDefault()
        this.data.color = name
        this._applyColor()
        if (this.wrapper) {
          this.wrapper.setAttribute('data-callout-color', name)
        }
        setTimeout(() => applyCalloutForeignKeys(), 50)
        wrapper.querySelectorAll('button').forEach(b => {
          ;(b as HTMLElement).style.transform = ''
          ;(b as HTMLElement).style.boxShadow = ''
        })
        btn.style.transform = 'scale(1.15)'
        btn.style.boxShadow = '0 0 0 2px rgba(33,150,243,.3)'
      }, true)
      wrapper.appendChild(btn)
    })

    return wrapper
  }

  static get sanitize() { return {} }

  private _applyColor() {
    if (!this.wrapper) return
    const c = BLOCK_COLORS[this.data.color] || BLOCK_COLORS[DEFAULT_COLOR]
    this.wrapper.style.background = c.bg
    this.wrapper.style.color = c.text
  }
}

const _headerPositions = new Map<string, number>()
let _fixingHeaderFk: string | null = null
let _draggedBlock: Element | null = null
let _draggedFromIdx = -1

function _pathOf(el: Element | null | undefined): string[] {
  const path = el?.getAttribute('data-callout-path')
  return path ? path.split(' ') : []
}

function _isInCallout(el: Element | null | undefined, fk: string): boolean {
  return _pathOf(el).includes(fk)
}

function _headerFkOf(el: Element | null | undefined): string | null {
  return el?.querySelector('.callout-block-header')?.getAttribute('data-callout-fk') || null
}

function _getHeaderIdx(fk: string): number {
  const blocks = Array.from(document.querySelectorAll('.ce-block'))
  return blocks.findIndex(b => _headerFkOf(b) === fk)
}

function _getNextChildToMove(fk: string, currentHeaderIdx: number, movedDown: boolean): number {
  const blocks = Array.from(document.querySelectorAll('.ce-block'))
  const children: number[] = []
  blocks.forEach((b, i) => {
    if (i !== currentHeaderIdx && _isInCallout(b, fk)) {
      children.push(i)
    }
  })

  if (children.every((ci, i) => ci === currentHeaderIdx + 1 + i)) return -1

  if (movedDown) {
    const childrenAbove = children.filter(ci => ci < currentHeaderIdx)
    return childrenAbove.length > 0 ? childrenAbove[childrenAbove.length - 1] : -1
  } else {
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i] !== currentHeaderIdx + 1 + i) return children[i]
    }
    return -1
  }
}

function _adoptDropPosition(blocks: Element[], dragged: Element) {
  const fk = _headerFkOf(dragged)
  const group = fk ? blocks.filter(b => b === dragged || _isInCallout(b, fk)) : [dragged]
  const first = blocks.indexOf(group[0])
  const last = blocks.indexOf(group[group.length - 1])

  const before = blocks[first - 1]
  const beforeFk = _headerFkOf(before)
  const insideBefore = beforeFk ? [..._pathOf(before), beforeFk] : _pathOf(before)
  const insideAfter = _pathOf(blocks[last + 1])
  const newAncestors: string[] = []
  while (
    newAncestors.length < Math.min(insideBefore.length, insideAfter.length) &&
    insideBefore[newAncestors.length] === insideAfter[newAncestors.length]
  ) {
    newAncestors.push(insideBefore[newAncestors.length])
  }

  const oldAncestorCount = _pathOf(dragged).length
  group.forEach(el => {
    const path = [...newAncestors, ..._pathOf(el).slice(oldAncestorCount)]
    if (path.length > 0) el.setAttribute('data-callout-path', path.join(' '))
    else el.removeAttribute('data-callout-path')
  })
}

export function applyCalloutForeignKeys(): boolean {
  try {
    let blockArray = Array.from(document.querySelectorAll('.ce-block'))

    // editorjs only moves the dragged block, so we drag the callout children along ourselves
    const editor = appState.editor
    if (!_fixingHeaderFk && editor) {
      for (let idx = 0; idx < blockArray.length; idx++) {
        const fk = _headerFkOf(blockArray[idx])
        if (!fk) continue

        const prevIdx = _headerPositions.get(fk)
        _headerPositions.set(fk, idx)

        if (prevIdx === undefined || prevIdx === idx) continue

        const movedDown = idx > prevIdx

        let moveCount = 0
        for (let attempt = 0; attempt < 50; attempt++) {
          const hIdx = _getHeaderIdx(fk)
          if (hIdx < 0) break
          const childIdx = _getNextChildToMove(fk, hIdx, movedDown)
          if (childIdx < 0) break
          editor.blocks.move(childIdx < hIdx ? hIdx : hIdx + 1, childIdx)
          moveCount++
        }

        const finalIdx = _getHeaderIdx(fk)
        if (finalIdx >= 0) _headerPositions.set(fk, finalIdx)

        if (moveCount > 0) {
          _fixingHeaderFk = fk
          setTimeout(() => { _fixingHeaderFk = null }, 500)
          blockArray = Array.from(document.querySelectorAll('.ce-block'))
          break
        }
        // moveCount 0 = header just shifted because something got inserted above, no real drag
      }
    }

    if (_draggedBlock && blockArray.includes(_draggedBlock) && blockArray.indexOf(_draggedBlock) !== _draggedFromIdx) {
      _adoptDropPosition(blockArray, _draggedBlock)
      _draggedBlock = null
    }

    blockArray.forEach((block, idx) => {
      const header = block.querySelector('.callout-block-header') as HTMLElement
      if (!header) return
      const fk = header.getAttribute('data-callout-fk')
      if (!fk || !header.hasAttribute('data-callout-marked')) return
      const storedItems = parseInt(header.getAttribute('data-callout-items') || '0', 10)
      let newItems = 0
      for (let i = idx + 1; i < blockArray.length; i++) {
        if (_isInCallout(blockArray[i], fk)) newItems = i - idx
      }
      if (newItems !== storedItems) _setCalloutItems(header, newItems)
    })

    blockArray.forEach(block => {
      block.removeAttribute('data-callout-fk')
      block.removeAttribute('data-callout-color')
      block.removeAttribute('data-callout-path')
      block.removeAttribute('data-callout-parent-color')
      block.removeAttribute('data-callout-last')
    })

    let applied = false
    blockArray.forEach((block, idx) => {
      const header = block.querySelector('.callout-block-header') as HTMLElement
      if (!header) return
      const fk = header.getAttribute('data-callout-fk')
      const items = parseInt(header.getAttribute('data-callout-items') || '0', 10)
      const color = header.getAttribute('data-callout-color') || 'black'
      if (!fk) return
      header.setAttribute('data-callout-marked', '')
      for (let i = 1; i <= items; i++) {
        const child = blockArray[idx + i] as HTMLElement | undefined
        if (!child) break
        const outerColor = child.getAttribute('data-callout-color')
        if (outerColor) child.setAttribute('data-callout-parent-color', outerColor)
        const outerPath = child.getAttribute('data-callout-path')
        child.setAttribute('data-callout-path', outerPath ? `${outerPath} ${fk}` : fk)
        child.setAttribute('data-callout-fk', fk)
        child.setAttribute('data-callout-color', color)
        applied = true
      }
    })

    blockArray.forEach((block, idx) => {
      const fk = block.getAttribute('data-callout-fk')
      if (fk && !_isInCallout(blockArray[idx + 1], fk)) {
        block.setAttribute('data-callout-last', '')
      }
    })

    return applied
  } catch (e) {
    console.error('applyCalloutForeignKeys error:', e)
    return false
  }
}

function _handleDragStart(event: DragEvent) {
  const target = event.target as HTMLElement
  if (!target.closest?.('.codex-editor')) return
  const blocks = Array.from(document.querySelectorAll('.ce-block'))
  const currentIdx = appState.editor?.blocks.getCurrentBlockIndex() ?? -1
  const block = target.closest('.ce-block') || blocks[currentIdx]
  if (!block) return
  _draggedBlock = block
  _draggedFromIdx = blocks.indexOf(block)
}

function _handleDragEnd() {
  setTimeout(() => { _draggedBlock = null }, 1000)
}

const ENTER_BLOCK_TYPES = ['paragraph', 'header']

function _getCalloutHeader(fk: string): HTMLElement | null {
  return document.querySelector(`.callout-block-header[data-callout-fk="${CSS.escape(fk)}"]`)
}

function _setCalloutItems(header: HTMLElement, items: number) {
  header.setAttribute('data-callout-items', String(items))
  const headerBlock = header.closest('.ce-block') as HTMLElement | null
  if (headerBlock) {
    appState.editor?.blocks.getBlockByElement(headerBlock)?.dispatchChange()
  }
}

function _handleCalloutEnter(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return

  const editor = appState.editor
  const block = (event.target as HTMLElement).closest('.ce-block') as HTMLElement | null
  if (!editor || !block) return

  const fk = block.getAttribute('data-callout-fk')
  if (!fk) return

  const header = _getCalloutHeader(fk)
  if (!header) return

  const nextBlock = block.nextElementSibling as HTMLElement | null
  if (_isInCallout(nextBlock, fk)) return

  const blockType = editor.blocks.getBlockByElement(block)?.name || ''
  const path = block.getAttribute('data-callout-path') || fk
  const parentPath = path.split(' ').slice(0, -1).join(' ')
  const items = parseInt(header.getAttribute('data-callout-items') || '0', 10)
  const isEmpty = ENTER_BLOCK_TYPES.includes(blockType) && (block.textContent || '').trim() === ''

  if (isEmpty && items > 1) {
    event.preventDefault()
    event.stopPropagation()
    block.setAttribute('data-callout-path', parentPath)
    _setCalloutItems(header, items - 1)
    applyCalloutForeignKeys()
    return
  }

  const insertedPath = isEmpty ? parentPath : path
  if (!insertedPath) return

  setTimeout(() => {
    const insertedBlock = block.nextElementSibling as HTMLElement | null
    if (!insertedBlock || insertedBlock === nextBlock) return
    insertedBlock.setAttribute('data-callout-path', insertedPath)
    applyCalloutForeignKeys()
  }, 20)
}

let _keydownTarget: Element | null = null

let _observer: MutationObserver | null = null
let _debounce: ReturnType<typeof setTimeout> | null = null

export function initCalloutObserver() {
  if (_observer) {
    _observer.disconnect()
    _observer = null
  }

  _headerPositions.clear()
  _fixingHeaderFk = null

  const redactor = document.querySelector('.codex-editor__redactor')
  if (!redactor) {
    setTimeout(initCalloutObserver, 200)
    return
  }

  _observer = new MutationObserver(() => {
    if (_debounce) clearTimeout(_debounce)
    _debounce = setTimeout(() => {
      applyCalloutForeignKeys()
    }, 80)
  })

  _observer.observe(redactor, { childList: true, subtree: true })

  document.removeEventListener('dragstart', _handleDragStart, true)
  document.removeEventListener('dragend', _handleDragEnd, true)
  document.addEventListener('dragstart', _handleDragStart, true)
  document.addEventListener('dragend', _handleDragEnd, true)

  if (_keydownTarget !== redactor) {
    _keydownTarget?.removeEventListener('keydown', _handleCalloutEnter as EventListener, true)
    redactor.addEventListener('keydown', _handleCalloutEnter as EventListener, true)
    _keydownTarget = redactor
  }

  applyCalloutForeignKeys()

  // render() sometimes resolves before the dom is ready, so retry a few times
  setTimeout(() => applyCalloutForeignKeys(), 300)
  setTimeout(() => applyCalloutForeignKeys(), 800)
  setTimeout(() => applyCalloutForeignKeys(), 1500)
}
