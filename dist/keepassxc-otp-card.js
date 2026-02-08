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
    const personName = entity.attributes.person_name || '';
    
    // Calculate percentage and color
    const percentage = (timeRemaining / period) * 100;
    let gaugeColor = '#4caf50'; // green
    if (percentage < 66) gaugeColor = '#ff9800'; // yellow/orange
    if (percentage < 33) gaugeColor = '#f44336'; // red
    
    // Format token with space in middle (e.g., "123 456")
    const formattedToken = token.length === 6 
      ? token.slice(0, 3) + ' ' + token.slice(3)
      : token;
    
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
          <div class="otp-details">
            ${issuer}${account ? ` • ${account}` : ''}${personName && this.config.show_person ? ` • ${personName}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  async copyToken(entityId) {
    const state = this._hass.states[entityId];
    const token = state.state;
    const personName = state.attributes.person_name || '';
    
    try {
      // Try modern clipboard API
      await navigator.clipboard.writeText(token);
      this.showNotification('✅ Token copied to clipboard!', personName);
    } catch (err) {
      console.error('Failed to copy token:', err);
      // Fallback: try to use Home Assistant service
      try {
        await this._hass.callService('keepassxc_otp', 'copy_token', {
          entity_id: entityId
        });
        this.showNotification('📋 Token sent to notification', personName);
      } catch (serviceErr) {
        console.error('Service call failed:', serviceErr);
        this.showNotification('❌ Failed to copy token', personName);
      }
    }
  }

  showNotification(message, personName) {
    const notificationId = `otp_copy_${Date.now()}`;
    
    this._hass.callService('persistent_notification', 'create', {
      message: message,
      title: `KeePassXC OTP${personName ? ` (${personName})` : ''}`,
      notification_id: notificationId
    });
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      this._hass.callService('persistent_notification', 'dismiss', {
        notification_id: notificationId
      }).catch(() => {
        // Ignore errors on dismiss
      });
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
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .otp-entry:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
        transition: transform 0.1s ease, color 0.2s ease;
        padding: 8px 0;
      }
      .otp-token:hover {
        transform: scale(1.05);
        color: var(--accent-color);
      }
      .otp-token:active {
        transform: scale(0.95);
      }
      .otp-details {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
