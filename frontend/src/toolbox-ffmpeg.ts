import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
export { fetchFile } from '@ffmpeg/util'

let _ffmpeg: FFmpeg | null = null
let _loaded = false

export async function getFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
  if (!_ffmpeg) {
    _ffmpeg = new FFmpeg()
  }
  if (onProgress) {
    _ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(99, Math.round(progress * 100))))
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
