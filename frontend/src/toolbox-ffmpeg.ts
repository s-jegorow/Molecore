import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
export { fetchFile } from '@ffmpeg/util'

let _ffmpeg: FFmpeg | null = null
let _loaded = false
let _progress: ((pct: number) => void) | null = null
let _held = false
const _waiting: Array<() => void> = []

function acquire(): Promise<void> {
  if (!_held) {
    _held = true
    return Promise.resolve()
  }
  return new Promise(resolve => _waiting.push(resolve))
}

export async function getFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  await acquire()
  _progress = onProgress || null
  if (!_ffmpeg) {
    _ffmpeg = new FFmpeg()
    _ffmpeg.on('progress', ({ progress }) => {
      _progress?.(Math.max(0, Math.min(99, Math.round(progress * 100))))
    })
  }
  if (!_loaded) {
    const base = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/esm'
    await _ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    _loaded = true
  }
  return _ffmpeg
}

export async function releaseFFmpeg(): Promise<void> {
  if (!_held) return
  _progress = null
  if (_ffmpeg && _loaded) {
    try {
      const entries = await _ffmpeg.listDir('/')
      for (const entry of entries) {
        if (!entry.isDir) await _ffmpeg.deleteFile(`/${entry.name}`)
      }
    } catch (error) {
      console.error('FFmpeg cleanup failed:', error)
    }
  }
  const next = _waiting.shift()
  if (next) next()
  else _held = false
}

export function safeExt(file: File, fallback: string): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext && ext !== file.name.toLowerCase() ? ext : fallback
}
