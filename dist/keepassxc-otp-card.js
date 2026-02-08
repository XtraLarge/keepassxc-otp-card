class KeePassXCOTPCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    if (!this._initialized) {
      this.innerHTML = `
        <div class="card-config">
          <div class="option">
            <label class="label">
              <span>Title</span>
              <span class="secondary">Card header title</span>
            </label>
            <input
              type="text"
              id="title"
              class="value"
            />
          </div>
          
          <div class="option">
            <label class="label">
              <span>Person Filter (optional)</span>
              <span class="secondary">Show tokens for specific person only</span>
            </label>
            <select id="person_entity_id" class="value">
              <option value="">All Persons</option>
            </select>
          </div>
          
          <div class="option">
            <label class="label">
              <span>Show Person Names</span>
              <span class="secondary">Display person name in token details</span>
            </label>
            <input
              type="checkbox"
              id="show_person"
              class="value"
            />
          </div>
        </div>
        <style>
          ${this.getStyles()}
        </style>
      `;
      this._initialized = true;
      
      // Set values after rendering to avoid XSS
      const titleInput = this.querySelector('#title');
      if (titleInput) {
        titleInput.value = this._config.title || '🔐 KeePassXC OTP';
      }
      
      const showPersonCheckbox = this.querySelector('#show_person');
      if (showPersonCheckbox) {
        showPersonCheckbox.checked = this._config.show_person === true;
      }
      
      this._setupListeners();
      
      // Populate person selector if hass is already available
      if (this._hass) {
        this._populatePersonSelector();
      }
    }
  }

  set hass(hass) {
    this._hass = hass;
    // Only populate selector if already initialized
    if (this._initialized) {
      this._populatePersonSelector();
    }
  }

  _setupListeners() {
    const titleInput = this.querySelector('#title');
    const personSelect = this.querySelector('#person_entity_id');
    const showPersonCheckbox = this.querySelector('#show_person');

    titleInput.addEventListener('change', (e) => {
      const value = e.target.value.trim();
      // If empty, use default title
      this._config.title = value || '🔐 KeePassXC OTP';
      // Update input to show the actual value being saved
      e.target.value = this._config.title;
      this._fireConfigChanged();
    });

    personSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this._config.person_entity_id = e.target.value;
      } else {
        delete this._config.person_entity_id;
      }
      this._fireConfigChanged();
    });

    showPersonCheckbox.addEventListener('change', (e) => {
      this._config.show_person = e.target.checked;
      this._fireConfigChanged();
    });
  }

  _populatePersonSelector() {
    if (!this._hass) return;

    const select = this.querySelector('#person_entity_id');
    if (!select) return;

    // Get all person entities
    const personEntities = Object.keys(this._hass.states)
      .filter(entity_id => entity_id.startsWith('person.'))
      .map(entity_id => ({
        id: entity_id,
        name: this._hass.states[entity_id].attributes.friendly_name || entity_id
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Clear existing options except "All Persons"
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add person options
    personEntities.forEach(person => {
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = person.name;
      if (person.id === this._config.person_entity_id) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  getStyles() {
    return `
      .card-config {
        padding: 16px;
      }
      
      .option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 12px;
        background: var(--secondary-background-color);
        border-radius: 8px;
      }
      
      .label {
        display: flex;
        flex-direction: column;
        flex: 1;
        margin-right: 16px;
      }
      
      .label span:first-child {
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 4px;
      }
      
      .label .secondary {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      
      .value {
        min-width: 200px;
      }
      
      input[type="text"],
      select {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
      }
      
      input[type="text"]:focus,
      select:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      
      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
      }
      
      @media (max-width: 600px) {
        .option {
          flex-direction: column;
          align-items: flex-start;
        }
        
        .label {
          margin-right: 0;
          margin-bottom: 8px;
        }
        
        .value {
          width: 100%;
          min-width: unset;
        }
      }
    `;
  }
}

customElements.define('keepassxc-otp-card-editor', KeePassXCOTPCardEditor);

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
    const name = state.attributes.friendly_name || entityId;
    
    try {
      // Try modern Clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(token);
        this.showToast(`✅ Token copied to clipboard`, name);
      } else {
        // Fallback for HTTP or older browsers
        this.copyToClipboardFallback(token);
        this.showToast(`📋 Token copied to clipboard`, name);
      }
    } catch (err) {
      console.error('Copy failed, trying fallback:', err);
      try {
        this.copyToClipboardFallback(token);
        this.showToast(`📋 Token copied to clipboard`, name);
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
        throw new Error('execCommand copy returned false');
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
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
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
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 250px;
        max-width: 400px;
        opacity: 0;
        transition: all 0.3s ease;
      }
      .otp-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .toast-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
        color: var(--primary-color);
      }
      .toast-message {
        font-size: 16px;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        letter-spacing: 2px;
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
