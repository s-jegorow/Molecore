import { getPages, searchPages } from './api'
import { getPagePath } from './ui'
import type { PageMeta, PageSelectCallback } from './types'

interface SwitcherItem {
  id: number
  title: string
  snippet: string | null
}

const RECENT_LIMIT = 8
const RESULT_LIMIT = 20

let items: SwitcherItem[] = []
let selected = 0
let searchSeq = 0
let searchTimer: number | null = null

const TOP_LEVEL_ID = 0
let movingPageId: number | null = null
let onMoveChosen: ((parentId: number | null) => void) | null = null

function elements() {
  return {
    overlay: document.getElementById('quick-switcher'),
    input: document.getElementById('quick-switcher-input') as HTMLInputElement | null,
    results: document.getElementById('quick-switcher-results'),
  }
}

function hasEditorSelection(): boolean {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false
  return !!selection.anchorNode.parentElement?.closest('#editor')
}

function isOpen(): boolean {
  return !!elements().overlay?.classList.contains('active')
}

function openSwitcher(): void {
  const { overlay, input } = elements()
  if (!overlay || !input) return
  overlay.classList.add('active')
  input.value = ''
  input.placeholder = movingPageId === null ? 'Jump to a page...' : 'Move to...'
  input.focus()
  updateResults('')
}

function closeSwitcher(): void {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchSeq++
  movingPageId = null
  onMoveChosen = null
  elements().overlay?.classList.remove('active')
}

export function openMovePicker(pageId: number, onChosen: (parentId: number | null) => void): void {
  movingPageId = pageId
  onMoveChosen = onChosen
  openSwitcher()
}

function pageAndDescendants(pages: PageMeta[], rootId: number): Set<number> {
  const ids = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const page of pages) {
      if (page.parent_id !== null && ids.has(page.parent_id) && !ids.has(page.id)) {
        ids.add(page.id)
        added = true
      }
    }
  }
  return ids
}

async function moveTargets(query: string): Promise<SwitcherItem[]> {
  const pages = await getPages()
  const excluded = pageAndDescendants(pages, movingPageId!)
  const lowerQuery = query.toLowerCase()

  const targets = pages
    .filter(p => !excluded.has(p.id) && p.title.toLowerCase().includes(lowerQuery))
    .map(p => ({ id: p.id, title: p.title, snippet: null }))

  if (query) return targets
  return [{ id: TOP_LEVEL_ID, title: 'Top level', snippet: null }, ...targets]
}

async function updateResults(query: string): Promise<void> {
  const seq = ++searchSeq
  let next: SwitcherItem[]

  try {
    if (movingPageId !== null) {
      next = await moveTargets(query)
    } else if (query) {
      const results = await searchPages(query)
      next = results.slice(0, RESULT_LIMIT)
    } else {
      const pages = await getPages()
      next = [...pages]
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        .slice(0, RECENT_LIMIT)
        .map(p => ({ id: p.id, title: p.title, snippet: null }))
    }
  } catch (error) {
    console.error('Quick switcher search failed:', error)
    return
  }
  if (seq !== searchSeq) return

  items = next
  renderResults(query)
}

function renderResults(query: string): void {
  const { results } = elements()
  if (!results) return
  results.innerHTML = ''

  if (items.length === 0) {
    if (query) results.innerHTML = '<div class="search-no-results">No results found</div>'
    return
  }

  items.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = 'search-result-item quick-switcher-item'
    row.dataset.index = String(index)

    const title = document.createElement('div')
    title.className = 'search-result-title'
    title.textContent = item.title

    row.appendChild(title)

    if (item.id !== TOP_LEVEL_ID) {
      const path = document.createElement('div')
      path.className = 'search-result-path'
      path.textContent = getPagePath(item.id) || item.title
      row.appendChild(path)
    }

    if (item.snippet) {
      const snippet = document.createElement('div')
      snippet.className = 'search-result-snippet'
      snippet.textContent = item.snippet
      row.appendChild(snippet)
    }

    row.addEventListener('mousemove', () => selectItem(index))
    results.appendChild(row)
  })

  selectItem(0)
}

function selectItem(index: number): void {
  const { results } = elements()
  if (!results || items.length === 0) return

  selected = (index + items.length) % items.length
  results.querySelectorAll('.quick-switcher-item').forEach((row, i) => {
    row.classList.toggle('selected', i === selected)
    if (i === selected) row.scrollIntoView({ block: 'nearest' })
  })
}

export function initQuickSwitcher(onPageSelect: PageSelectCallback): void {
  const { overlay, input, results } = elements()
  if (!overlay || !input || !results) return

  const choose = (index: number) => {
    const item = items[index]
    if (!item) return

    if (onMoveChosen) {
      const moveCallback = onMoveChosen
      closeSwitcher()
      moveCallback(item.id === TOP_LEVEL_ID ? null : item.id)
      return
    }

    closeSwitcher()
    onPageSelect(item.id)
  }

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.code !== 'KeyK') return
    if (!isOpen() && hasEditorSelection()) return

    e.preventDefault()
    e.stopPropagation()
    if (isOpen()) closeSwitcher()
    else openSwitcher()
  }, true)

  input.addEventListener('input', () => {
    if (searchTimer !== null) clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => updateResults(input.value.trim()), 150)
  })

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectItem(selected + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectItem(selected - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSwitcher()
    }
  })

  results.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('.quick-switcher-item') as HTMLElement | null
    if (row) choose(parseInt(row.dataset.index || '0'))
  })

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSwitcher()
  })
}
