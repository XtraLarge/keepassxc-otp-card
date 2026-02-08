class KeePassXCOTPCard extends HTMLElement {
  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = config;
    
    if (!this.content) {
      const card = document.createElement('ha-card');
      card.innerHTML = `
        <div class="card-header">
          <div class="name">${config.title || '🔐 KeePassXC OTP'}</div>
        </div>
        <div class="card-content" id="otp-container">
          <div class="loading">Loading OTP tokens...</div>
        </div>
        <style>
          ${this.getStyles()}
        </style>
      `;
      this.appendChild(card);
      this.content = this.querySelector('#otp-container');
    }
  }

  set hass(hass) {
    this._hass = hass;
    
    // Update card header with person name if filtered
    if (this.config.person_entity_id) {
      const personState = hass.states[this.config.person_entity_id];
      if (personState) {
        const personName = personState.attributes.friendly_name || personState.name;
        const headerElement = this.querySelector('.card-header .name');
        if (headerElement) {
          headerElement.textContent = `${this.config.title || '🔐 KeePassXC OTP'} (${personName})`;
        }
      }
    }
    
    // Auto-discover all keepassxc_otp sensors
    const otpEntities = Object.keys(hass.states)
      .filter(entity_id => entity_id.startsWith('sensor.keepassxc_otp_'))
      .map(entity_id => hass.states[entity_id])
      .filter(entity => {
        // Filter by person if specified
        if (this.config.person_entity_id) {
          return entity.attributes.person_entity_id === this.config.person_entity_id;
        }
        // Show all by default
        return true;
      })
      .sort((a, b) => {
        const nameA = a.attributes.friendly_name || a.entity_id;
        const nameB = b.attributes.friendly_name || b.entity_id;
        return nameA.localeCompare(nameB);
      });

    if (otpEntities.length === 0) {
      this.content.innerHTML = `
        <div class="empty">
          <ha-icon icon="mdi:shield-key-outline"></ha-icon>
          <p>No OTP tokens found.</p>
          <p class="hint">Add the KeePassXC OTP integration to get started.</p>
        </div>
      `;
      return;
    }

    // Render all OTP entries
    this.content.innerHTML = otpEntities.map(entity => this.renderOTPEntry(entity)).join('');
    
    // Add click handlers for copy
    this.content.querySelectorAll('.otp-token').forEach(el => {
      el.addEventListener('click', (e) => {
        const entityId = e.currentTarget.dataset.entityId;
        this.copyToken(entityId);
      });
    });
  }

  renderOTPEntry(entity) {
    const token = entity.state;
    const timeRemaining = entity.attributes.time_remaining || 0;
    const period = entity.attributes.period || 30;
    const issuer = entity.attributes.issuer || '';
    const account = entity.attributes.account || '';
    const name = entity.attributes.friendly_name || entity.entity_id;
    const url = entity.attributes.url || null;
    
    // Extract hostname from URL if available
    let displayUrl = null;
    if (url) {
      try {
        const urlObj = new URL(url);
        displayUrl = urlObj.hostname;
      } catch (e) {
        // Invalid URL, ignore
      }
    }
    
    // Calculate percentage and color
    const percentage = (timeRemaining / period) * 100;
    let gaugeColor = '#4caf50'; // green
    if (percentage < 66) gaugeColor = '#ff9800'; // yellow/orange
    if (percentage < 33) gaugeColor = '#f44336'; // red
    
    // Format token with space in middle (e.g., "123 456")
    const formattedToken = token.length === 6 
      ? token.slice(0, 3) + ' ' + token.slice(3)
      : token;
    
    // Build details line: Issuer • Account (if different) • URL
    let details = issuer || '';
    if (account && account !== issuer) {
      details += details ? ` • ${account}` : account;
    }
    if (displayUrl) {
      details += details ? ` • 🔗 ${displayUrl}` : `🔗 ${displayUrl}`;
    }
    
    return `
      <div class="otp-entry">
        <div class="gauge-container">
          <svg viewBox="0 0 36 36" class="circular-gauge">
            <path class="gauge-bg"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path class="gauge-fill"
              stroke="${gaugeColor}"
              stroke-dasharray="${percentage}, 100"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <text x="18" y="20.35" class="gauge-text">${timeRemaining}s</text>
          </svg>
        </div>
        <div class="otp-info">
          <div class="otp-name">${name}</div>
          <div class="otp-token" data-entity-id="${entity.entity_id}" title="Click to copy">
            ${formattedToken}
          </div>
          ${details ? `<div class="otp-details">${details}</div>` : ''}
        </div>
      </div>
    `;
  }

  async copyToken(entityId) {
    const state = this._hass.states[entityId];
    const token = state.state;
    const name = state.attributes.friendly_name || state.attributes.issuer || entityId;
    
    // Format token for display (e.g., "123 456")
    const formattedToken = token.length === 6 
      ? token.slice(0, 3) + ' ' + token.slice(3)
      : token;
    
    try {
      // Try modern Clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(token);
        this.showToast(`✅ Copied to clipboard!`, formattedToken);
      } else {
        // Fallback for HTTP or older browsers
        this.copyToClipboardFallback(token);
        this.showToast(`📋 Copied to clipboard!`, formattedToken);
      }
    } catch (err) {
      console.error('Copy failed, trying fallback:', err);
      try {
        this.copyToClipboardFallback(token);
        this.showToast(`📋 Copied to clipboard!`, formattedToken);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
        this.showToast('❌ Copy failed', name);
      }
    }
  }

  copyToClipboardFallback(text) {
    // Create temporary input element
    const input = document.createElement('input');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.value = text;
    
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    try {
      const successful = document.execCommand('copy');
      if (!successful) {
        throw new Error('Failed to copy to clipboard');
      }
    } finally {
      document.body.removeChild(input);
    }
  }

  showToast(message, title) {
    // Create toast notification element
    const toast = document.createElement('div');
    toast.className = 'otp-toast';
    
    // Create title element
    const titleElement = document.createElement('div');
    titleElement.className = 'toast-title';
    titleElement.textContent = title || 'KeePassXC OTP';
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = 'toast-message';
    messageElement.textContent = message;
    
    toast.appendChild(titleElement);
    toast.appendChild(messageElement);
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }



  getStyles() {
    return `
      .card-content {
        padding: 16px;
      }
      .loading, .empty {
        text-align: center;
        padding: 32px 16px;
        color: var(--secondary-text-color);
      }
      .empty ha-icon {
        --mdc-icon-size: 48px;
        color: var(--disabled-text-color);
        margin-bottom: 16px;
      }
      .hint {
        font-size: 12px;
        margin-top: 8px;
        color: var(--secondary-text-color);
      }
      .otp-entry {
        display: flex;
        align-items: center;
        padding: 16px;
        margin-bottom: 12px;
        background: var(--card-background-color);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: box-shadow 0.2s ease;
      }
      .otp-entry:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      }
      .otp-entry:last-child {
        margin-bottom: 0;
      }
      .gauge-container {
        width: 80px;
        height: 80px;
        margin-right: 16px;
        flex-shrink: 0;
      }
      .circular-gauge {
        width: 100%;
        height: 100%;
      }
      .gauge-bg {
        fill: none;
        stroke: var(--divider-color);
        stroke-width: 2.8;
      }
      .gauge-fill {
        fill: none;
        stroke-width: 2.8;
        stroke-linecap: round;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
        transition: stroke-dasharray 0.3s ease;
      }
      .gauge-text {
        fill: var(--primary-text-color);
        font-size: 8px;
        font-weight: bold;
        text-anchor: middle;
      }
      .otp-info {
        flex: 1;
        min-width: 0;
      }
      .otp-name {
        font-size: 16px;
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .otp-token {
        font-size: 32px;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        letter-spacing: 4px;
        color: var(--primary-color);
        cursor: pointer;
        user-select: none;
        transition: color 0.2s ease;
        padding: 8px 0;
        display: inline-block;
      }
      .otp-token:hover {
        color: var(--accent-color);
      }
      .otp-token:active {
        transform: scale(0.98);
        transition: transform 0.1s ease;
      }
      .otp-details {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      /* Toast Notification Styles */
      .otp-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 6px 16px rgba(0,0,0,0.3);
        border: 1px solid var(--primary-color);
        z-index: 10000;
        min-width: 280px;
        max-width: 400px;
        opacity: 0;
        transition: all 0.3s ease;
        text-align: center;
      }
      .otp-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .toast-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 8px;
        color: var(--primary-color);
      }
      .toast-message {
        font-size: 20px;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        letter-spacing: 3px;
        font-weight: 600;
      }
    `;
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement('keepassxc-otp-card-editor');
  }

  static getStubConfig() {
    return {
      title: '🔐 KeePassXC OTP',
      person_entity_id: '',
      show_person: false
    };
  }
}

customElements.define('keepassxc-otp-card', KeePassXCOTPCard);

// Auto-register with Lovelace
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'keepassxc-otp-card',
  name: 'KeePassXC OTP Card',
  description: 'Display OTP tokens from KeePassXC with auto-discovery and copy functionality',
  preview: true,
  documentationURL: 'https://github.com/XtraLarge/keepassxc-otp-card'
});

console.info(
  '%c KEEPASSXC-OTP-CARD %c v1.0.0 ',
  'color: white; background: #039be5; font-weight: 700;',
  'color: #039be5; background: white; font-weight: 700;'
);
