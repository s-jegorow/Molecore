import { mountImageTool } from './toolbox-image'
import { mountPdfTool } from './toolbox-pdf'
import { mountVideoTool } from './toolbox-video'
import { mountAudioTool } from './toolbox-audio'

type Tab = 'image' | 'pdf' | 'video' | 'audio'

interface ToolDef {
  id: string
  name: string
  desc: string
  color: string
  svg: string
}

const ICON = {
  resize:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  crop:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
  transparent: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21" stroke-dasharray="3 2"/></svg>`,
  qr:          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>`,
  merge:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  split:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l5.1 5.1M4 4l5 5"/></svg>`,
  rotate:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  topng:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>`,
  vcrop:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
  compress:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  convert:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  extract:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  trim:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
  amerge:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  speed:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
}

const TOOLS: Record<Tab, ToolDef[]> = {
  image: [
    { id: 'resize',      name: 'Resize Image',     desc: 'Change width & height',     color: 'blue',   svg: ICON.resize },
    { id: 'crop',        name: 'Crop Image',        desc: 'Select & crop a region',    color: 'green',  svg: ICON.crop },
    { id: 'transparent', name: 'Transparent PNG',   desc: 'Remove background color',   color: 'purple', svg: ICON.transparent },
    { id: 'qr',          name: 'QR Code',           desc: 'Text or URL → PNG',         color: 'orange', svg: ICON.qr },
  ],
  pdf: [
    { id: 'merge',  name: 'Merge PDF',   desc: 'Combine multiple PDFs',     color: 'red',    svg: ICON.merge },
    { id: 'split',  name: 'Split PDF',   desc: 'Extract page ranges',       color: 'orange', svg: ICON.split },
    { id: 'rotate', name: 'Rotate PDF',  desc: 'Rotate pages',              color: 'teal',   svg: ICON.rotate },
    { id: 'topng',  name: 'PDF to PNG',  desc: 'Convert page to image',     color: 'blue',   svg: ICON.topng },
  ],
  video: [
    { id: 'crop',     name: 'Crop Video',      desc: 'Cut to a region',           color: 'blue',   svg: ICON.vcrop },
    { id: 'rotate',   name: 'Rotate Video',    desc: 'Rotate 90° / 180° / 270°',  color: 'green',  svg: ICON.rotate },
    { id: 'compress', name: 'Compress Video',  desc: 'Reduce file size',          color: 'orange', svg: ICON.compress },
    { id: 'convert',  name: 'Format Changer',  desc: 'MP4, WebM, AVI…',           color: 'purple', svg: ICON.convert },
  ],
  audio: [
    { id: 'extract', name: 'Extract Audio',  desc: 'Pull audio from video',  color: 'red',   svg: ICON.extract },
    { id: 'trim',    name: 'Trim Audio',     desc: 'Cut start / end',        color: 'blue',  svg: ICON.trim },
    { id: 'merge',   name: 'Merge Audio',    desc: 'Combine audio files',    color: 'green', svg: ICON.amerge },
    { id: 'speed',   name: 'Change Speed',   desc: 'Faster or slower',       color: 'teal',  svg: ICON.speed },
  ],
}

let isOpen = false
let activeTab: Tab = 'image'

export function initToolbox() {
  document.getElementById('toolbox-tab')?.addEventListener('click', () => {
    if (isOpen) closeToolbox()
    else openToolbox()
  })
  document.getElementById('toolbox-close')?.addEventListener('click', closeToolbox)
  document.getElementById('toolbox-back')?.addEventListener('click', showListView)

  document.querySelectorAll<HTMLElement>('.toolbox-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab as Tab))
  })

  renderToolList()
}

function setActiveTab(tab: Tab) {
  activeTab = tab
  document.querySelectorAll<HTMLElement>('.toolbox-seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  renderToolList()
}

function renderToolList() {
  const list = document.getElementById('toolbox-tool-list')
  if (!list) return

  list.innerHTML = TOOLS[activeTab].map(tool => `
    <div class="toolbox-item" data-tool="${tool.id}" data-category="${activeTab}">
      <div class="toolbox-item-icon icon-${tool.color}">${tool.svg}</div>
      <div class="toolbox-item-text">
        <div class="toolbox-item-name">${tool.name}</div>
        <div class="toolbox-item-desc">${tool.desc}</div>
      </div>
      <svg class="toolbox-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `).join('')

  list.querySelectorAll<HTMLElement>('.toolbox-item').forEach(item => {
    item.addEventListener('click', () => {
      openTool(item.dataset.tool!, item.dataset.category as Tab)
    })
  })
}

function openTool(toolId: string, category: Tab) {
  const listView = document.getElementById('toolbox-list-view')
  const toolView = document.getElementById('toolbox-tool-view')
  const backBtn = document.getElementById('toolbox-back')
  const title = document.getElementById('toolbox-title')

  if (!listView || !toolView) return

  const tool = TOOLS[category].find(t => t.id === toolId)
  if (title && tool) title.textContent = tool.name

  listView.style.display = 'none'
  toolView.style.display = 'flex'
  if (backBtn) backBtn.style.display = 'flex'
  toolView.innerHTML = ''

  switch (category) {
    case 'image': mountImageTool(toolId, toolView); break
    case 'pdf':   mountPdfTool(toolId, toolView);   break
    case 'video': mountVideoTool(toolId, toolView); break
    case 'audio': mountAudioTool(toolId, toolView); break
  }
}

function showListView() {
  const listView = document.getElementById('toolbox-list-view')
  const toolView = document.getElementById('toolbox-tool-view')
  const backBtn = document.getElementById('toolbox-back')
  const title = document.getElementById('toolbox-title')

  if (listView) listView.style.display = 'flex'
  if (toolView) { toolView.style.display = 'none'; toolView.innerHTML = '' }
  if (backBtn) backBtn.style.display = 'none'
  if (title) title.textContent = 'Toolbox'
}

function openToolbox() {
  document.getElementById('toolbox-panel')?.classList.add('open')
  document.getElementById('toolbox-tab')?.classList.add('open')
  isOpen = true
}

function closeToolbox() {
  document.getElementById('toolbox-panel')?.classList.remove('open')
  document.getElementById('toolbox-tab')?.classList.remove('open')
  isOpen = false
}

export function showToolboxTab() {
  const tab = document.getElementById('toolbox-tab')
  if (tab) tab.style.display = 'flex'
}

export function hideToolboxTab() {
  const tab = document.getElementById('toolbox-tab')
  if (tab) tab.style.display = 'none'
  closeToolbox()
}
