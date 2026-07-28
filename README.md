# Wynand Janse van Rensburg, CV Website

Personal portfolio and CV, hand-built with no frameworks and self-hosted on a Raspberry Pi.

## Features

- **Command palette**: `Ctrl/Cmd + K` to jump anywhere or run an action
- **Interactive shell**: a real in-page terminal (`Ctrl + \``) with tab completion, command history and live data commands
- **Live server telemetry**: CPU, memory, disk, temperature, load and uptime streamed from the Pi
- **Containerised demos**: visitors run desktop apps in-browser via throwaway Docker containers
- **Animated hero**: canvas particle constellation that reacts to the cursor
- **Weather effects**: rain, snow, cloud, fog and storm overlays driven by the visitor's real location
- **Lamp pull-cord**: drag the cord to switch between light and dark themes
- **Filterable project grid** with detail sheets
- Custom cursor, magnetic buttons, scroll-spy navigation, reduced-motion and print support

## Structure

```
index.html            markup
secret.html           number-guessing game
assets/css/style.css  design system and all component styles
assets/js/
  core.js             theme, nav, reveal, cursor, lamp, shared helpers
  hero.js             canvas constellation and role typewriter
  content.js          skills explorer, project grid, detail sheet
  weather.js          location-based weather effects
  telemetry.js        live Raspberry Pi metrics
  demos.js            containerised demo sessions
  terminal.js         in-page shell and log console
  palette.js          Ctrl+K command palette
  analytics.js        first-party page metrics
demo-manager/         Node service that orchestrates the demo containers
```

## Tech

HTML5, CSS custom properties, vanilla JavaScript. No build step, no framework and no runtime dependencies. The only external requests are Google Fonts and the weather API.

## Local development

```bash
npm install
npm start          # http://localhost:3000
```

`/stats` and `/demo` are served by the Pi in production, so telemetry and demos show as unavailable locally.

## Hosting

Self-hosted on a Raspberry Pi behind Cloudflare. Demo containers run on a separate machine reached over Tailscale, with the Docker API accessed through an SSH tunnel.

Host-specific values are kept out of the repo. Copy the two example units in `demo-manager/`, fill in your own user and host, and install them:

```bash
cp demo-manager/demo-docker-tunnel.service.example /etc/systemd/system/demo-docker-tunnel.service
cp demo-manager/demo-manager.service.example /etc/systemd/system/demo-manager.service
# edit both, then:
systemctl daemon-reload && systemctl enable --now demo-docker-tunnel demo-manager
```

`demo-manager/server.js` reads the demo host from `DEMO_REMOTE_HOST`, set via `Environment=` in the unit file. It falls back to `127.0.0.1` if unset.
