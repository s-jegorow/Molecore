export interface Page {
  id: number
  title: string
  content: EditorJSContent
  parent_id: number | null
  user_id: number
  created_at: string
  updated_at: string
}

export interface PageCreate {
  title: string
  content: EditorJSContent
  parent_id?: number | null
}

export interface PageUpdate {
  title?: string
  content?: EditorJSContent
  parent_id?: number | null
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
