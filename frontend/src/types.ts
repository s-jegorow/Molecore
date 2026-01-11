export interface Page {
  id: number
  title: string
  content: EditorJSContent
  parent_id: number | null
  is_favorite: boolean
  is_home: boolean
  order: number
  user_id: number
  created_at: string
  updated_at: string
}

export interface PageCreate {
  title: string
  content: EditorJSContent
  parent_id?: number | null
  is_favorite?: boolean
}

export interface PageUpdate {
  title?: string
  content?: EditorJSContent
  parent_id?: number | null
  is_favorite?: boolean
  order?: number
}

export interface EditorJSContent {
  time?: number
  blocks: EditorJSBlock[]
  version?: string
}

export interface EditorJSBlock {
  id?: string
  type: string
  data: any
}
