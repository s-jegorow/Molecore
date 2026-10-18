import { getPages, createPage, updatePage, getPreferences, searchPages } from './api'
import { appState } from './state'
import type { PageMeta, PageSelectCallback, SearchResult } from './types'
import { showIconPicker } from './iconPicker'
import { isImageIcon } from './utils'

let activePageId: number | null = null
let allPages: PageMeta[] = []
let dashboardEnabled = true
let pendingNavigation: number | null = null

function cancelPendingNavigation(): void {
  if (pendingNavigation !== null) {
    clearTimeout(pendingNavigation)
    pendingNavigation = null
  }
}

const EXPANDED_KEY = 'expandedPages'
const expandedPages: Set<number> = loadExpanded()

function loadExpanded(): Set<number> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    return new Set(raw ? (JSON.parse(raw) as number[]) : [])
  } catch {
    return new Set()
  }
}

function saveExpanded(): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedPages]))
  } catch {
    return
  }
}

export function initPageList(onPageSelect: PageSelectCallback) {
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle')
  const mobileOverlay = document.getElementById('mobile-overlay')
  const mobileNewPageBtn = document.getElementById('mobile-new-page-btn')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const searchResults = document.getElementById('search-results')

  if (!mobileMenuToggle || !mobileOverlay || !mobileNewPageBtn) {
    return
  }

  mobileMenuToggle.addEventListener('click', () => {
    if (mobileOverlay.classList.contains('active')) {
      closeMobileMenu()
    } else {
      openMobileMenu()
    }
  })

  mobileOverlay.addEventListener('click', (e) => {
    if (e.target === mobileOverlay) {
      closeMobileMenu()
    }
  })

  mobileNewPageBtn.addEventListener('click', async () => {
    try {
      const newPage = await createPage({
        title: 'Untitled',
        content: { blocks: [] }
      })
      await loadPages()
      closeMobileMenu()
      onPageSelect(newPage.id)
    } catch (error) {
      console.error('Failed to create page:', error)
    }
  })

  const demoBackBtn = document.getElementById('demo-back-btn')
  if (demoBackBtn) {
    demoBackBtn.addEventListener('click', async () => {
      closeMobileMenu()
      const { navigateToHomePage } = await import('./pages')
      await navigateToHomePage()
    })
  }

  window.addEventListener('iconUpdated', () => {
    loadPages()
  })

  if (searchInput && searchResults) {
    let searchTimer: number | null = null
    searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.trim()
      if (searchTimer !== null) clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => runSearch(query, onPageSelect), 200)
    })

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target as Node) && !searchResults.contains(e.target as Node)) {
        searchResults.innerHTML = ''
      }
    })
  }

  const lists = [
    document.getElementById('mobile-pages-list'),
    document.getElementById('mobile-favorites-list'),
  ]

  lists.forEach(list => {
    list?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const pageItem = target.closest('.page-item') as HTMLElement | null
      if (!pageItem) return

      const pageId = parseInt(pageItem.dataset.pageId || '0')
      if (!pageId) return

      if (target.closest('.page-toggle')) {
        toggleExpanded(pageId)
        return
      }

      if (target.closest('.page-icon') || target.closest('.page-item-edit')) {
        return
      }

      const navigate = () => {
        pendingNavigation = null
        closeMobileMenu()
        onPageSelect(pageId)
        setActivePage(pageId)
      }

      cancelPendingNavigation()
      if (target.closest('.page-title') && pageItem.dataset.editable === 'true') {
        pendingNavigation = window.setTimeout(navigate, 250)
      } else {
        navigate()
      }
    })
  })

  loadPages()
}

export async function refreshSidebar(): Promise<void> {
  await loadPages()
}

function ancestorsOf(pageId: number): number[] {
  const pageMap = new Map(allPages.map(p => [p.id, p]))
  const result: number[] = []
  const seen = new Set<number>()
  let current = pageMap.get(pageId)?.parent_id ?? null
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    result.push(current)
    current = pageMap.get(current)?.parent_id ?? null
  }
  return result
}

export function setActivePage(pageId: number) {
  activePageId = pageId

  const missing = ancestorsOf(pageId).filter(id => !expandedPages.has(id))
  if (missing.length > 0) {
    missing.forEach(id => expandedPages.add(id))
    saveExpanded()
    renderSidebar()
    return
  }

  document.querySelectorAll('.page-item').forEach(item => {
    item.classList.toggle('active', (item as HTMLElement).dataset.pageId === String(pageId))
  })
}

function toggleExpanded(pageId: number): void {
  if (expandedPages.has(pageId)) expandedPages.delete(pageId)
  else expandedPages.add(pageId)
  saveExpanded()
  renderSidebar()
}

export function initDarkMode() {
  const mobileDarkmodeBtn = document.getElementById('mobile-darkmode-btn')

  const savedMode = localStorage.getItem('darkMode')
  let isDarkMode = savedMode !== null ? savedMode === 'true' : true

  function updateLogo() {
    const landingLogo = document.getElementById('landing-logo') as HTMLImageElement
    if (landingLogo) {
      landingLogo.src = isDarkMode ? '/molecore-logo-dark.png' : '/molecore-logo-light.png'
    }
  }

  function updateDarkmodeIcon() {
    const moonIcon = isDarkMode ? '🌙' : '☾'
    if (mobileDarkmodeBtn) mobileDarkmodeBtn.textContent = moonIcon
  }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode
    localStorage.setItem('darkMode', String(isDarkMode))

    if (isDarkMode) {
      document.body.classList.add('dark-mode')
      mobileDarkmodeBtn?.classList.add('active')
    } else {
      document.body.classList.remove('dark-mode')
      mobileDarkmodeBtn?.classList.remove('active')
    }

    updateLogo()
    updateDarkmodeIcon()
  }

  if (isDarkMode) {
    document.body.classList.add('dark-mode')
    mobileDarkmodeBtn?.classList.add('active')
  }
  updateLogo()
  updateDarkmodeIcon()

  mobileDarkmodeBtn?.addEventListener('click', toggleDarkMode)
}

async function loadPages() {
  try {
    const [pages, prefs] = await Promise.all([
      getPages(),
      getPreferences().catch(() => ({} as Record<string, any>)),
    ])
    allPages = pages
    dashboardEnabled = prefs.dashboard_enabled ?? true
    renderSidebar()

    const searchInput = document.getElementById('search-input') as HTMLInputElement
    const searchResults = document.getElementById('search-results')
    if (searchInput) searchInput.value = ''
    if (searchResults) searchResults.innerHTML = ''
  } catch (error) {
    console.error('Failed to load pages:', error)
  }
}

function buildChildrenMap(): Map<number | null, PageMeta[]> {
  const ids = new Set(allPages.map(p => p.id))
  const map = new Map<number | null, PageMeta[]>()
  allPages.forEach(page => {
    const parent = page.parent_id !== null && ids.has(page.parent_id) ? page.parent_id : null
    if (!map.has(parent)) map.set(parent, [])
    map.get(parent)!.push(page)
  })
  return map
}

function renderSidebar(): void {
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')
  if (!mobilePagesList) return

  const childrenMap = buildChildrenMap()
  const homePage = allPages.find(p => p.page_type === 'home')
  const roots = (childrenMap.get(null) || []).filter(p => p.page_type !== 'home')
  if (homePage && !dashboardEnabled) {
    roots.push(...(childrenMap.get(homePage.id) || []))
  }

  if (mobileFavoritesList) {
    mobileFavoritesList.innerHTML = ''

    if (homePage && dashboardEnabled) {
      mobileFavoritesList.appendChild(createPageNode(homePage, 0, childrenMap, { label: 'Dashboard', icon: '🏠', editable: false }))
    }

    allPages
      .filter(page => page.page_type === 'favorite')
      .forEach(page => mobileFavoritesList.appendChild(createPageNode(page, 0, childrenMap)))
  }

  mobilePagesList.innerHTML = ''
  roots
    .filter(page => page.page_type !== 'favorite')
    .forEach(page => mobilePagesList.appendChild(createPageNode(page, 0, childrenMap)))
}

function createPageNode(
  page: PageMeta,
  depth: number,
  childrenMap: Map<number | null, PageMeta[]>,
  options: { label?: string; icon?: string; editable?: boolean } = {},
  visited: Set<number> = new Set()
): HTMLElement {
  const node = document.createElement('div')
  node.className = 'page-node'

  const children = visited.has(page.id) ? [] : (childrenMap.get(page.id) || [])
  const nextVisited = new Set(visited).add(page.id)
  const expanded = expandedPages.has(page.id)

  const pageItem = createPageItem(page, depth, children.length > 0, expanded, options)
  node.appendChild(pageItem)

  if (children.length > 0 && expanded) {
    const childList = document.createElement('div')
    childList.className = 'page-children'
    children.forEach(child => childList.appendChild(createPageNode(child, depth + 1, childrenMap, {}, nextVisited)))
    node.appendChild(childList)
  }

  return node
}

function createPageItem(
  page: PageMeta,
  depth: number,
  hasChildren: boolean,
  expanded: boolean,
  options: { label?: string; icon?: string; editable?: boolean }
): HTMLElement {
  const editable = options.editable !== false
  let currentTitle = page.title

  const pageItem = document.createElement('div')
  pageItem.className = 'page-item'
  pageItem.dataset.pageId = String(page.id)
  if (depth > 0) pageItem.style.paddingLeft = `calc(var(--spacing-lg) + ${depth * 16}px)`

  const toggle = document.createElement('span')
  toggle.className = 'page-toggle' + (hasChildren ? '' : ' page-toggle-empty')
  toggle.textContent = hasChildren ? (expanded ? '▾' : '▸') : ''

  const iconEl = document.createElement('span')
  iconEl.className = 'page-icon'
  iconEl.style.cssText = 'margin-right: 8px; user-select: none; display: inline-flex; align-items: center; font-size: 16px;'

  const icon = options.icon ?? page.icon
  if (isImageIcon(icon)) {
    const img = document.createElement('img')
    img.src = icon!
    img.style.cssText = 'width: 20px; height: 20px; object-fit: cover; border-radius: 2px;'
    iconEl.appendChild(img)
  } else {
    iconEl.textContent = icon || '📄'
  }

  const titleEl = document.createElement('span')
  titleEl.className = 'page-title'
  titleEl.textContent = options.label ?? page.title
  titleEl.style.cssText = 'flex: 1; cursor: default; text-decoration: none;'

  pageItem.appendChild(toggle)
  pageItem.appendChild(iconEl)
  pageItem.appendChild(titleEl)

  if (page.id === activePageId) {
    pageItem.classList.add('active')
  }

  if (!editable) return pageItem
  pageItem.dataset.editable = 'true'

  iconEl.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    e.preventDefault()
    showIconPicker(page.id, iconEl, () => {
      loadPages()
    })
  })

  titleEl.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    cancelPendingNavigation()
    const input = document.createElement('input')
    input.type = 'text'
    input.value = currentTitle
    input.className = 'page-item-edit'

    input.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #007bff;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      background: transparent;
      color: var(--color-text-primary);
    `

    let cancelled = false

    const saveTitle = async () => {
      if (cancelled) return
      const newTitle = input.value.trim() || 'Untitled'
      titleEl.textContent = newTitle
      if (newTitle === currentTitle) return
      try {
        await updatePage(page.id, { title: newTitle })
        currentTitle = newTitle
        page.title = newTitle

        if (page.id === appState.currentPageId) {
          const headerInput = document.getElementById('page-title') as HTMLInputElement
          if (headerInput) {
            headerInput.value = newTitle
          }
        }
      } catch (error) {
        console.error('Failed to update title:', error)
        titleEl.textContent = currentTitle
      }
    }

    input.addEventListener('blur', saveTitle)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur()
      } else if (e.key === 'Escape') {
        cancelled = true
        titleEl.textContent = currentTitle
      }
    })

    titleEl.textContent = ''
    titleEl.appendChild(input)
    input.focus()
    input.select()
  })

  return pageItem
}

function getPagePath(pageId: number): string {
  const pageMap = new Map(allPages.map(p => [p.id, p]))
  const path: string[] = []
  const seen = new Set<number>()
  let currentId: number | null = pageId

  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId)
    const page = pageMap.get(currentId)
    if (!page) break
    path.unshift(page.title)
    currentId = page.parent_id
  }

  return path.join(' / ')
}

let searchSeq = 0

async function runSearch(query: string, onPageSelect: PageSelectCallback) {
  const searchResults = document.getElementById('search-results')
  if (!searchResults) return

  const seq = ++searchSeq
  if (!query) {
    searchResults.innerHTML = ''
    return
  }

  let results: SearchResult[]
  try {
    results = await searchPages(query)
  } catch (error) {
    console.error('Search failed:', error)
    return
  }
  if (seq !== searchSeq) return

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No results found</div>'
    return
  }

  searchResults.innerHTML = ''
  results.forEach(({ id, title: pageTitle, snippet }) => {
    const resultItem = document.createElement('div')
    resultItem.className = 'search-result-item'

    const title = document.createElement('div')
    title.className = 'search-result-title'
    title.textContent = pageTitle

    const path = document.createElement('div')
    path.className = 'search-result-path'
    path.textContent = getPagePath(id) || pageTitle

    resultItem.appendChild(title)
    resultItem.appendChild(path)

    if (snippet) {
      const snippetEl = document.createElement('div')
      snippetEl.className = 'search-result-snippet'
      snippetEl.textContent = snippet
      resultItem.appendChild(snippetEl)
    }

    resultItem.addEventListener('click', () => {
      closeMobileMenu()
      onPageSelect(id)
      searchResults.innerHTML = ''
      const searchInput = document.getElementById('search-input') as HTMLInputElement
      if (searchInput) searchInput.value = ''
    })

    searchResults.appendChild(resultItem)
  })
}

function openMobileMenu() {
  const overlay = document.getElementById('mobile-overlay')
  if (overlay) {
    overlay.classList.add('active')
  }
}

function closeMobileMenu() {
  const overlay = document.getElementById('mobile-overlay')
  if (overlay) {
    overlay.classList.remove('active')
  }
}

export function initReadMode() {
  const readModeBtn = document.getElementById('readmode-btn')
  let isReadMode = localStorage.getItem('readMode') === 'true'

  async function applyReadMode() {
    document.body.classList.toggle('read-mode', isReadMode)
    if (readModeBtn) {
      readModeBtn.classList.toggle('active', isReadMode)
      readModeBtn.title = isReadMode ? 'Edit Mode (⌘⇧R)' : 'Read Mode (⌘⇧R)'
    }

    if (appState.editor) {
      try {
        await appState.editor.isReady
        await appState.editor.readOnly.toggle(isReadMode)
      } catch (error) {
        console.error('Failed to toggle read mode:', error)
      }
    }
  }

  function toggleReadMode() {
    isReadMode = !isReadMode
    localStorage.setItem('readMode', String(isReadMode))
    applyReadMode()
  }

  if (isReadMode) {
    applyReadMode()
  }

  readModeBtn?.addEventListener('click', toggleReadMode)

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyR') {
      e.preventDefault()
      toggleReadMode()
    }
  })
}
