const STEP = 10

let x = 50
let y = 50

function headerElement(): HTMLElement | null {
  return document.querySelector('header')
}

export function getHeaderPosition(): string {
  return x === 50 && y === 50 ? '' : `${x}% ${y}%`
}

export function setHeaderPosition(raw: unknown): void {
  const match = typeof raw === 'string' ? raw.match(/^(\d{1,3})% (\d{1,3})%$/) : null
  x = match ? Math.min(100, Number(match[1])) : 50
  y = match ? Math.min(100, Number(match[2])) : 50
  applyPosition()
}

export function stopRepositioning(): void {
  headerElement()?.classList.remove('repositioning')
}

function applyPosition(): void {
  const header = headerElement()
  if (!header) return

  header.style.backgroundPosition = `${x}% ${y}%`
  header.querySelectorAll<HTMLButtonElement>('.header-arrow').forEach(arrow => {
    const dir = arrow.dataset.dir
    arrow.disabled =
      (dir === 'up' && y === 0) ||
      (dir === 'down' && y === 100) ||
      (dir === 'left' && x === 0) ||
      (dir === 'right' && x === 100)
  })
}

function updateArrowAxes(header: HTMLElement): void {
  const image = new Image()
  image.onload = () => {
    const scale = Math.max(header.clientWidth / image.naturalWidth, header.clientHeight / image.naturalHeight)
    header.classList.toggle('can-move-x', image.naturalWidth * scale > header.clientWidth + 1)
    header.classList.toggle('can-move-y', image.naturalHeight * scale > header.clientHeight + 1)
  }
  image.src = header.dataset.image || ''
}

export function initHeaderPosition(onChange: () => void): void {
  const header = headerElement()
  const button = document.getElementById('header-position-btn')
  if (!header || !button) return

  button.addEventListener('click', (e) => {
    e.stopPropagation()
    if (header.classList.toggle('repositioning')) updateArrowAxes(header)
  })

  header.querySelectorAll<HTMLButtonElement>('.header-arrow').forEach(arrow => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation()
      const dir = arrow.dataset.dir
      if (dir === 'up') y = Math.max(0, y - STEP)
      if (dir === 'down') y = Math.min(100, y + STEP)
      if (dir === 'left') x = Math.max(0, x - STEP)
      if (dir === 'right') x = Math.min(100, x + STEP)
      applyPosition()
      onChange()
    })
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopRepositioning()
  })

  document.addEventListener('pointerdown', (e) => {
    if (!header.contains(e.target as Node)) stopRepositioning()
  })
}
