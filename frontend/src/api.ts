import type { Page, PageCreate, PageUpdate } from './types'
import { getToken } from './auth'
import { appState } from './state'

// Production only - nginx handles routing
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

// Alle Pages laden (mit kurzem Cache damit PageBlocks nicht je einzeln fetchen)
let _pagesCache: { data: Page[]; ts: number } | null = null
let _pagesFetch: Promise<Page[]> | null = null
const PAGES_CACHE_MS = 3000 // 3 Sekunden

export async function getPages(): Promise<Page[]> {
  if (_pagesCache && Date.now() - _pagesCache.ts < PAGES_CACHE_MS) {
    return _pagesCache.data
  }
  // Deduplicate: wenn bereits ein Request läuft, dasselbe Promise zurückgeben
  if (_pagesFetch) return _pagesFetch

  _pagesFetch = (async () => {
    const response = await fetch(`${base()}/pages`, {
      headers: await getAuthHeaders()
    })
    if (!response.ok) throw new Error('Failed to fetch pages')
    const data = await response.json()
    _pagesCache = { data, ts: Date.now() }
    return data as Page[]
  })().finally(() => {
    _pagesFetch = null
  })

  return _pagesFetch
}

export function invalidatePagesCache(): void {
  _pagesCache = null
}

// Eine Page laden
export async function getPage(id: number): Promise<Page> {
  const response = await fetch(`${base()}/pages/${id}`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch page')
  return response.json()
}

// Neue Page erstellen
export async function createPage(data: PageCreate): Promise<Page> {
  invalidatePagesCache()
  const response = await fetch(`${base()}/pages`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create page')
  return response.json()
}

// Page updaten
export async function updatePage(id: number, data: PageUpdate): Promise<Page> {
  invalidatePagesCache()
  const response = await fetch(`${base()}/pages/${id}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update page')
  return response.json()
}

// Page löschen
export async function deletePage(id: number, cascade = false): Promise<void> {
  invalidatePagesCache()
  const url = cascade ? `${base()}/pages/${id}?cascade=true` : `${base()}/pages/${id}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to delete page')
}

// Notepad laden/erstellen
export async function getNotepad(): Promise<Page> {
  const response = await fetch(`${base()}/notepad`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch notepad')
  return response.json()
}

// Todo laden/erstellen
export async function getTodo(): Promise<Page> {
  const response = await fetch(`${base()}/todo`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch todo')
  return response.json()
}

// Calendar
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
    headers: { 'Content-Type': 'application/json', ...await getAuthHeaders() },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create calendar event')
  return response.json()
}

export async function updateCalendarEvent(id: number, data: { title?: string; time?: string; color?: string }): Promise<CalendarEvent> {
  const response = await fetch(`${base()}/calendar/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...await getAuthHeaders() },
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

// User Preferences
export async function getPreferences(): Promise<Record<string, any>> {
  const response = await fetch(`${base()}/preferences`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch preferences')
  return response.json()
}

export async function updatePreferences(data: Record<string, any>): Promise<Record<string, any>> {
  const response = await fetch(`${base()}/preferences`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update preferences')
  return response.json()
}
