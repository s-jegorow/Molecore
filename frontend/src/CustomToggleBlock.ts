// @ts-ignore
import * as ToggleBlockModule from 'editorjs-toggle-block'
// @ts-ignore
const OriginalToggleBlock = ToggleBlockModule.default || ToggleBlockModule

export default class CustomToggleBlock extends OriginalToggleBlock {

  setNestedBlockAttributes() {
    // Override to prevent auto-nesting after closed toggle
    const currentIndex = this.api.blocks.getCurrentBlockIndex()
    const block = this.api.blocks.getBlockByIndex(currentIndex)
    const { holder } = block

    // Only nest if explicitly marked
    if (holder.getAttribute('will-be-a-nested-block')) {
      holder.removeAttribute('will-be-a-nested-block')
      this.setAttributesToNewBlock(currentIndex)
      this.api.toolbar.close()
    }
  }

  hideAndShowBlocks(toggleId = this.wrapper.id, status = this.data.status) {
    // Get all blocks with this foreignKey
    const blocks = document.querySelectorAll(`div[foreignKey="${toggleId}"]`)

    if (blocks.length > 0) {
      let foundFirst = false
      let foundLast = false

      // Find first and last block with foreignKey
      const allBlocks = document.querySelectorAll('.ce-block')
      let firstIndex = -1
      let lastIndex = -1

      allBlocks.forEach((block, index) => {
        const fk = block.getAttribute('foreignKey')
        if (fk === toggleId) {
          if (firstIndex === -1) firstIndex = index
          lastIndex = index
        }
      })

      // Hide all blocks between first and last (including empty ones)
      if (firstIndex !== -1 && lastIndex !== -1) {
        for (let i = firstIndex; i <= lastIndex; i++) {
          const block = allBlocks[i] as HTMLElement
          block.hidden = status === 'closed'

          // Handle nested toggles recursively
          const nestedToggles = block.querySelectorAll('.toggle-block__selector')
          if (nestedToggles.length > 0) {
            const nestedStatus = status === 'closed' ? status : block.getAttribute('status')
            this.hideAndShowBlocks(nestedToggles[0].getAttribute('id'), nestedStatus)
          }
        }
      }
    } else if (toggleId === this.wrapper.id) {
      // No blocks found - toggle the default content
      const defaultContent = this.wrapper.lastChild
      defaultContent.classList.toggle('toggle-block__hidden', status)
    }
  }
}
