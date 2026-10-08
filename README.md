# Wynand Janse van Rensburg, CV Website

Personal portfolio and CV, hand-built with no frameworks and self-hosted on a Raspberry Pi.

## Features

- **Live machine hero**: a Raspberry Pi 4 built in three.js and driven by the real Pi serving the page. The SoC glows with its actual temperature, heat rises with CPU load, and each telemetry request flashes the Ethernet LEDs
- **Runnable demos**: visitors run desktop apps in-browser via throwaway Docker containers, with honest online/offline status
- **Command palette**: `Ctrl/Cmd + K` to jump anywhere or run an action
- **Interactive shell**: an in-page terminal (`Ctrl + \``) with tab completion, history and live data commands

## Structure

```
index.html              markup
secret.html             number-guessing game
assets/css/style.css    all styles
assets/vendor/          three.js r160 (self-hosted)
assets/js/
  machine.js            3D Pi hero (ES module)
  core.js               nav, reveal, toasts, logging, shared helpers
  content.js            project data, panel visuals, detail sheet
  telemetry.js          polls /stats and broadcasts pi:stats
  demos.js              containerised demo sessions
  terminal.js           in-page shell and log console
  palette.js            Ctrl+K command palette
  analytics.js          first-party page metrics
demo-manager/           Node service that orchestrates the demo containers
```

## Tech

HTML5, CSS custom properties, vanilla JavaScript. No build step and no framework; the one library, three.js, is self-hosted. The only external request is Google Fonts.

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
