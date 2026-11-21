import Code from '@editorjs/code'

export default class CodeWithCopy extends (Code as any) {
  render(): HTMLElement {
    const holder: HTMLElement = super.render()

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'code-copy-btn'
    button.textContent = 'Copy'
    button.dataset.mutationFree = 'true'

    button.addEventListener('click', async () => {
      const textarea = holder.querySelector('textarea')
      if (!textarea) return

      try {
        await navigator.clipboard.writeText(textarea.value)
        button.textContent = 'Copied'
        setTimeout(() => { button.textContent = 'Copy' }, 1500)
      } catch (error) {
        console.error('Copy failed:', error)
      }
    })

    holder.appendChild(button)
    return holder
  }
}
