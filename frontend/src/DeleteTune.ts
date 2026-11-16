import type { API, BlockAPI } from '@editorjs/editorjs'
import { getCalloutMembers } from './CalloutBlock'

const DELETE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M8 8L12 12M12 12L16 16M12 12L16 8M12 12L8 16"/></svg>'

export default class DeleteTune {
  private api: API
  private block: BlockAPI

  static get isTune() {
    return true
  }

  constructor({ api, block }: { api: API; block: BlockAPI }) {
    this.api = api
    this.block = block
  }

  render() {
    return {
      icon: DELETE_ICON,
      title: this.api.i18n.t('Delete'),
      name: 'delete',
      onActivate: () => this.deleteBlock(),
    }
  }

  private deleteBlock() {
    const members = getCalloutMembers(this.block.holder).reverse()
    members.forEach(el => {
      const member = this.api.blocks.getBlockByElement(el as HTMLElement)
      if (member) this.api.blocks.delete(this.api.blocks.getBlockIndex(member.id))
    })
    this.api.blocks.delete(this.api.blocks.getBlockIndex(this.block.id))
  }
}
