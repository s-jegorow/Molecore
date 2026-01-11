/**
 * Paragraph Tool das leere Blöcke erlaubt
 * Basiert auf @editorjs/paragraph aber ohne Validierung
 */
export default class ParagraphWithBlanks {
  private _element: HTMLDivElement
  private _data: { text: string }
  private api: any
  private readOnly: boolean

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly
    this._data = {
      text: data.text || ''
    }
    this._element = this.drawView()
  }

  drawView(): HTMLDivElement {
    const div = document.createElement('DIV') as HTMLDivElement
    div.classList.add('ce-paragraph')
    div.contentEditable = this.readOnly ? 'false' : 'true'
    div.dataset.placeholder = this.api.i18n?.t('') || ''
    div.innerHTML = this._data.text || ''

    return div
  }

  render(): HTMLElement {
    return this._element
  }

  merge(data: { text: string }): void {
    const newData = {
      text: this._data.text + data.text
    }
    this._data = newData
    this._element.innerHTML = newData.text || ''
  }

  save(element: HTMLElement): { text: string } {
    return {
      text: element.innerHTML
    }
  }

  onPaste(event: any): void {
    const data = {
      text: event.detail.data.innerHTML
    }
    this._data = data
    this._element.innerHTML = data.text || ''
  }

  static get conversionConfig() {
    return {
      export: 'text',
      import: 'text'
    }
  }

  static get sanitize() {
    return {
      text: {
        br: true,
        b: true,
        i: true,
        u: true,
        s: true,
        a: true,
        mark: true,
        code: true
      }
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  static get pasteConfig() {
    return {
      tags: ['P']
    }
  }

  static get toolbox() {
    return {
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M8 9V7.2C8 7.08954 8.08954 7 8.2 7L12 7M16 9V7.2C16 7.08954 15.9105 7 15.8 7L12 7M12 7L12 17M12 17H10M12 17H14"/></svg>',
      title: 'Text'
    }
  }

  // KRITISCH: validate gibt IMMER true zurück - behält leere Blöcke
  static validate(savedData: any): boolean {
    return true
  }
}
