import Keycloak from 'keycloak-js'

// Keycloak configuration from environment variables
const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL
const keycloakRealm = import.meta.env.VITE_KEYCLOAK_REALM
const keycloakClientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID

// Validate required environment variables
if (!keycloakUrl) {
  throw new Error('VITE_KEYCLOAK_URL environment variable is required')
}
if (!keycloakRealm) {
  throw new Error('VITE_KEYCLOAK_REALM environment variable is required')
}
if (!keycloakClientId) {
  throw new Error('VITE_KEYCLOAK_CLIENT_ID environment variable is required')
}

const keycloakConfig = {
  url: keycloakUrl,
  realm: keycloakRealm,
  clientId: keycloakClientId,
}

const keycloak = new Keycloak(keycloakConfig)

export async function initKeycloak(): Promise<boolean> {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false, // Disable iframe-based session checks
    })


    return authenticated
  } catch (error) {
    console.error('Keycloak init failed', error)
    return false
  }
}

export function login() {
  keycloak.login({ redirectUri: window.location.origin })
}

export function logout() {
  keycloak.logout()
}

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

export function isAuthenticated(): boolean {
  return keycloak.authenticated || false
}

export function getUserInfo() {
  return keycloak.tokenParsed
}

export { keycloak }
