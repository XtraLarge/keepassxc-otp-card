# KeePassXC OTP Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![GitHub Release](https://img.shields.io/github/release/XtraLarge/keepassxc-otp-card.svg)](https://github.com/XtraLarge/keepassxc-otp-card/releases)
[![License](https://img.shields.io/github/license/XtraLarge/keepassxc-otp-card.svg)](LICENSE)

A beautiful Lovelace card for displaying OTP tokens from the [KeePassXC OTP Integration](https://github.com/XtraLarge/keepassxc_otp).

![Preview](https://via.placeholder.com/800x400.png?text=KeePassXC+OTP+Card+Preview)

## ✨ Features

- 🔍 **Auto-Discovery** - Automatically finds all OTP sensor entities
- 📋 **Click-to-Copy** - Click any token to copy it to clipboard
- ⏱️ **Circular Timer** - Visual countdown gauge (green → yellow → red)
- 👤 **Person Filter** - Show tokens for specific people
- 🎨 **Beautiful Design** - Modern UI with smooth animations
- 🔄 **Live Updates** - Tokens refresh automatically
- 🌙 **Theme Support** - Adapts to your Home Assistant theme

---

## 📦 Installation

### HACS (Recommended)

1. Open HACS
2. Go to "Frontend"
3. Click the menu (⋮) in the top right
4. Select "Custom repositories"
5. Add repository URL: `https://github.com/XtraLarge/keepassxc-otp-card`
6. Category: "Lovelace"
7. Click "Add"
8. Find "KeePassXC OTP Card" in HACS
9. Click "Install"
10. Restart Home Assistant

### Manual Installation

1. Download `keepassxc-otp-card.js` from the [latest release](https://github.com/XtraLarge/keepassxc-otp-card/releases)
2. Copy it to `<config>/www/keepassxc-otp-card.js`
3. Add resource in Home Assistant:
   ```yaml
   # configuration.yaml or in UI:
   # Settings → Dashboards → Resources → Add Resource
   url: /local/keepassxc-otp-card.js
   type: module
   ```
4. Restart Home Assistant

---

## 🎨 Configuration

### Visual Editor

The card includes a visual configuration editor:

1. Click "Add Card" in Lovelace
2. Search for "KeePassXC OTP Card"
3. Configure using the visual editor:
   - **Title**: Card header text
   - **Person Filter**: Show tokens for specific person only
   - **Show Person Names**: Display person name in token details

### YAML Configuration

You can also configure the card manually in YAML:

#### Basic Card (Show All Tokens)

```yaml
type: custom:keepassxc-otp-card
title: 🔐 My OTP Tokens
```

#### Show Tokens for Specific Person

```yaml
type: custom:keepassxc-otp-card
title: 🔐 Alice's OTP Tokens
person_entity_id: person.alice
```

#### Show Person Names

```yaml
type: custom:keepassxc-otp-card
title: 🔐 All OTP Tokens
show_person: true
```

#### Minimal Configuration

```yaml
type: custom:keepassxc-otp-card
```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description | Visual Editor |
|--------|------|---------|-------------|---------------|
| `type` | string | **Required** | Must be `custom:keepassxc-otp-card` | N/A |
| `title` | string | `🔐 KeePassXC OTP` | Card title | ✅ Text input |
| `person_entity_id` | string | `null` | Filter by person entity | ✅ Dropdown selector |
| `show_person` | boolean | `false` | Show person name in details | ✅ Checkbox |

---

## 📸 Screenshots

### All Tokens View
```yaml
type: custom:keepassxc-otp-card
title: 🔐 All OTP Tokens
```

### Person-Specific View
```yaml
type: custom:keepassxc-otp-card
title: 🔐 Alice's Tokens
person_entity_id: person.alice
```

---

## 🎯 How It Works

1. **Auto-Discovery**: Card scans for entities starting with `sensor.keepassxc_otp_`
2. **Filtering**: Optionally filters by `person_entity_id` attribute
3. **Client-Side Calculations**: 
   - Reads `period` attribute (e.g., 30 seconds) from entity
   - Reads `digits` attribute (e.g., 6 or 8 digits) for token formatting
   - Calculates countdown and gauge progress locally in the browser
   - No reliance on `time_remaining` from the integration (reduces Home Assistant load)
4. **Display**: Shows tokens with circular timer gauges
5. **Copy**: Click token to copy to clipboard
6. **Updates**: Refreshes automatically as token timers countdown

### Performance Benefits

The card uses client-side calculations for all countdown timers and gauge visualizations:
- **Reduced HA Load**: No constant `time_remaining` updates from the integration
- **Smoother Animation**: Countdown calculated locally using `requestAnimationFrame`
- **Synchronization**: All timers stay perfectly in sync with the `period` attribute
- **Flexibility**: Supports any token period (15s, 30s, 60s, etc.) and digit count (6, 8, etc.)

---

## 🔗 Requirements

- [Home Assistant](https://www.home-assistant.io/) 2023.1 or newer
- [KeePassXC OTP Integration](https://github.com/XtraLarge/keepassxc_otp)

### Expected Entity Attributes

The card reads the following attributes from OTP sensor entities:

| Attribute | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `state` | string | ✅ Yes | Current OTP token | N/A |
| `period` | number | ✅ Yes | Token refresh interval in seconds | 30 |
| `digits` | number | No | Number of digits in token (6 or 8) | Detected from token length |
| `friendly_name` | string | No | Display name for the token | Entity ID |
| `issuer` | string | No | Service/issuer name | - |
| `account` | string | No | Account name | - |
| `username` | string | No | Username associated with token | - |
| `url` | string | No | Website URL (displays as clickable link) | - |
| `person_entity_id` | string | No | Person entity for filtering | - |

**Note**: The card does **not** use `time_remaining` attribute. All countdown calculations are performed client-side using the `period` attribute.

---

## 🐛 Troubleshooting

### Card Not Showing

1. Check that the resource is added correctly:
   - Settings → Dashboards → Resources
   - Look for `/local/keepassxc-otp-card.js` or `/hacsfiles/keepassxc-otp-card/keepassxc-otp-card.js`

2. Clear browser cache:
   - Press `Ctrl + F5` (Windows/Linux)
   - Press `Cmd + Shift + R` (Mac)

3. Check browser console for errors:
   - Press `F12` → Console tab

### No Tokens Showing

1. Verify KeePassXC OTP integration is installed and configured
2. Check that OTP sensor entities exist:
   - Developer Tools → States
   - Look for `sensor.keepassxc_otp_*`

3. If using `person_entity_id`, verify the person entity ID is correct:
   ```yaml
   person_entity_id: person.alice  # Must match exactly
   ```

### Copy Not Working

- Modern browsers require HTTPS for clipboard API
- If on HTTP, uses fallback notification method
- Check browser console for clipboard errors

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🙏 Credits

- Created by [XtraLarge](https://github.com/XtraLarge)
- Part of the [KeePassXC OTP Integration](https://github.com/XtraLarge/keepassxc_otp) ecosystem

---

## 🔗 Related Projects

- [KeePassXC OTP Integration](https://github.com/XtraLarge/keepassxc_otp) - The Home Assistant integration
- [KeePassXC](https://keepassxc.org/) - Cross-platform password manager

---

## ⭐ Support

If you like this card, please give it a star on GitHub! ⭐

For issues or feature requests, please use the [GitHub Issues](https://github.com/XtraLarge/keepassxc-otp-card/issues) page.
