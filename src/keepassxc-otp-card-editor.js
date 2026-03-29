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

          <div class="option">
            <label class="label">
              <span>Speak Delay (ms)</span>
              <span class="secondary">Delay before reading token aloud</span>
            </label>
            <input
              type="number"
              id="speak_delay_ms"
              class="value"
              min="0"
              step="500"
            />
          </div>

          <div class="option">
            <label class="label">
              <span>Use HA TTS in Companion</span>
              <span class="secondary">Use Home Assistant tts.speak instead of browser speech in Companion app</span>
            </label>
            <input
              type="checkbox"
              id="use_home_assistant_tts_in_companion"
              class="value"
            />
          </div>

          <div class="option">
            <label class="label">
              <span>TTS Entity ID</span>
              <span class="secondary">Example: tts.piper</span>
            </label>
            <input
              type="text"
              id="tts_entity_id"
              class="value"
              placeholder="tts.piper"
            />
          </div>

          <div class="option">
            <label class="label">
              <span>TTS Media Player</span>
              <span class="secondary">Example: media_player.pixel_8</span>
            </label>
            <input
              type="text"
              id="tts_media_player_entity_id"
              class="value"
              placeholder="media_player.phone"
            />
          </div>

          <div class="option">
            <label class="label">
              <span>Notify Service (optional)</span>
              <span class="secondary">Alternative without media_player, e.g. notify.mobile_app_pixel_8 (leave empty for auto-detect in Companion)</span>
            </label>
            <input
              type="text"
              id="tts_notify_service"
              class="value"
              placeholder="notify.mobile_app_pixel_8"
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

      const speakDelayInput = this.querySelector('#speak_delay_ms');
      if (speakDelayInput) {
        speakDelayInput.value = Number.isFinite(Number(this._config.speak_delay_ms))
          ? String(Number(this._config.speak_delay_ms))
          : '5000';
      }

      const useHaTtsCheckbox = this.querySelector('#use_home_assistant_tts_in_companion');
      if (useHaTtsCheckbox) {
        useHaTtsCheckbox.checked = this._config.use_home_assistant_tts_in_companion === true;
      }

      const ttsEntityInput = this.querySelector('#tts_entity_id');
      if (ttsEntityInput) {
        ttsEntityInput.value = this._config.tts_entity_id || '';
      }

      const ttsMediaPlayerInput = this.querySelector('#tts_media_player_entity_id');
      if (ttsMediaPlayerInput) {
        ttsMediaPlayerInput.value = this._config.tts_media_player_entity_id || '';
      }

      const ttsNotifyServiceInput = this.querySelector('#tts_notify_service');
      if (ttsNotifyServiceInput) {
        ttsNotifyServiceInput.value = this._config.tts_notify_service || '';
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
    const speakDelayInput = this.querySelector('#speak_delay_ms');
    const useHaTtsCheckbox = this.querySelector('#use_home_assistant_tts_in_companion');
    const ttsEntityInput = this.querySelector('#tts_entity_id');
    const ttsMediaPlayerInput = this.querySelector('#tts_media_player_entity_id');
    const ttsNotifyServiceInput = this.querySelector('#tts_notify_service');

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

    speakDelayInput.addEventListener('change', (e) => {
      const parsed = Number(e.target.value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this._config.speak_delay_ms = Math.round(parsed);
      } else {
        this._config.speak_delay_ms = 5000;
      }
      e.target.value = String(this._config.speak_delay_ms);
      this._fireConfigChanged();
    });

    useHaTtsCheckbox.addEventListener('change', (e) => {
      this._config.use_home_assistant_tts_in_companion = e.target.checked;
      this._fireConfigChanged();
    });

    ttsEntityInput.addEventListener('change', (e) => {
      const value = e.target.value.trim();
      if (value) {
        this._config.tts_entity_id = value;
      } else {
        delete this._config.tts_entity_id;
      }
      this._fireConfigChanged();
    });

    ttsMediaPlayerInput.addEventListener('change', (e) => {
      const value = e.target.value.trim();
      if (value) {
        this._config.tts_media_player_entity_id = value;
      } else {
        delete this._config.tts_media_player_entity_id;
      }
      this._fireConfigChanged();
    });

    ttsNotifyServiceInput.addEventListener('change', (e) => {
      const value = e.target.value.trim();
      if (value) {
        this._config.tts_notify_service = value;
      } else {
        delete this._config.tts_notify_service;
      }
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
