/**
 * Modal System for displaying alerts, confirmations, and custom content
 */

export interface ModalOptions {
  title?: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
  showCancel?: boolean
}

class ModalManager {
  private container: HTMLElement | null = null
  private activeModal: HTMLElement | null = null
  private closePromise: Promise<void> | null = null

  constructor() {
    this.init()
  }

  private init() {
    // Create modal container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div')
      this.container.id = 'alert-modal-container'
      this.container.className = 'alert-modal-container'
      document.body.appendChild(this.container)
    }
  }

  /**
   * Show a simple alert modal
   */
  alert(message: string, title?: string): Promise<void> {
    return new Promise(async (resolve) => {
      await this.show({
        title: title || 'Alert',
        message,
        type: 'info',
        confirmText: 'OK',
        showCancel: false,
        onConfirm: () => resolve()
      })
    })
  }

  /**
   * Show a confirmation modal
   */
  confirm(message: string, title?: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      await this.show({
        title: title || 'Confirm',
        message,
        type: 'warning',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        showCancel: true,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      })
    })
  }

  /**
   * Show a success message
   */
  success(message: string, title?: string): Promise<void> {
    return new Promise(async (resolve) => {
      await this.show({
        title: title || 'Success',
        message,
        type: 'success',
        confirmText: 'OK',
        showCancel: false,
        onConfirm: () => resolve()
      })
    })
  }

  /**
   * Show an error message
   */
  error(message: string, title?: string): Promise<void> {
    return new Promise(async (resolve) => {
      await this.show({
        title: title || 'Error',
        message,
        type: 'error',
        confirmText: 'OK',
        showCancel: false,
        onConfirm: () => resolve()
      })
    })
  }

  /**
   * Show a custom modal
   */
  async show(options: ModalOptions) {
    // Wait for any existing modal to fully close first
    if (this.closePromise) {
      await this.closePromise
    }

    const {
      title = 'Alert',
      message,
      type = 'info',
      confirmText = 'OK',
      cancelText = 'Cancel',
      onConfirm,
      onCancel,
      showCancel = false
    } = options

    // Create modal element
    const modal = document.createElement('div')
    modal.className = 'alert-modal'

    // Get icon based on type
    const icon = this.getIcon(type)

    modal.innerHTML = `
      <div class="alert-modal-overlay"></div>
      <div class="alert-modal-content">
        <div class="alert-modal-header">
          <div class="alert-modal-icon alert-modal-icon-${type}">
            ${icon}
          </div>
          <h3 class="alert-modal-title">${this.escapeHtml(title)}</h3>
        </div>
        <div class="alert-modal-body">
          <p class="alert-modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="alert-modal-footer">
          ${showCancel ? `<button class="alert-modal-btn alert-modal-btn-cancel">${this.escapeHtml(cancelText)}</button>` : ''}
          <button class="alert-modal-btn alert-modal-btn-confirm alert-modal-btn-${type}">${this.escapeHtml(confirmText)}</button>
        </div>
      </div>
    `

    // Add event listeners
    const overlay = modal.querySelector('.alert-modal-overlay') as HTMLElement
    const confirmBtn = modal.querySelector('.alert-modal-btn-confirm') as HTMLElement
    const cancelBtn = modal.querySelector('.alert-modal-btn-cancel') as HTMLElement

    const handleConfirm = () => {
      this.close()
      onConfirm?.()
    }

    const handleCancel = () => {
      this.close()
      onCancel?.()
    }

    confirmBtn.addEventListener('click', handleConfirm)

    // Only allow overlay/escape to close for modals with cancel button (confirm dialogs)
    // Success/Error/Info modals should only close via OK button
    if (showCancel) {
      overlay.addEventListener('click', handleCancel)

      // Handle Escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel()
          document.removeEventListener('keydown', handleEscape)
        }
      }
      document.addEventListener('keydown', handleEscape)
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', handleCancel)
    }

    // Add to container
    this.container?.appendChild(modal)
    this.activeModal = modal

    // Trigger animation
    requestAnimationFrame(() => {
      modal.classList.add('alert-modal-show')
    })
  }

  /**
   * Close the active modal
   */
  close() {
    if (this.activeModal) {
      this.activeModal.classList.remove('alert-modal-show')
      this.closePromise = new Promise((resolve) => {
        setTimeout(() => {
          this.activeModal?.remove()
          this.activeModal = null
          this.closePromise = null
          resolve()
        }, 300) // Match animation duration
      })
    }
  }

  /**
   * Get icon SVG based on modal type
   */
  private getIcon(type: string): string {
    switch (type) {
      case 'success':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>`
      case 'error':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`
      case 'warning':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`
      default: // info
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Export singleton instance
export const Modal = new ModalManager()
