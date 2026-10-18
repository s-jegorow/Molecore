export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function uid(prefix: string): string {
  return `${prefix}-` + Math.random().toString(36).slice(2, 10)
}

export const BLOCK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  black:     { bg: '#1e1e1e', border: '#333333', text: '#ffffff' },
  lightgray: { bg: '#f5f5f5', border: '#9e9e9e', text: '#000000' },
  red:       { bg: '#5c1010', border: '#7d1414', text: '#ffffff' },
  orange:    { bg: '#6b2a0f', border: '#8b3612', text: '#ffffff' },
  blue:      { bg: '#0d3a5c', border: '#124a72', text: '#ffffff' },
  green:     { bg: '#1a4d24', border: '#226630', text: '#ffffff' },
  purple:    { bg: '#3d2470', border: '#4f2f8f', text: '#ffffff' },
  pink:      { bg: '#6b1e42', border: '#8a2753', text: '#ffffff' },
}

export function isImageIcon(icon: string | null | undefined): boolean {
  return !!icon && /^(https?:\/\/|\/|data:image\/)/.test(icon)
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export const SPAN_SANITIZE = {
  span: {
    style: true,
    class: true,
    'data-tooltip': true,
  },
}
