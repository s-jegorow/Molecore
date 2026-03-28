// State
let isOpen = false
let running = false
let intervalId: ReturnType<typeof setInterval> | null = null
let secondsLeft = 0
let sessionType: 'focus' | 'short_break' | 'long_break' = 'focus'
let sessionCount = 0

// Settings
let mode: 'single' | 'cycle' = 'single'
let focusMins = 25
let shortBreakMins = 5
let longBreakMins = 15
let sessionsUntilLong = 4
let soundEnabled = true
let autoStart = false
let showProgress = true

export function initTimer() {
  secondsLeft = focusMins * 60
  updateDisplay()

  document.getElementById('timer-tab')?.addEventListener('click', () => {
    if (isOpen) closeTimer()
    else openTimer()
  })
  document.getElementById('timer-close')?.addEventListener('click', closeTimer)
  document.getElementById('timer-start-btn')?.addEventListener('click', toggleStartPause)
  document.getElementById('timer-reset-btn')?.addEventListener('click', resetTimer)
  document.getElementById('timer-mode-single')?.addEventListener('click', () => setMode('single'))
  document.getElementById('timer-mode-cycle')?.addEventListener('click', () => setMode('cycle'))

  const focusInput = document.getElementById('timer-focus-mins') as HTMLInputElement
  const shortBreakInput = document.getElementById('timer-short-break-mins') as HTMLInputElement
  const longBreakInput = document.getElementById('timer-long-break-mins') as HTMLInputElement
  const sessionsInput = document.getElementById('timer-sessions-until-long') as HTMLInputElement
  const soundInput = document.getElementById('timer-sound') as HTMLInputElement
  const autoStartInput = document.getElementById('timer-autostart') as HTMLInputElement

  focusInput?.addEventListener('change', () => {
    const v = parseInt(focusInput.value)
    if (v > 0) {
      focusMins = v
      if (!running && sessionType === 'focus') {
        secondsLeft = focusMins * 60
        updateDisplay()
      }
    }
  })

  shortBreakInput?.addEventListener('change', () => {
    const v = parseInt(shortBreakInput.value)
    if (v > 0) {
      shortBreakMins = v
      if (!running && sessionType === 'short_break') {
        secondsLeft = shortBreakMins * 60
        updateDisplay()
      }
    }
  })

  longBreakInput?.addEventListener('change', () => {
    const v = parseInt(longBreakInput.value)
    if (v > 0) longBreakMins = v
  })

  sessionsInput?.addEventListener('change', () => {
    const v = parseInt(sessionsInput.value)
    if (v > 0) {
      sessionsUntilLong = v
      updateDots()
    }
  })

  const progressInput = document.getElementById('timer-progress') as HTMLInputElement

  soundInput?.addEventListener('change', () => { soundEnabled = soundInput.checked })
  autoStartInput?.addEventListener('change', () => { autoStart = autoStartInput.checked })
  progressInput?.addEventListener('change', () => {
    showProgress = progressInput.checked
    const dotsEl = document.getElementById('timer-dots')
    if (dotsEl) dotsEl.style.visibility = showProgress ? 'visible' : 'hidden'
  })
}

function setMode(m: 'single' | 'cycle') {
  mode = m
  document.getElementById('timer-mode-single')?.classList.toggle('active', m === 'single')
  document.getElementById('timer-mode-cycle')?.classList.toggle('active', m === 'cycle')

  const dotsEl = document.getElementById('timer-dots')
  const shortBreakRow = document.getElementById('timer-short-break-row')
  const longBreakRow = document.getElementById('timer-long-break-row')
  const sessionsRow = document.getElementById('timer-sessions-row')
  const autoStartRow = document.getElementById('timer-autostart-row')
  const progressRow = document.getElementById('timer-progress-row')

  const isCycle = m === 'cycle'
  if (dotsEl) dotsEl.style.visibility = (isCycle && showProgress) ? 'visible' : 'hidden'
  if (progressRow) progressRow.style.display = isCycle ? 'flex' : 'none'
  if (shortBreakRow) shortBreakRow.style.display = isCycle ? 'flex' : 'none'
  if (longBreakRow) longBreakRow.style.display = isCycle ? 'flex' : 'none'
  if (sessionsRow) sessionsRow.style.display = isCycle ? 'flex' : 'none'
  if (autoStartRow) autoStartRow.style.display = isCycle ? 'flex' : 'none'

  if (isCycle) updateDots()
  resetTimer()
}

function toggleStartPause() {
  if (running) pauseTimer()
  else startTimer()
}

function startTimer() {
  if (secondsLeft === 0) {
    secondsLeft = focusMins * 60
    updateDisplay()
  }
  running = true
  const startBtn = document.getElementById('timer-start-btn')
  if (startBtn) startBtn.textContent = 'Pause'
  intervalId = setInterval(tick, 1000)
}

function pauseTimer() {
  running = false
  const startBtn = document.getElementById('timer-start-btn')
  if (startBtn) startBtn.textContent = 'Start'
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function resetTimer() {
  pauseTimer()
  sessionType = 'focus'
  sessionCount = 0
  secondsLeft = focusMins * 60
  updateDisplay()
  updateSessionLabel()
  updateDots()
}

function tick() {
  secondsLeft--
  updateDisplay()
  if (secondsLeft <= 0) onSessionEnd()
}

function onSessionEnd() {
  pauseTimer()
  if (soundEnabled) playDing()

  if (mode === 'single') return

  // Cycle mode: advance to next phase
  if (sessionType === 'focus') {
    sessionCount++
    updateDots()
    if (sessionCount % sessionsUntilLong === 0) {
      sessionType = 'long_break'
      secondsLeft = longBreakMins * 60
    } else {
      sessionType = 'short_break'
      secondsLeft = shortBreakMins * 60
    }
  } else {
    sessionType = 'focus'
    secondsLeft = focusMins * 60
  }

  updateDisplay()
  updateSessionLabel()
  if (autoStart) startTimer()
}

function updateDisplay() {
  const el = document.getElementById('timer-display')
  if (!el) return
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function updateSessionLabel() {
  const el = document.getElementById('timer-session-label')
  if (!el) return
  if (sessionType === 'focus') el.textContent = 'Focus'
  else if (sessionType === 'short_break') el.textContent = 'Short Break'
  else el.textContent = 'Long Break'
}

function updateDots() {
  const el = document.getElementById('timer-dots')
  if (!el) return
  el.innerHTML = ''
  const count = sessionsUntilLong
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span')
    dot.className = 'timer-dot' + (i < sessionCount % (sessionsUntilLong + 1) ? ' filled' : '')
    el.appendChild(dot)
  }
}

function playDing() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 1.0)
  } catch (_e) {
    // AudioContext not available
  }
}

function openTimer() {
  const panel = document.getElementById('timer-panel')
  const tab = document.getElementById('timer-tab')
  if (panel) panel.classList.add('open')
  if (tab) tab.classList.add('open')
  isOpen = true
}

function closeTimer() {
  const panel = document.getElementById('timer-panel')
  const tab = document.getElementById('timer-tab')
  if (panel) panel.classList.remove('open')
  if (tab) tab.classList.remove('open')
  isOpen = false
}

export function showTimerTab() {
  const tab = document.getElementById('timer-tab')
  if (tab) tab.style.display = 'flex'
}

export function hideTimerTab() {
  const tab = document.getElementById('timer-tab')
  if (tab) tab.style.display = 'none'
  closeTimer()
}
