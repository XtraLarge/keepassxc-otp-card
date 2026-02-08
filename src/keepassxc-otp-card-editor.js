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
