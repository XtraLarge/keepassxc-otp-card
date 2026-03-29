class KeePassXCOTPCard extends HTMLElement {
  constructor() {
    super();
    this._rendered = false;  // Track if we've done initial render
    this._entities = [];     // Store current entities
    this._animationFrameId = null;  // Track animation frame
    this._lastUpdateTime = 0;  // Track last update timestamp
    this._speakTimeouts = new Map(); // Track delayed speak timers
    this._stableTokens = new Map(); // Keep token stable within one OTP time slice
    this._notifyPromptShown = false;
  }

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
    
    // Start animation loop (replaces setInterval)
    this.startAnimationLoop();
  }

  disconnectedCallback() {
    // Clean up animation frame when card is removed
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this._speakTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._speakTimeouts.clear();
    this._stableTokens.clear();
  }

  startAnimationLoop() {
    // Stop any existing animation loop
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
    }
    
    const animate = () => {
      try {
        // Update gauges and button states
        this.updateGaugesAndButtons();
        
        // Schedule next frame
        this._animationFrameId = requestAnimationFrame(animate);
      } catch (error) {
        console.error('KeePassXC OTP Card: Animation loop error:', error);
        // Self-healing: clear animation ID and restart loop after error
        this._animationFrameId = null;
        setTimeout(() => this.startAnimationLoop(), 1000);
      }
    };
    
    // Start the loop
    this._animationFrameId = requestAnimationFrame(animate);
  }

  updateGaugesAndButtons() {
    // Throttle to 1 second intervals using timestamp comparison
    const now = Date.now();
    if (now - this._lastUpdateTime < 1000) {
      return;  // Skip this frame
    }
    this._lastUpdateTime = now;
    
    // Update both gauges and button states
    this.updateGauges();
    this.updateButtonStates();
  }

  updateGauges() {
    // Validate _hass is available
    if (!this._hass || !this._hass.states) {
      return;
    }
    
    // Validate DOM is ready
    if (!this.content) {
      return;
    }
    
    try {
      // Update all gauge displays without re-rendering entire card
      const gauges = this.querySelectorAll('.circular-gauge');
      
      if (!gauges || gauges.length === 0) {
        return;  // No gauges to update
      }
      
      gauges.forEach((svg) => {
        try {
          const entityId = svg.dataset.entityId;
          if (!entityId) {
            return;
          }
          
          // Validate entity exists
          const entity = this._hass.states[entityId];
          if (!entity || !entity.attributes) {
            console.warn(`KeePassXC OTP: Entity ${entityId} not found or invalid`);
            return;
          }
          
          const period = entity.attributes.period || 30;
          
          // Calculate time remaining LOCALLY using current timestamp
          const now = Math.floor(Date.now() / 1000);
          const timeRemaining = period - (now % period);
          
          // Validate time remaining is sane (defensive check)
          if (timeRemaining < 0 || timeRemaining > period) {
            console.warn(`KeePassXC OTP: Invalid time remaining: ${timeRemaining}`);
            return;
          }
          
          const percentage = (timeRemaining / period) * 100;
          
          // Update gauge color
          let gaugeColor = '#4caf50'; // green
          if (percentage < 66) gaugeColor = '#ff9800'; // orange
          if (percentage < 33) gaugeColor = '#f44336'; // red
          
          // Validate gauge fill element exists
          const gaugeFill = svg.querySelector('.gauge-fill');
          if (gaugeFill) {
            gaugeFill.setAttribute('stroke', gaugeColor);
            gaugeFill.setAttribute('stroke-dasharray', `${percentage}, 100`);
          } else {
            console.warn(`KeePassXC OTP: gauge-fill element not found for ${entityId}`);
          }
          
          // Validate gauge text element exists
          const gaugeText = svg.querySelector('.gauge-text');
          if (gaugeText) {
            gaugeText.textContent = `${timeRemaining}s`;
          } else {
            console.warn(`KeePassXC OTP: gauge-text element not found for ${entityId}`);
          }
        } catch (gaugeError) {
          console.error('KeePassXC OTP: Error updating individual gauge:', gaugeError);
          // Continue with other gauges
        }
      });
    } catch (error) {
      console.error('KeePassXC OTP: Error in updateGauges:', error);
    }
  }

  updateButtonStates() {
    try {
      // Validate DOM is ready
      if (!this.content) {
        return;
      }
      
      // Clean up expired "Copied!" states
      const now = Date.now();
      const buttons = this.querySelectorAll('.copy-button[data-state]');

      buttons.forEach(button => {
        try {
          const copiedAt = parseInt(button.dataset.copiedAt || '0');
          if (now - copiedAt > 1000) {  // 1 second timeout
            // State expired - reset button
            delete button.dataset.state;
            delete button.dataset.copiedAt;
            
            // Reset button content
            const icon = button.querySelector('.copy-icon');
            const text = button.querySelector('.copy-text');
            if (icon) icon.textContent = '📋';
            if (text) text.textContent = 'Copy';
          }
        } catch (buttonError) {
          console.error('KeePassXC OTP: Error updating button state:', buttonError);
          // Continue with other buttons
        }
      });

      const speakButtons = this.querySelectorAll('.speak-button[data-state]');
      speakButtons.forEach(button => {
        try {
          const state = button.dataset.state;
          const icon = button.querySelector('.speak-icon');
          const text = button.querySelector('.speak-text');

          if (state === 'pending') {
            const speakAt = parseInt(button.dataset.speakAt || '0');
            const remainingMs = speakAt - now;
            const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
            if (icon) icon.textContent = '🔊';
            if (text) text.textContent = `${remainingSeconds}s`;
          } else {
            const stateAt = parseInt(button.dataset.stateAt || '0');
            if (now - stateAt > 1200) {
              delete button.dataset.state;
              delete button.dataset.stateAt;
              delete button.dataset.speakAt;
              if (icon) icon.textContent = '🔊';
              if (text) text.textContent = 'Speak';
            }
          }
        } catch (speakButtonError) {
          console.error('KeePassXC OTP: Error updating speak button state:', speakButtonError);
        }
      });
    } catch (error) {
      console.error('KeePassXC OTP: Error in updateButtonStates:', error);
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

    // Remove cached token entries for entities that no longer exist
    const activeEntityIds = new Set(otpEntities.map(entity => entity.entity_id));
    this._stableTokens.forEach((_, entityId) => {
      if (!activeEntityIds.has(entityId)) {
        this._stableTokens.delete(entityId);
      }
    });

    if (otpEntities.length === 0) {
      this.content.innerHTML = `
        <div class="empty">
          <ha-icon icon="mdi:shield-key-outline"></ha-icon>
          <p>No OTP tokens found.</p>
          <p class="hint">Add the KeePassXC OTP integration to get started.</p>
        </div>
      `;
      this._rendered = false;
      this._entities = [];
      return;
    }

    // ✅ Only render HTML if not yet rendered OR entity list changed
    // Check if entity list changed (more efficient comparison)
    let entitiesChanged = false;
    if (!this._rendered) {
      entitiesChanged = true;
    } else if (otpEntities.length !== this._entities.length) {
      entitiesChanged = true;
    } else {
      // Same length, check if IDs match
      for (let i = 0; i < otpEntities.length; i++) {
        if (otpEntities[i].entity_id !== this._entities[i].entity_id) {
          entitiesChanged = true;
          break;
        }
      }
    }
    
    if (entitiesChanged) {
      // Full render needed - entities added/removed
      this.content.innerHTML = otpEntities.map(entity => this.renderOTPEntry(entity)).join('');
      
      // Add click handlers for copy buttons
      this.content.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const entityId = e.currentTarget.dataset.entityId;
          this.copyTokenWithButton(e.currentTarget, entityId);
        });
      });

      this.content.querySelectorAll('.speak-button').forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const entityId = e.currentTarget.dataset.entityId;
          this.speakTokenWithDelay(e.currentTarget, entityId);
        });
      });
      
      this._rendered = true;
      this._entities = otpEntities;
    } else {
      // ✅ Just update token values dynamically (no re-render!)
      this.updateTokenValues(otpEntities);
    }
  }

  updateTokenValues(entities) {
    // Update token values without destroying the DOM
    entities.forEach(entity => {
      const tokenElement = this.content.querySelector(`.otp-token[data-entity-id="${entity.entity_id}"]`);
      if (tokenElement) {
        const token = this.getStableTokenForEntity(entity);
        const digits = entity.attributes.digits || token.length;
        const formattedToken = this.formatToken(token, digits);
        tokenElement.textContent = formattedToken;
      }
    });
  }

  getStableTokenForEntity(entity) {
    const entityId = entity.entity_id;
    const token = String(entity.state || '');
    const period = entity.attributes.period || 30;
    const currentSlice = Math.floor(Date.now() / 1000 / period);
    const existing = this._stableTokens.get(entityId);

    if (!existing || existing.slice !== currentSlice) {
      this._stableTokens.set(entityId, { slice: currentSlice, token });
      return token;
    }

    return existing.token;
  }

  formatToken(token, digits) {
    // Format token with space in the middle for readability
    // Works for 6 digits (123 456), 8 digits (1234 5678), etc.
    if (!token || token.length === 0) {
      return token;
    }
    
    // Use actual token length for split position to handle any length correctly
    const half = Math.floor(token.length / 2);
    // Use non-breaking space to avoid line wrap between token groups on mobile
    return token.slice(0, half) + '\u00A0' + token.slice(half);
  }

  renderOTPEntry(entity) {
    const token = this.getStableTokenForEntity(entity);
    const period = entity.attributes.period || 30;
    const digits = entity.attributes.digits || token.length;
    const issuer = entity.attributes.issuer || '';
    const account = entity.attributes.account || '';
    const name = entity.attributes.friendly_name || entity.entity_id;
    const url = entity.attributes.url || null;
    const username = entity.attributes.username || null;
    
    // Calculate time remaining LOCALLY using current timestamp
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = period - (now % period);
    
    // Calculate percentage and color
    const percentage = (timeRemaining / period) * 100;
    let gaugeColor = '#4caf50'; // green
    if (percentage < 66) gaugeColor = '#ff9800'; // yellow/orange
    if (percentage < 33) gaugeColor = '#f44336'; // red
    
    // Format token with space in middle for readability
    const formattedToken = this.formatToken(token, digits);
    
    // Build details line: Username • clickable URL
    let detailsHtml = '';
    
    // Add username if available (escape HTML for security)
    if (username) {
      const escapedUsername = this.escapeHtml(username);
      detailsHtml += `<span class="otp-username">${escapedUsername}</span>`;
    }
    
    // Add clickable URL if available
    if (url) {
      try {
        const urlObj = new URL(url);
        // Only allow http and https protocols for security
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          const hostname = urlObj.hostname;
          const escapedUrl = this.escapeHtml(url);
          if (detailsHtml) detailsHtml += ' • ';
          detailsHtml += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="otp-url">🔗 ${hostname}</a>`;
        }
      } catch (e) {
        // Invalid URL, ignore
      }
    }
    
    return `
      <div class="otp-entry">
        <div class="gauge-container">
          <svg viewBox="0 0 36 36" class="circular-gauge" data-entity-id="${entity.entity_id}">
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
          <div class="otp-token-row">
            <div class="otp-token" data-entity-id="${entity.entity_id}">${formattedToken}</div>
            <div class="otp-actions">
              <button class="copy-button" data-entity-id="${entity.entity_id}" title="Copy to clipboard">
                <span class="copy-icon">📋</span>
                <span class="copy-text">Copy</span>
              </button>
              <button class="speak-button" data-entity-id="${entity.entity_id}" title="Read OTP after 5 seconds">
                <span class="speak-icon">🔊</span>
                <span class="speak-text">Speak</span>
              </button>
            </div>
          </div>
          ${detailsHtml ? `<div class="otp-details">${detailsHtml}</div>` : ''}
        </div>
      </div>
    `;
  }

  async copyTokenWithButton(button, entityId) {
    const state = this._hass.states[entityId];
    const token = state ? this.getStableTokenForEntity(state) : '';
    
    try {
      // Try modern Clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(token);
        this.showCopiedState(button, entityId);
      } else {
        // Fallback for HTTP or older browsers
        this.copyToClipboardFallback(token);
        this.showCopiedState(button, entityId);
      }
    } catch (err) {
      console.error('Copy failed, trying fallback:', err);
      try {
        this.copyToClipboardFallback(token);
        this.showCopiedState(button, entityId);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
        this.showErrorState(button, entityId);
      }
    }
  }

  showCopiedState(button, entityId) {
    // Store state as data attribute with timestamp
    button.dataset.state = 'copied';
    button.dataset.copiedAt = Date.now().toString();
    
    // Update button content immediately
    const icon = button.querySelector('.copy-icon');
    const text = button.querySelector('.copy-text');
    
    if (icon) icon.textContent = '✅';
    if (text) text.textContent = 'Copied!';
    
    // No timeout needed - updateButtonStates() will clean it up
  }

  showErrorState(button, entityId) {
    // Store state as data attribute with timestamp
    button.dataset.state = 'error';
    button.dataset.copiedAt = Date.now().toString();
    
    // Update button content immediately
    const icon = button.querySelector('.copy-icon');
    const text = button.querySelector('.copy-text');
    
    if (icon) icon.textContent = '❌';
    if (text) text.textContent = 'Error!';
    
    // No timeout needed - updateButtonStates() will clean it up
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

  async speakTokenWithDelay(button, entityId) {
    const state = this._hass.states[entityId];
    if (!state) {
      this.showSpeakErrorState(button);
      return;
    }

    if (this.shouldUseHomeAssistantTts()) {
      const selected = await this.ensureCompanionNotifyServiceSelected();
      if (!selected) {
        this.showSpeakErrorState(button);
        return;
      }
    }

    const existingTimeout = this._speakTimeouts.get(entityId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this._speakTimeouts.delete(entityId);
    }

    const delayMs = this.getSpeakDelayMs();

    button.dataset.state = 'pending';
    button.dataset.stateAt = Date.now().toString();
    button.dataset.speakAt = (Date.now() + delayMs).toString();

    const runSpeak = () => {
      this._speakTimeouts.delete(entityId);
      const currentState = this._hass.states[entityId];
      const token = currentState ? this.getStableTokenForEntity(currentState) : null;

      if (!token) {
        this.showSpeakErrorState(button);
        return;
      }

      this.speakToken(token).then((spoken) => {
        if (spoken) {
          this.showSpokenState(button);
        } else {
          this.showSpeakErrorState(button);
        }
      }).catch((error) => {
        console.error('KeePassXC OTP: Speech synthesis failed:', error);
        this.showSpeakErrorState(button);
      });
    };

    // Keep speech in the direct click call stack when delay is 0.
    // Android Home Assistant Companion WebView may reject speech calls
    // that happen asynchronously even with a zero-delay timeout.
    if (delayMs <= 0) {
      runSpeak();
      return;
    }

    const timeoutId = setTimeout(runSpeak, delayMs);
    this._speakTimeouts.set(entityId, timeoutId);
  }

  getSpeakDelayMs() {
    const configuredDelay = Number(this.config?.speak_delay_ms);
    if (Number.isFinite(configuredDelay) && configuredDelay >= 0) {
      return configuredDelay;
    }
    return 5000;
  }

  speakToken(token) {
    if (this.shouldUseHomeAssistantTts()) {
      return this.speakTokenViaHomeAssistant(token);
    }
    return this.speakTokenInBrowser(token);
  }

  shouldUseHomeAssistantTts() {
    return this.isCompanionApp() && this.config?.use_home_assistant_tts_in_companion === true;
  }

  isCompanionApp() {
    const userAgent = navigator.userAgent || '';
    return /Home\s?Assistant/i.test(userAgent);
  }

  async speakTokenViaHomeAssistant(token) {
    try {
      if (!this._hass?.callService) {
        return false;
      }
      const message = String(token).split('').join(' ');

      const notifyServiceName = await this.getCompanionNotifyService();
      if (notifyServiceName) {
        try {
          const [domain, service] = String(notifyServiceName).split('.');
          if (domain && service) {
            await this._hass.callService(domain, service, {
              message: 'TTS',
              data: { tts_text: message }
            });
            return true;
          }
        } catch (notifyError) {
          console.warn('KeePassXC OTP: Notify service failed, falling back to tts.speak:', notifyError);
        }
      }

      return false;
    } catch (error) {
      console.error('KeePassXC OTP: Home Assistant TTS failed:', error);
      return false;
    }
  }

  async getCompanionNotifyService() {
    if (!this.isCompanionApp()) {
      return null;
    }

    if (this._cachedCompanionNotifyService) {
      return this._cachedCompanionNotifyService;
    }

    const candidateId = window.externalApp?.deviceID
      || window.externalApp?.deviceId
      || window.externalApp?.device_id
      || null;
    const candidateName = window.externalApp?.deviceName
      || window.externalApp?.device_name
      || null;
    const tokens = [candidateId, candidateName]
      .filter(Boolean)
      .map((value) => String(value)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, ''))
      .filter(Boolean);

    const preferredCandidates = tokens.map((token) => `notify.mobile_app_${token}`);
    const discovered = await this.discoverMobileAppNotifyServices();
    console.info('KeePassXC OTP: Companion notify detection candidates:', {
      candidateId,
      candidateName,
      tokens,
      preferredCandidates,
      discovered
    });

    const exactMatch = preferredCandidates.find((candidate) => discovered.includes(candidate));
    if (exactMatch) {
      this._cachedCompanionNotifyService = exactMatch;
      return exactMatch;
    }

    const fuzzyMatch = discovered.find((serviceName) =>
      tokens.some((token) => serviceName.includes(token))
    );
    if (fuzzyMatch) {
      this._cachedCompanionNotifyService = fuzzyMatch;
      return fuzzyMatch;
    }

    if (discovered.length === 1) {
      this._cachedCompanionNotifyService = discovered[0];
      console.info('KeePassXC OTP: Companion notify auto-selected single service:', discovered[0]);
      return discovered[0];
    }

    // Fallback: match current HA user to mobile_app device_tracker entities.
    const userTrackerCandidates = this.getUserTrackerNotifyCandidates();
    const trackerMatch = userTrackerCandidates.find((candidate) => discovered.includes(candidate));
    if (trackerMatch) {
      this._cachedCompanionNotifyService = trackerMatch;
      console.info('KeePassXC OTP: Companion notify selected by user tracker match:', trackerMatch);
      return trackerMatch;
    }

    const storedService = this.getStoredNotifyService();
    if (storedService) {
      return storedService;
    }

    const guessed = preferredCandidates[0] || null;
    if (guessed) {
      console.warn('KeePassXC OTP: Companion notify detection falling back to guessed service:', guessed);
      return guessed;
    }
    return null;
  }

  async ensureCompanionNotifyServiceSelected() {
    const discovered = await this.discoverMobileAppNotifyServices();
    const suggested = await this.getCompanionNotifyService();
    const selected = await this.promptForNotifyService(discovered, suggested);
    if (!selected) {
      return false;
    }
    this._cachedCompanionNotifyService = selected;
    this.storeNotifyService(selected);
    return true;
  }

  async discoverMobileAppNotifyServices() {
    try {
      if (!this._hass?.callWS) {
        return [];
      }
      const services = await this._hass.callWS({ type: 'get_services' });
      const notifyServices = services?.notify ? Object.keys(services.notify) : [];
      return notifyServices
        .filter((serviceName) => serviceName.startsWith('mobile_app_'))
        .map((serviceName) => `notify.${serviceName}`);
    } catch (error) {
      console.warn('KeePassXC OTP: Could not discover notify services:', error);
      return [];
    }
  }

  getUserTrackerNotifyCandidates() {
    if (!this._hass?.states) {
      return [];
    }
    const currentUserId = this._hass?.user?.id || null;
    const candidates = Object.entries(this._hass.states)
      .filter(([entityId, state]) => entityId.startsWith('device_tracker.'))
      .filter(([, state]) => !currentUserId || state.attributes?.user_id === currentUserId)
      .sort(([, a], [, b]) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
      .map(([entityId]) => `notify.mobile_app_${entityId.replace('device_tracker.', '')}`);
    return Array.from(new Set(candidates));
  }

  getStoredNotifyService() {
    try {
      const key = this.getNotifyServiceStorageKey();
      const value = window.localStorage.getItem(key);
      if (value && /^notify\.mobile_app_[a-z0-9_]+$/i.test(value)) {
        return value;
      }
    } catch (error) {
      console.warn('KeePassXC OTP: Failed to read stored notify service:', error);
    }
    return null;
  }

  storeNotifyService(serviceName) {
    try {
      const key = this.getNotifyServiceStorageKey();
      window.localStorage.setItem(key, serviceName);
    } catch (error) {
      console.warn('KeePassXC OTP: Failed to store notify service:', error);
    }
  }

  getNotifyServiceStorageKey() {
    const userId = this._hass?.user?.id || 'default';
    return `keepassxc_otp_notify_service_${userId}`;
  }

  async promptForNotifyService(discovered, preselected) {
    if (Array.isArray(discovered) && discovered.length > 0) {
      return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.background = 'rgba(0, 0, 0, 0.45)';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.style.zIndex = '9999';

        const dialog = document.createElement('div');
        dialog.style.background = 'var(--card-background-color, #fff)';
        dialog.style.color = 'var(--primary-text-color, #111)';
        dialog.style.borderRadius = '10px';
        dialog.style.padding = '16px';
        dialog.style.maxWidth = '420px';
        dialog.style.width = 'calc(100% - 32px)';
        dialog.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';

        const title = document.createElement('div');
        title.textContent = 'Ausgabegerät auswählen';
        title.style.fontWeight = '600';
        title.style.marginBottom = '8px';

        const subtitle = document.createElement('div');
        subtitle.textContent = 'Bitte wähle das Gerät für die OTP-Sprachausgabe.';
        subtitle.style.fontSize = '13px';
        subtitle.style.opacity = '0.85';
        subtitle.style.marginBottom = '12px';

        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.padding = '10px';
        select.style.borderRadius = '8px';
        select.style.border = '1px solid var(--divider-color, #ccc)';
        discovered.forEach((serviceName) => {
          const option = document.createElement('option');
          option.value = serviceName;
          option.textContent = this.formatNotifyServiceForDisplay(serviceName);
          select.appendChild(option);
        });
        const defaultOption = preselected && discovered.includes(preselected)
          ? preselected
          : (discovered[0] || '');
        if (defaultOption) {
          select.value = defaultOption;
        }

        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.gap = '8px';
        buttons.style.marginTop = '14px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Abbrechen';
        cancelBtn.style.padding = '8px 12px';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.border = '1px solid var(--divider-color, #ccc)';
        cancelBtn.style.background = 'transparent';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Übernehmen';
        saveBtn.style.padding = '8px 12px';
        saveBtn.style.borderRadius = '8px';
        saveBtn.style.border = 'none';
        saveBtn.style.background = 'var(--primary-color, #03a9f4)';
        saveBtn.style.color = '#fff';

        const cleanup = (value) => {
          backdrop.remove();
          resolve(value);
        };

        cancelBtn.addEventListener('click', () => cleanup(null));
        saveBtn.addEventListener('click', () => {
          const value = select.value;
          cleanup(value || null);
        });
        backdrop.addEventListener('click', (event) => {
          if (event.target === backdrop) {
            cleanup(null);
          }
        });

        buttons.appendChild(cancelBtn);
        buttons.appendChild(saveBtn);
        dialog.appendChild(title);
        dialog.appendChild(subtitle);
        dialog.appendChild(select);
        dialog.appendChild(buttons);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
      });
    }

    if (typeof window.prompt !== 'function') {
      return null;
    }
    const defaultValue = preselected || discovered[0] || 'notify.mobile_app_';
    const entered = window.prompt(
      'KeePassXC OTP: Bitte notify Service eingeben (z.B. notify.mobile_app_s26ultra)',
      defaultValue
    );
    if (!entered) {
      return null;
    }
    const normalized = entered.trim();
    if (!/^notify\.mobile_app_[a-z0-9_]+$/i.test(normalized)) {
      console.warn('KeePassXC OTP: Invalid notify service entered:', normalized);
      return null;
    }
    return normalized;
  }

  formatNotifyServiceForDisplay(serviceName) {
    return String(serviceName)
      .replace(/^notify\.mobile_app_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  speakTokenInBrowser(token) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        const speakableToken = String(token).split('').join(' ');
        const utterance = new SpeechSynthesisUtterance(speakableToken);
        let resolved = false;
        let optimisticTimeout = null;
        let fallbackTimeout = null;

        const finish = (result) => {
          if (resolved) {
            return;
          }
          resolved = true;
          if (optimisticTimeout) clearTimeout(optimisticTimeout);
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
          resolve(result);
        };

        utterance.lang = this._hass?.language || navigator.language || 'en-US';
        utterance.rate = 0.9;
        utterance.onstart = () => finish(true);
        utterance.onerror = () => finish(false);

        // Some WebViews (including HA Companion on Android) can speak audio
        // but never emit onstart/onend reliably. Treat a successful speak()
        // call as success after a short grace period unless onerror fires.
        optimisticTimeout = setTimeout(() => finish(true), 500);
        fallbackTimeout = setTimeout(() => {
          const synth = window.speechSynthesis;
          const isActive = synth && (synth.speaking || synth.pending);
          finish(Boolean(isActive));
        }, 2500);

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('KeePassXC OTP: Speech synthesis failed:', error);
        resolve(false);
      }
    });
  }

  showSpokenState(button) {
    button.dataset.state = 'spoken';
    button.dataset.stateAt = Date.now().toString();
    delete button.dataset.speakAt;

    const icon = button.querySelector('.speak-icon');
    const text = button.querySelector('.speak-text');
    if (icon) icon.textContent = '✅';
    if (text) text.textContent = 'Spoken';
  }

  showSpeakErrorState(button) {
    button.dataset.state = 'error';
    button.dataset.stateAt = Date.now().toString();
    delete button.dataset.speakAt;

    const icon = button.querySelector('.speak-icon');
    const text = button.querySelector('.speak-text');
    if (icon) icon.textContent = '❌';
    if (text) text.textContent = 'Error';
  }

  escapeHtml(text) {
    // Escape HTML special characters to prevent XSS
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
      .otp-token-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 4px;
        flex-wrap: wrap;
      }
      .otp-token {
        font-size: 32px;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        letter-spacing: 4px;
        color: var(--primary-color);
        user-select: all;
        flex: 0 0 auto;
        min-width: fit-content;
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
        /* No hover effect - token is not interactive */
      }
      .copy-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s ease, transform 0.1s ease;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .otp-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex: 0 0 auto;
      }
      .speak-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: var(--secondary-background-color, #546e7a);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s ease, transform 0.1s ease;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .copy-button:hover, .speak-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      .copy-button:active, .speak-button:active {
        transform: translateY(0);
      }
      .copy-button[data-state="copied"] {
        background: #4caf50 !important;
        animation: pulse 0.3s ease;
      }
      .copy-button[data-state="error"] {
        background: #f44336 !important;
        animation: shake 0.3s ease;
      }
      .speak-button[data-state="pending"] {
        background: #607d8b !important;
      }
      .speak-button[data-state="spoken"] {
        background: #4caf50 !important;
        animation: pulse 0.3s ease;
      }
      .speak-button[data-state="error"] {
        background: #f44336 !important;
        animation: shake 0.3s ease;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
      .copy-icon {
        font-size: 16px;
        line-height: 1;
      }
      .copy-text {
        font-size: 14px;
        line-height: 1;
      }
      .speak-icon {
        font-size: 16px;
        line-height: 1;
      }
      .speak-text {
        font-size: 14px;
        line-height: 1;
      }
      .otp-details {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .otp-username {
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .otp-url {
        color: var(--primary-color);
        text-decoration: none;
        transition: color 0.2s ease;
      }
      .otp-url:hover {
        color: var(--accent-color);
        text-decoration: underline;
      }
      @media (max-width: 600px) {
        .otp-token-row {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }
        .otp-token {
          font-size: 28px;
          letter-spacing: 2.5px;
          width: 100%;
        }
        .copy-button {
          padding: 8px 12px;
          align-self: flex-start;
        }
        .otp-actions {
          width: 100%;
        }
        .speak-button {
          padding: 8px 12px;
          align-self: flex-start;
        }
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
  '%c KEEPASSXC-OTP-CARD %c v2.0.1-beta.2 ',
  'color: white; background: #039be5; font-weight: 700;',
  'color: #039be5; background: white; font-weight: 700;'
);
