import type { Page, PageCreate, PageUpdate } from './types'
import { getToken } from './auth'

// Production only - nginx handles routing
export const API_URL = ''

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  }
}

// Alle Pages laden (mit kurzem Cache damit PageBlocks nicht je einzeln fetchen)
let _pagesCache: { data: Page[]; ts: number } | null = null
const PAGES_CACHE_MS = 3000 // 3 Sekunden

export async function getPages(): Promise<Page[]> {
  if (_pagesCache && Date.now() - _pagesCache.ts < PAGES_CACHE_MS) {
    return _pagesCache.data
  }
  const response = await fetch(`${API_URL}/api/pages`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch pages')
  const data = await response.json()
  _pagesCache = { data, ts: Date.now() }
  return data
}

export function invalidatePagesCache(): void {
  _pagesCache = null
}

// Eine Page laden
export async function getPage(id: number): Promise<Page> {
  const response = await fetch(`${API_URL}/api/pages/${id}`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch page')
  return response.json()
}

// Neue Page erstellen
export async function createPage(data: PageCreate): Promise<Page> {
  invalidatePagesCache()
  const response = await fetch(`${API_URL}/api/pages`, {
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
  const response = await fetch(`${API_URL}/api/pages/${id}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update page')
  return response.json()
}

// Page löschen
export async function deletePage(id: number): Promise<void> {
  invalidatePagesCache()
  const response = await fetch(`${API_URL}/api/pages/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to delete page')
}

// Notepad laden/erstellen
export async function getNotepad(): Promise<Page> {
  const response = await fetch(`${API_URL}/api/notepad`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch notepad')
  return response.json()
}

// User Preferences
export async function getPreferences(): Promise<Record<string, any>> {
  const response = await fetch(`${API_URL}/api/preferences`, {
    headers: await getAuthHeaders()
  })
  if (!response.ok) throw new Error('Failed to fetch preferences')
  return response.json()
}

export async function updatePreferences(data: Record<string, any>): Promise<Record<string, any>> {
  const response = await fetch(`${API_URL}/api/preferences`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update preferences')
  return response.json()
}
