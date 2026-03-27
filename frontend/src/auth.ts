import Keycloak from 'keycloak-js'
import { API_URL } from './api'

// Keycloak configuration - replace with your values
const keycloakConfig = {
  url: 'https://your-keycloak-server.com',
  realm: 'your-realm',
  clientId: 'your-client-id',
}

const keycloak = new Keycloak(keycloakConfig)

// Initialize Keycloak authentication
export async function initKeycloak(): Promise<boolean> {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    })

    return authenticated
  } catch (error) {
    console.error('Keycloak init failed', error)
    return false
  }
}

// Redirect user to login page
export function login() {
  keycloak.login({ redirectUri: window.location.origin })
}

// Logout user and clear session
export function logout() {
  keycloak.logout()
}

// Get valid access token, refreshing if necessary
export async function getToken(): Promise<string | undefined> {
  if (!keycloak.authenticated) {
    return undefined
  }

  if (keycloak.token && keycloak.tokenParsed && keycloak.tokenParsed.exp) {
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = keycloak.tokenParsed.exp - now

    if (expiresIn > 30) {
      return keycloak.token
    }
  }

  try {
    await keycloak.updateToken(30)
    return keycloak.token
  } catch (error) {
    keycloak.clearToken()
    window.dispatchEvent(new CustomEvent('sessionExpired'))
    return undefined
  }
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return keycloak.authenticated || false
}

// Get parsed user information from token
export function getUserInfo() {
  return keycloak.tokenParsed
}

// Initialize auth UI event listeners
export function initAuthUI(): void {
  const mobileUserBtn = document.getElementById('mobile-user-btn')
  const settingsLogoutBtn = document.getElementById('settings-logout-btn')

  settingsLogoutBtn?.addEventListener('click', () => {
    const settingsModal = document.getElementById('settings-modal')
    settingsModal?.classList.remove('active')
    logout()
  })

  // User button: login if not authenticated, open settings if authenticated
  mobileUserBtn?.addEventListener('click', () => {
    if (isAuthenticated()) {
      openSettingsModal()
    } else {
      login()
    }
  })

  // Handle session expiration event
  window.addEventListener('sessionExpired', () => {
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = ''
    if (appContent) appContent.classList.remove('active')
    updateAuthUI(false)
  })
}

// Update UI based on authentication state
export function updateAuthUI(authenticated: boolean): void {
  const mobileUserBtn = document.getElementById('mobile-user-btn')
  const profileUsername = document.getElementById('profile-username')
  const welcomeScreen = document.getElementById('welcome-screen')
  const appContent = document.getElementById('app-content')

  if (authenticated) {
    if (welcomeScreen) welcomeScreen.style.display = 'none'
    if (appContent) appContent.classList.add('active')
    const userInfo = getUserInfo()
    let displayName = 'User'
    if (userInfo?.given_name && userInfo?.family_name) {
      displayName = `${userInfo.given_name} ${userInfo.family_name}`
    } else if (userInfo?.name) {
      displayName = userInfo.name
    } else if (userInfo?.preferred_username) {
      displayName = userInfo.preferred_username
    }

    if (profileUsername) profileUsername.textContent = displayName
    if (mobileUserBtn) mobileUserBtn.classList.add('active')
  } else {
    if (profileUsername) profileUsername.textContent = 'Guest'
    if (mobileUserBtn) mobileUserBtn.classList.remove('active')
  }
}

// Helper function to open settings modal
function openSettingsModal(): void {
  const settingsModal = document.getElementById('settings-modal')
  settingsModal?.classList.add('active')

  // Load storage stats when opening settings
  loadStorageStats()
}

// Load storage usage statistics
async function loadStorageStats(): Promise<void> {
  const storageBar = document.getElementById('storage-bar')
  const storageText = document.getElementById('storage-text')

  if (!storageBar || !storageText) return

  try {
    const token = await getToken()
    const response = await fetch(`${API_URL}/api/storage-usage`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) throw new Error('Failed to load storage stats')

    const data = await response.json()
    storageBar.style.width = `${Math.min(data.percentage, 100)}%`

    // Add warning/danger classes based on usage
    storageBar.classList.remove('warning', 'danger')
    if (data.percentage >= 90) {
      storageBar.classList.add('danger')
    } else if (data.percentage >= 70) {
      storageBar.classList.add('warning')
    }

    storageText.textContent = `${data.usage_formatted} of ${data.quota_formatted} used (${data.percentage}%)`
  } catch (error) {
    console.error('Failed to load storage stats:', error)
    storageText.textContent = 'Could not load storage info'
  }
}

export { keycloak }
