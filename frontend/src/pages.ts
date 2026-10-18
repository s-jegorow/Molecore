import { getPage, getPages, updatePage, deletePage, getPreferences, uploadFile } from './api'
import { setActivePage, refreshSidebar } from './ui'
import { appState } from './state'
import { Modal } from './Modal'
import { initCalloutObserver } from './CalloutBlock'

async function buildBreadcrumbs(pageId: number) {
  const breadcrumbsContainer = document.getElementById('breadcrumbs')
  if (!breadcrumbsContainer) return

  try {
    const allPages = await getPages()
    const pageMap = new Map(allPages.map(p => [p.id, p]))

    const path: Array<{ id: number; title: string }> = []
    let currentId: number | null = pageId

    while (currentId !== null) {
      const page = pageMap.get(currentId)
      if (!page) break

      path.unshift({ id: page.id, title: page.title })
      currentId = page.parent_id
    }

    breadcrumbsContainer.innerHTML = ''
    path.forEach((item, index) => {
      const isLast = index === path.length - 1

      if (index > 0) {
        const sep = document.createElement('span')
        sep.className = 'breadcrumb-separator'
        sep.textContent = '/'
        breadcrumbsContainer.appendChild(sep)
      }

      if (isLast) {
        const span = document.createElement('span')
        span.className = 'breadcrumb-current'
        span.textContent = item.title
        breadcrumbsContainer.appendChild(span)
      } else {
        const link = document.createElement('a')
        link.href = '#'
        link.className = 'breadcrumb-link'
        link.dataset.pageId = String(item.id)
        link.textContent = item.title
        link.addEventListener('click', (e) => {
          e.preventDefault()
          loadPage(item.id)
        })
        breadcrumbsContainer.appendChild(link)
      }
    })
  } catch (error) {
    console.error('Failed to build breadcrumbs:', error)
  }
}

function updateDeleteButtonVisibility(isHomePage: boolean) {
  const deleteBtn = document.getElementById('delete-btn')
  const favoriteBtn = document.getElementById('favorite-btn')
  if (deleteBtn) deleteBtn.style.display = isHomePage ? 'none' : 'flex'
  if (favoriteBtn) favoriteBtn.style.display = isHomePage ? 'none' : ''
}

function updateFavoriteButton(isFavorite: boolean) {
  const favoriteBtn = document.getElementById('favorite-btn')
  if (!favoriteBtn) return

  favoriteBtn.classList.toggle('is-favorite', isFavorite)
  favoriteBtn.title = isFavorite ? 'Remove from favorites' : 'Add to favorites'
}

function updateHeaderImage(headerPath: string | null | undefined) {
  const header = document.querySelector('header')
  if (!header) return

  if (headerPath) {
    (header as HTMLElement).style.backgroundImage = `url('${headerPath}')`
  } else {
    (header as HTMLElement).style.backgroundImage = ''
  }
}

let loadSeq = 0

export async function loadPage(pageId: number) {
  const seq = ++loadSeq
  if (appState.isDemo) {
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = 'none'
    if (appContent) appContent.classList.add('active')
  }

  await flushSave(false, true)

  try {
    const page = await getPage(pageId)
    if (seq !== loadSeq) return

    setSyncIndicator('ok')
    appState.suppressIdleUntil = Date.now() + 800
    appState.currentPageId = null

    if (appState.editor) {
      await appState.editor.isReady
      await appState.editor.clear()
      await appState.editor.render(page.content)

      initCalloutObserver()
    }
    if (seq !== loadSeq) return

    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = page.title
      setTitleColor(pageTitleInput, parseTitleColor((page.content as any)?.title_color))
    }

    appState.currentPageId = pageId
    lastSavedSnapshot = await currentSnapshot()

    if (appState.editor && appState.undoManager) {
      appState.undoManager.clear()
      await appState.undoManager.captureState()
      window.dispatchEvent(new CustomEvent('undoStateChanged'))
    }

    setActivePage(pageId)

    await buildBreadcrumbs(pageId)

    updateFavoriteButton(page.page_type === 'favorite')

    updateHeaderImage(page.header)

    updateDeleteButtonVisibility(page.page_type === 'home')

  } catch (error) {
    console.error('Failed to load page:', error)
  }
}

export async function navigateToHomePage(): Promise<void> {
  if (appState.isDemo) {
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = ''
    if (appContent) appContent.classList.remove('active')
    return
  }

  try {
    const [allPages, prefs] = await Promise.all([getPages(), getPreferences().catch(() => ({}))])
    const dashboardEnabled = (prefs as any).dashboard_enabled ?? true

    if (dashboardEnabled) {
      const homePage = allPages.find(p => p.page_type === 'home')
      if (homePage) {
        await loadPage(homePage.id)
        return
      }
    }

    const firstFavorite = allPages.find(p => p.page_type === 'favorite' && !p.parent_id)
    const firstPage = allPages.find(p => p.page_type !== 'home' && !p.parent_id)
    const target = firstFavorite || firstPage || allPages.find(p => p.page_type === 'home')
    if (target) await loadPage(target.id)
  } catch (error) {
    console.error('Failed to load home page:', error)
  }
}

function setSyncIndicator(status: 'idle' | 'ok' | 'error') {
  const el = document.getElementById('sync-indicator')
  if (!el) return
  el.classList.remove('sync-idle', 'sync-ok', 'sync-error')
  el.classList.add(`sync-${status}`)
  el.title = status === 'ok' ? 'Saved' : status === 'error' ? 'Save failed' : 'Not yet saved'
}

let saveTimer: number | null = null
let dirtyPageId: number | null = null
let saveInFlight: Promise<void> | null = null
let lastSavedSnapshot = ''

function clearSaveTimer(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

async function currentSnapshot(): Promise<string> {
  if (!appState.editor) return ''
  const content = await appState.editor.save()
  const titleInput = document.getElementById('page-title') as HTMLInputElement | null
  return JSON.stringify({
    blocks: content.blocks,
    title: titleInput?.value || 'Untitled',
    color: titleInput?.dataset.titleColor || ''
  })
}

async function saveNow(pageId: number, keepalive: boolean): Promise<void> {
  try {
    const editor = appState.editor!
    await editor.isReady
    const content = await editor.save()
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    const title = pageTitleInput?.value || 'Untitled'
    const titleColor = pageTitleInput?.dataset.titleColor || ''
    if (titleColor) (content as any).title_color = titleColor

    const snapshot = JSON.stringify({ blocks: content.blocks, title, color: titleColor })
    if (snapshot !== lastSavedSnapshot) {
      await updatePage(pageId, { content, title }, { keepalive })
      lastSavedSnapshot = snapshot
    }
    setSyncIndicator('ok')
  } catch (error) {
    console.error('Auto-save failed:', error)
    setSyncIndicator('error')
    if (dirtyPageId === null && appState.currentPageId === pageId) {
      dirtyPageId = pageId
      clearSaveTimer()
      saveTimer = window.setTimeout(() => { flushSave() }, 5000)
    }
  }
}

export async function flushSave(keepalive = false, force = false): Promise<void> {
  clearSaveTimer()
  if (saveInFlight) await saveInFlight
  if (force && appState.currentPageId) dirtyPageId = appState.currentPageId
  if (dirtyPageId === null) return
  const pageId = dirtyPageId
  dirtyPageId = null
  if (appState.isDemo || !appState.editor || pageId !== appState.currentPageId) return

  saveInFlight = saveNow(pageId, keepalive).finally(() => {
    saveInFlight = null
  })
  await saveInFlight
}

export function hasPendingSave(): boolean {
  return dirtyPageId !== null || saveInFlight !== null
}

export async function scheduleAutoSave(): Promise<void> {
  if (appState.isDemo) return
  const pageId = appState.currentPageId
  if (!pageId) return
  if (Date.now() > appState.suppressIdleUntil) setSyncIndicator('idle')
  dirtyPageId = pageId
  clearSaveTimer()
  saveTimer = window.setTimeout(() => { flushSave() }, 2000)
}

export function setupHeaderUpload(): void {
  const headerElement = document.querySelector('header')
  headerElement?.addEventListener('dblclick', async (e) => {
    if ((e.target as HTMLElement).id === 'page-title') return
    if (!appState.currentPageId) return
    if (appState.isDemo) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const pageId = appState.currentPageId
      if (!pageId) return

      try {
        const headerPath = await uploadFile(file, 'header')
        await updatePage(pageId, { header: headerPath })
        if (appState.currentPageId === pageId) updateHeaderImage(headerPath)
      } catch (error: any) {
        console.error('Failed to upload header:', error)
        await Modal.error(error?.message || 'Failed to upload header image.')
      }
    })
    input.click()
  })
}

export function setupPageTitleHandler(): void {
  const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
  pageTitleInput?.addEventListener('blur', async () => {
    if (!appState.currentPageId) return

    const newTitle = pageTitleInput.value || 'Untitled'

    try {
      await updatePage(appState.currentPageId, { title: newTitle })
      const pageItems = document.querySelectorAll(`[data-page-id="${appState.currentPageId}"]`)
      pageItems.forEach(pageItem => {
        const titleEl = pageItem.querySelector('.page-title')
        if (titleEl) {
          titleEl.textContent = newTitle
        }
      })
    } catch (error) {
      console.error('Failed to update title:', error)
    }
  })
}

export function setupFavoriteButton(): void {
  const favoriteBtn = document.getElementById('favorite-btn')
  favoriteBtn?.addEventListener('click', async () => {
    if (!appState.currentPageId) return

    try {
      const page = await getPage(appState.currentPageId)
      if (page.page_type === 'home') return

      const newPageType = page.page_type === 'favorite' ? 'normal' : 'favorite'

      await updatePage(appState.currentPageId, { page_type: newPageType })
      updateFavoriteButton(newPageType === 'favorite')
      await refreshSidebar()
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  })
}

function setupDeleteButton(): void {
  const deleteBtn = document.getElementById('delete-btn')
  deleteBtn?.addEventListener('click', async () => {
    if (!appState.currentPageId) return

    const { confirmed, checked: cascade } = await Modal.confirmWithCheckbox(
      'Are you sure you want to delete this page? This action cannot be undone.',
      'Also delete all subpages',
      'Delete Page'
    )
    if (!confirmed) return

    try {
      await deletePage(appState.currentPageId, cascade)
      await refreshSidebar()
      await navigateToHomePage()
    } catch (error: any) {
      console.error('Failed to delete page:', error)
      const errorMessage = error?.message || 'Failed to delete page. Please try again.'
      await Modal.error(errorMessage)
    }
  })
}

function setupLogoHandler(): void {
  const logoElement = document.querySelector('.logo')
  logoElement?.addEventListener('click', async (e) => {
    e.preventDefault()
    await navigateToHomePage()
  })
}

function setupPageBlockAutoSave(): void {
  window.addEventListener('pageBlockCreated', async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    await scheduleAutoSave()
    await flushSave()
    await refreshSidebar()
  })
}

function setupPageBlockNavigation(): void {
  window.addEventListener('navigateToPage', (e: any) => {
    const pageId = e.detail?.pageId
    if (pageId) {
      loadPage(pageId)
    }
  })
}

export function setupPageEventListeners(): void {
  setupHeaderUpload()
  setupPageTitleHandler()
  setupFavoriteButton()
  setupDeleteButton()
  setupLogoHandler()
  setupPageBlockAutoSave()
  setupPageBlockNavigation()
  setupTitleColorPicker()
  setupDragScroll()
  setupUnloadSave()
}

function setupUnloadSave(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave(true, true)
  })
  window.addEventListener('beforeunload', (e) => {
    if (!hasPendingSave()) return
    flushSave(true)
    e.preventDefault()
    e.returnValue = ''
  })
}

function setupDragScroll(): void {
  const main = document.querySelector('main')
  if (!main) return

  let rafId: number | null = null
  let scrollSpeed = 0

  const tick = () => {
    if (scrollSpeed !== 0) {
      main.scrollTop += scrollSpeed
      rafId = requestAnimationFrame(tick)
    } else {
      rafId = null
    }
  }

  document.addEventListener('dragover', (e) => {
    const rect = main.getBoundingClientRect()
    const zone = 80
    const maxSpeed = 14

    if (e.clientY > rect.bottom - zone) {
      scrollSpeed = maxSpeed * ((e.clientY - (rect.bottom - zone)) / zone)
    } else if (e.clientY < rect.top + zone) {
      scrollSpeed = -maxSpeed * (((rect.top + zone) - e.clientY) / zone)
    } else {
      scrollSpeed = 0
    }

    if (scrollSpeed !== 0 && rafId === null) rafId = requestAnimationFrame(tick)
    if (scrollSpeed === 0 && rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  })

  document.addEventListener('dragend', () => {
    scrollSpeed = 0
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  })
}

const TITLE_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Gray',    value: '#888888' },
  { label: 'Red',     value: '#e03e3e' },
  { label: 'Orange',  value: '#d9730d' },
  { label: 'Yellow',  value: '#c19a00' },
  { label: 'Green',   value: '#0f7b6c' },
  { label: 'Blue',    value: '#0b6e99' },
  { label: 'Purple',  value: '#6940a5' },
  { label: 'Pink',    value: '#ad1a72' },
  { label: 'White',   value: '#ffffff' },
]

export function applyTitleColorIndicator(color: string): void {
  const indicator = document.getElementById('title-color-indicator')
  if (indicator) indicator.style.background = color || 'var(--color-text-primary)'
}

function parseTitleColor(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  const m = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/)
  if (!m) return ''
  return '#' + m.slice(1, 4).map(n => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0')).join('')
}

function setTitleColor(titleInput: HTMLInputElement, color: string): void {
  titleInput.dataset.titleColor = color
  titleInput.style.color = color
  applyTitleColorIndicator(color)
}

function setupTitleColorPicker(): void {
  const btn = document.getElementById('title-color-btn')
  const titleInput = document.getElementById('page-title') as HTMLInputElement
  if (!btn || !titleInput) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()

    document.getElementById('title-color-popover')?.remove()

    const popover = document.createElement('div')
    popover.id = 'title-color-popover'
    popover.className = 'title-color-popover'

    TITLE_COLORS.forEach(({ label, value }) => {
      const swatch = document.createElement('button')
      swatch.className = 'title-color-swatch'
      swatch.title = label
      swatch.style.background = value || 'transparent'
      if (!value) {
        swatch.classList.add('title-color-swatch--default')
        swatch.textContent = '✕'
      }
      if ((titleInput.dataset.titleColor || '') === value) swatch.classList.add('active')

      swatch.addEventListener('click', (ev) => {
        ev.stopPropagation()
        setTitleColor(titleInput, value)
        popover.remove()
        scheduleAutoSave()
      })
      popover.appendChild(swatch)
    })

    document.body.appendChild(popover)

    const rect = btn.getBoundingClientRect()
    const popoverWidth = popover.getBoundingClientRect().width || 160
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))
    popover.style.top = `${rect.bottom + 6}px`
    popover.style.left = `${left}px`

    const close = (ev: MouseEvent) => {
      if (!popover.contains(ev.target as Node)) {
        popover.remove()
        document.removeEventListener('click', close)
      }
    }
    setTimeout(() => document.addEventListener('click', close), 0)
  })
}
