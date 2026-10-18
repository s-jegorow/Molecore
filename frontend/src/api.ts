import type { Page, PageMeta, PageCreate, PageUpdate, SearchResult } from './types'
import { getToken } from './auth'
import { appState } from './state'

export const API_URL = ''

function base(): string {
  return appState.isDemo ? '/api/demo' : `${API_URL}/api`
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  }
}

async function errorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.detail === 'string') return data.detail
  } catch {
    return fallback
  }
  return fallback
}

let _pagesCache: { data: PageMeta[]; ts: number } | null = null
let _pagesFetch: Promise<PageMeta[]> | null = null
const PAGES_CACHE_MS = 3000

export async function getPages(): Promise<PageMeta[]> {
  if (_pagesCache && Date.now() - _pagesCache.ts < PAGES_CACHE_MS) {
    return _pagesCache.data
  }
  // reuse the running request so pageblocks don't fetch one by one
  if (_pagesFetch) return _pagesFetch

  _pagesFetch = (async () => {
    const response = await fetch(`${base()}/pages`, {
      headers: await getAuthHeaders()
    })
    if (!response.ok) throw new Error('Failed to fetch pages')
    const data = await response.json()
    _pagesCache = { data, ts: Date.now() }
    return data as PageMeta[]
  })().finally(() => {
    _pagesFetch = null
  })

  return _pagesFetch
}

export function invalidatePagesCache(): void {
  _pagesCache = null
}

export async function searchPages(query: string): Promise<SearchResult[]> {
  const response = await fetch(`${base()}/search?q=${encodeURIComponent(query)}`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Search failed')
  return response.json()
}

export async function getPage(id: number): Promise<Page> {
  const response = await fetch(`${base()}/pages/${id}`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch page')
  return response.json()
}

export async function createPage(data: PageCreate): Promise<Page> {
  invalidatePagesCache()
  const response = await fetch(`${base()}/pages`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error(await errorDetail(response, 'Failed to create page'))
  return response.json()
}

export async function updatePage(id: number, data: PageUpdate, options: { keepalive?: boolean } = {}): Promise<Page> {
  invalidatePagesCache()
  const body = JSON.stringify(data)
  const response = await fetch(`${base()}/pages/${id}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body,
    keepalive: !!options.keepalive && body.length < 60000
  })
  if (!response.ok) throw new Error(await errorDetail(response, 'Failed to update page'))
  return response.json()
}

export async function deletePage(id: number, cascade = false): Promise<void> {
  invalidatePagesCache()
  const url = cascade ? `${base()}/pages/${id}?cascade=true` : `${base()}/pages/${id}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error(await errorDetail(response, 'Failed to delete page'))
}

export async function getNotepad(): Promise<Page> {
  const response = await fetch(`${base()}/notepad`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch notepad')
  return response.json()
}

export async function getTodo(): Promise<Page> {
  const response = await fetch(`${base()}/todo`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch todo')
  return response.json()
}

export async function uploadFile(file: File, uploadType?: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  if (uploadType) formData.append('upload_type', uploadType)

  const token = await getToken()
  const response = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    body: formData
  })
  if (!response.ok) throw new Error(await errorDetail(response, 'Upload failed'))
  const data = await response.json()
  return `${API_URL}${data.url}`
}

export interface CalendarEvent {
  id: number
  date: string
  title: string
  time: string | null
  color: string | null
}

export async function getCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const response = await fetch(`${base()}/calendar?year=${year}&month=${month}`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch calendar events')
  return response.json()
}

export async function createCalendarEvent(data: { date: string; title: string; time?: string; color?: string }): Promise<CalendarEvent> {
  const response = await fetch(`${base()}/calendar`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create calendar event')
  return response.json()
}

export async function updateCalendarEvent(id: number, data: { title?: string; time?: string; color?: string }): Promise<CalendarEvent> {
  const response = await fetch(`${base()}/calendar/${id}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update calendar event')
  return response.json()
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const response = await fetch(`${base()}/calendar/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to delete calendar event')
}

let _prefsFetch: Promise<Record<string, any>> | null = null

export async function getPreferences(): Promise<Record<string, any>> {
  if (!_prefsFetch) {
    _prefsFetch = (async () => {
      const response = await fetch(`${base()}/preferences`, {
        headers: await getAuthHeaders()
      })
      if (!response.ok) throw new Error('Failed to fetch preferences')
      return response.json()
    })()
    _prefsFetch.catch(() => { _prefsFetch = null })
  }
  return _prefsFetch
}

export async function updatePreferences(data: Record<string, any>): Promise<Record<string, any>> {
  const response = await fetch(`${base()}/preferences`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update preferences')
  const prefs = await response.json()
  _prefsFetch = Promise.resolve(prefs)
  return prefs
}
