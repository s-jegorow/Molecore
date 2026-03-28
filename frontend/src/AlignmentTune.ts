const ALIGNMENTS = [
  {
    value: 'left',
    title: 'Align left',
    svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="6" width="9" height="2" rx="1"/><rect x="1" y="10" width="11" height="2" rx="1"/><rect x="1" y="14" width="7" height="2" rx="1"/></svg>'
  },
  {
    value: 'center',
    title: 'Align center',
    svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="3.5" y="6" width="9" height="2" rx="1"/><rect x="2.5" y="10" width="11" height="2" rx="1"/><rect x="4.5" y="14" width="7" height="2" rx="1"/></svg>'
  },
  {
    value: 'right',
    title: 'Align right',
    svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="6" y="6" width="9" height="2" rx="1"/><rect x="4" y="10" width="11" height="2" rx="1"/><rect x="8" y="14" width="7" height="2" rx="1"/></svg>'
  }
]

export default class AlignmentTune {
  private data: { alignment: string }
  private block: any
  private wrapper: HTMLElement | null = null

  static get isTune() {
    return true
  }

  constructor({ data, block }: any) {
    this.data = data || { alignment: '' }
    this.block = block
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('alignment-tune')

    ALIGNMENTS.forEach(align => {
      const button = document.createElement('button')
      button.classList.add('alignment-tune-btn')
      button.innerHTML = align.svg
      button.title = align.title

      if (this.data.alignment === align.value) {
        button.classList.add('active')
      }

      button.addEventListener('pointerdown', (e: Event) => {
        e.stopPropagation()
        // Toggle off if already active
        this.data.alignment = this.data.alignment === align.value ? '' : align.value
        this.applyAlignment()

        if (this.wrapper) {
          this.wrapper.querySelectorAll('.alignment-tune-btn').forEach(b => b.classList.remove('active'))
          if (this.data.alignment) button.classList.add('active')
        }

        try { this.block.dispatchChange() } catch (_) {}
      }, true)

      this.wrapper!.appendChild(button)
    })

    return this.wrapper
  }

  applyAlignment() {
    const holder = this.block.holder
    if (!holder) return
    const content = holder.querySelector('.ce-block__content') as HTMLElement | null
    const target = content || holder
    target.style.textAlign = this.data.alignment || ''
  }

  save() {
    return { alignment: this.data.alignment || '' }
  }

  wrap(blockContent: HTMLElement) {
    blockContent.style.textAlign = this.data.alignment || ''
    return blockContent
  }
}
