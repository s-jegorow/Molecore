interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

let installPrompt: BeforeInstallPromptEvent | null = null

function isInstalled(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

function isIos(): boolean {
  const userAgent = navigator.userAgent
  const isIpadOs = navigator.maxTouchPoints > 1 && /Macintosh/.test(userAgent)
  return /iPhone|iPad|iPod/.test(userAgent) || isIpadOs
}

export function initInstallApp(): void {
  const group = document.getElementById('install-app-group')
  const hint = document.getElementById('install-app-hint')
  const button = document.getElementById('install-app-btn')
  if (!group || !hint || !button) return

  if (isInstalled()) return

  if (isIos()) {
    hint.textContent = 'Tap Share, then "Add to Home Screen"'
    group.style.display = ''
    return
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    group.style.display = ''
    button.style.display = ''
  })

  button.addEventListener('click', async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    installPrompt = null
    group.style.display = 'none'
  })
}
