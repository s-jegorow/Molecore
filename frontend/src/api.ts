import type { Page, PageCreate, PageUpdate } from './types'

const API_URL = 'http://127.0.0.1:8000'

// Alle Pages laden
export async function getPages(): Promise<Page[]> {
  const response = await fetch(`${API_URL}/api/pages`)
  if (!response.ok) throw new Error('Failed to fetch pages')
  return response.json()
}

// Eine Page laden
export async function getPage(id: number): Promise<Page> {
  const response = await fetch(`${API_URL}/api/pages/${id}`)
  if (!response.ok) throw new Error('Failed to fetch page')
  return response.json()
}

// Neue Page erstellen
export async function createPage(data: PageCreate): Promise<Page> {
  const response = await fetch(`${API_URL}/api/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to create page')
  return response.json()
}

// Page updaten
export async function updatePage(id: number, data: PageUpdate): Promise<Page> {
  const response = await fetch(`${API_URL}/api/pages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update page')
  return response.json()
}

// Page löschen
export async function deletePage(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/pages/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete page')
}
