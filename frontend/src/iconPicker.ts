import { updatePage, uploadFile } from './api'
import { Modal } from './Modal'

export async function showIconPicker(
  pageId: number,
  iconEl: HTMLElement,
  onUpdate?: () => void
) {
  const existingPicker = document.querySelector('.icon-picker-popup')
  if (existingPicker) {
    existingPicker.remove()
  }
  const existingBackdrop = document.getElementById('icon-picker-backdrop')
  if (existingBackdrop) {
    existingBackdrop.remove()
  }

  const isDarkMode = document.body.classList.contains('dark-mode')

  const popup = document.createElement('div')
  popup.className = 'icon-picker-popup'
  popup.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: ${isDarkMode ? '#2b2b2b' : 'white'};
    border: 1px solid ${isDarkMode ? '#444' : '#ddd'};
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    min-width: min(400px, 90vw);
    max-width: 95vw;
    box-sizing: border-box;
    max-height: 500px;
    overflow-y: auto;
  `

  const title = document.createElement('h3')
  title.textContent = 'Choose Icon'
  title.style.cssText = `margin: 0 0 12px 0; font-size: 14px; color: ${isDarkMode ? '#e0e0e0' : '#000'};`

  const emojiGrid = document.createElement('div')
  emojiGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  `

  const emojis = [
    '📄', '📁', '📝', '📊', '📈', '📉', '📌', '🔖', '🏷️', '📎',
    '🔗', '💡', '⚡', '🔥', '⭐', '❤️', '🎯', '🎨', '🎵', '🎮',
    '🏠', '🌟', '✨', '🚀', '💼', '📚', '🔧', '⚙️', '🛠️', '🔨',
    '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '💿', '📀', '🧮',
    '🎬', '📷', '📹', '📺', '📻', '🎙️', '🎧', '🎤', '🎸', '🎹',
    '🥁', '🎺', '🎷', '🪕', '🎻', '🎲', '🧩', '🎰', '🎳', '🏀',
    '⚽', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀',
    '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁',
    '🛝', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
    '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '🤺', '🤾'
  ]

  emojis.forEach(emoji => {
    const btn = document.createElement('button')
    btn.textContent = emoji
    btn.style.cssText = `
      padding: 8px;
      border: 1px solid ${isDarkMode ? '#555' : '#ddd'};
      border-radius: 4px;
      background: ${isDarkMode ? '#333' : 'white'};
      cursor: pointer;
      font-size: 20px;
      transition: all 0.2s;
    `
    btn.addEventListener('mouseenter', () => {
      btn.style.background = isDarkMode ? '#444' : '#f0f0f0'
      btn.style.transform = 'scale(1.1)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = isDarkMode ? '#333' : 'white'
      btn.style.transform = 'scale(1)'
    })
    btn.addEventListener('click', async () => {
      await updatePage(pageId, { icon: emoji })
      popup.remove()
      backdrop.remove()

      iconEl.textContent = emoji

      if (onUpdate) {
        onUpdate()
      }
    })
    emojiGrid.appendChild(btn)
  })

  const uploadBtn = document.createElement('button')
  uploadBtn.textContent = '📤 Upload Image'
  uploadBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: 1px solid #007bff;
    border-radius: 4px;
    background: #007bff;
    color: white;
    cursor: pointer;
    font-size: 14px;
  `
  uploadBtn.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const iconPath = await uploadFile(file, 'icon')

        await updatePage(pageId, { icon: iconPath })

        popup.remove()
        backdrop.remove()

        iconEl.innerHTML = ''
        const img = document.createElement('img')
        img.src = iconPath
        img.style.cssText = 'width: 16px; height: 16px; object-fit: cover; border-radius: 2px;'
        iconEl.appendChild(img)

        if (onUpdate) {
          onUpdate()
        }
      } catch (error: any) {
        console.error('Failed to upload icon:', error)
        await Modal.error(error?.message || 'Failed to upload icon. Please try again.')
      }
    })
    input.click()
  })

  popup.appendChild(title)
  popup.appendChild(emojiGrid)
  popup.appendChild(uploadBtn)

  const backdrop = document.createElement('div')
  backdrop.id = 'icon-picker-backdrop'
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 999;
  `
  backdrop.addEventListener('click', () => {
    popup.remove()
    backdrop.remove()
  })

  document.body.appendChild(backdrop)
  document.body.appendChild(popup)
}
