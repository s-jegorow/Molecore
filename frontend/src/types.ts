export interface PageMeta {
  id: number
  title: string
  parent_id: number | null
  page_type: string
  icon: string | null
  header: string | null
  order: number
  user_id: string
  created_at: string
  updated_at: string
}

export interface Page extends PageMeta {
  content: EditorJSContent
}

export interface SearchResult {
  id: number
  title: string
  parent_id: number | null
  icon: string | null
  page_type: string
  snippet: string | null
}

export interface PageCreate {
  title: string
  content: EditorJSContent
  parent_id?: number | null
  page_type?: string
  icon?: string | null
  header?: string | null
  order?: number
}

export interface PageUpdate {
  title?: string
  content?: EditorJSContent
  parent_id?: number | null
  page_type?: string
  icon?: string | null
  header?: string | null
  order?: number
}

export interface EditorJSContent {
  time?: number
  blocks: EditorJSBlock[]
  version?: string
  title_color?: string
}

export interface EditorJSBlock {
  id?: string
  type: string
  data: any
}

export type PageSelectCallback = (pageId: number) => void
