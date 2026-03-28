import { CalendarEvent, getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './api'

const COLORS: { key: string; hex: string }[] = [
  { key: 'gray',   hex: '#9ca3af' },
  { key: 'red',    hex: '#ef4444' },
  { key: 'orange', hex: '#f97316' },
  { key: 'green',  hex: '#22c55e' },
  { key: 'blue',   hex: '#3b82f6' },
  { key: 'purple', hex: '#a855f7' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

let isOpen = false
let year = new Date().getFullYear()
let month = new Date().getMonth()  // 0-indexed
let selectedDate: string | null = null
let monthEvents: CalendarEvent[] = []

export function initCalendar() {
  document.getElementById('calendar-tab')?.addEventListener('click', () => {
    if (isOpen) closeCalendar()
    else openCalendar()
  })
  document.getElementById('calendar-close')?.addEventListener('click', closeCalendar)
}

async function openCalendar() {
  document.getElementById('calendar-panel')?.classList.add('open')
  document.getElementById('calendar-tab')?.classList.add('open')
  isOpen = true
  await loadAndRenderMonth()
}

function closeCalendar() {
  document.getElementById('calendar-panel')?.classList.remove('open')
  document.getElementById('calendar-tab')?.classList.remove('open')
  isOpen = false
}

async function loadAndRenderMonth() {
  try {
    monthEvents = await getCalendarEvents(year, month + 1)
  } catch (e) {
    monthEvents = []
    console.error('Failed to load calendar events:', e)
  }
  renderMonth()
}

function renderMonth() {
  const content = document.getElementById('calendar-content')
  if (!content) return

  const firstDay = new Date(year, month, 1).getDay()
  const offset = (firstDay + 6) % 7  // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate())

  let html = `
    <div class="cal-nav">
      <button id="cal-prev" class="cal-nav-btn">&#8249;</button>
      <span class="cal-month-label">${MONTHS[month]} ${year}</span>
      <button id="cal-next" class="cal-nav-btn">&#8250;</button>
    </div>
    <div class="cal-grid">
      ${DAYS.map(d => `<div class="cal-weekday">${d}</div>`).join('')}
      ${Array(offset).fill('<div class="cal-cell empty"></div>').join('')}
  `

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(year, month + 1, d)
    const dayEvs = monthEvents.filter(e => e.date === dateStr)
    const isToday = dateStr === todayStr
    const dots = dayEvs.slice(0, 4).map(e => {
      const hex = colorHex(e.color)
      return `<span class="cal-dot" style="background:${hex}"></span>`
    }).join('')

    html += `
      <div class="cal-cell${isToday ? ' today' : ''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        <div class="cal-dots">${dots}</div>
      </div>
    `
  }

  html += `</div>`
  content.innerHTML = html

  document.getElementById('cal-prev')?.addEventListener('click', async () => {
    month--
    if (month < 0) { month = 11; year-- }
    await loadAndRenderMonth()
  })
  document.getElementById('cal-next')?.addEventListener('click', async () => {
    month++
    if (month > 11) { month = 0; year++ }
    await loadAndRenderMonth()
  })

  content.querySelectorAll<HTMLElement>('.cal-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date || null
      if (selectedDate) renderDay(selectedDate, null)
    })
  })
}

function renderDay(date: string, editingId: number | null) {
  const content = document.getElementById('calendar-content')
  if (!content) return

  const [y, m, d] = date.split('-')
  const label = `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`
  const dayEvs = monthEvents.filter(e => e.date === date)
  const editing = editingId !== null ? monthEvents.find(e => e.id === editingId) || null : null

  let eventsHtml = ''
  if (dayEvs.length === 0) {
    eventsHtml = `<p class="cal-empty-day">No entries</p>`
  } else {
    dayEvs.forEach(ev => {
      const hex = colorHex(ev.color)
      const isEditing = ev.id === editingId
      eventsHtml += `
        <div class="cal-event-item${isEditing ? ' editing' : ''}">
          <span class="cal-event-dot-lg" style="background:${hex}"></span>
          <div class="cal-event-info">
            <span class="cal-event-title">${escapeHtml(ev.title)}</span>
            ${ev.time ? `<span class="cal-event-time">${escapeHtml(ev.time)}</span>` : ''}
          </div>
          <div class="cal-event-actions">
            <button class="cal-icon-btn cal-edit-btn" data-id="${ev.id}" title="Bearbeiten">✎</button>
            <button class="cal-icon-btn cal-delete-btn" data-id="${ev.id}" title="Löschen">&times;</button>
          </div>
        </div>
      `
    })
  }

  const formTitle = editing ? escapeHtml(editing.title) : ''
  const formTime = editing ? escapeHtml(editing.time || '') : ''
  const formColor = editing?.color || 'gray'

  const colorDots = COLORS.map(c => `
    <span class="cal-color-pick${formColor === c.key ? ' selected' : ''}"
          data-color="${c.key}" style="background:${c.hex}"></span>
  `).join('')

  content.innerHTML = `
    <div class="cal-day-nav">
      <button id="cal-back" class="cal-back-btn">&#8249; Back</button>
      <span class="cal-day-label">${label}</span>
    </div>
    <div class="cal-events-list">${eventsHtml}</div>
    <div class="cal-form">
      <input type="text" id="cal-title" placeholder="Entry..." value="${formTitle}" maxlength="500">
      <input type="text" id="cal-time" placeholder="Time (optional, e.g. 14:00–15:00)" value="${formTime}">
      <div class="cal-color-picker" id="cal-color-picker">${colorDots}</div>
      <div class="cal-form-btns">
        <button id="cal-save" class="cal-btn-primary">${editing ? 'Save' : 'Add'}</button>
        ${editing ? `<button id="cal-cancel" class="cal-btn-secondary">Cancel</button>` : ''}
      </div>
    </div>
  `

  document.getElementById('cal-back')?.addEventListener('click', renderMonth)

  content.querySelectorAll<HTMLElement>('.cal-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id || '0')
      try {
        await deleteCalendarEvent(id)
        monthEvents = monthEvents.filter(e => e.id !== id)
        renderDay(date, null)
      } catch (e) {
        console.error('Failed to delete event:', e)
      }
    })
  })

  content.querySelectorAll<HTMLElement>('.cal-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id || '0')
      renderDay(date, id)
    })
  })

  // Color picker
  let selectedColor = formColor
  content.querySelectorAll<HTMLElement>('.cal-color-pick').forEach(dot => {
    dot.addEventListener('click', () => {
      content.querySelectorAll('.cal-color-pick').forEach(d => d.classList.remove('selected'))
      dot.classList.add('selected')
      selectedColor = dot.dataset.color || 'gray'
    })
  })

  document.getElementById('cal-cancel')?.addEventListener('click', () => renderDay(date, null))

  document.getElementById('cal-save')?.addEventListener('click', async () => {
    const title = (document.getElementById('cal-title') as HTMLInputElement)?.value.trim()
    const time = (document.getElementById('cal-time') as HTMLInputElement)?.value.trim()
    if (!title) return

    try {
      if (editing) {
        const updated = await updateCalendarEvent(editing.id, { title, time, color: selectedColor })
        const idx = monthEvents.findIndex(e => e.id === editing.id)
        if (idx !== -1) monthEvents[idx] = updated
      } else {
        const created = await createCalendarEvent({ date, title, time, color: selectedColor })
        monthEvents.push(created)
      }
      renderDay(date, null)
    } catch (e) {
      console.error('Failed to save event:', e)
    }
  })

  const titleInput = document.getElementById('cal-title') as HTMLInputElement
  titleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('cal-save')?.click()
  })
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function colorHex(key: string | null): string {
  return COLORS.find(c => c.key === key)?.hex || COLORS[0].hex
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function showCalendarTab() {
  const tab = document.getElementById('calendar-tab')
  if (tab) tab.style.display = 'flex'
}

export function hideCalendarTab() {
  const tab = document.getElementById('calendar-tab')
  if (tab) tab.style.display = 'none'
  closeCalendar()
}
