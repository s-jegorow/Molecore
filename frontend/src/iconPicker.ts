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

  const popup = document.createElement('div')
  popup.className = 'icon-picker-popup'

  const title = document.createElement('h3')
  title.className = 'icon-picker-title'
  title.textContent = 'Choose Icon'

  const emojiGrid = document.createElement('div')
  emojiGrid.className = 'icon-picker-grid'

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
    btn.className = 'icon-picker-emoji'
    btn.textContent = emoji
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
  uploadBtn.className = 'icon-picker-upload'
  uploadBtn.textContent = '📤 Upload Image'
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
        img.className = 'page-icon-img'
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
  backdrop.className = 'icon-picker-backdrop'
  backdrop.addEventListener('click', () => {
    popup.remove()
    backdrop.remove()
  })

  document.body.appendChild(backdrop)
  document.body.appendChild(popup)
}
