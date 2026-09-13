# Basement Theater Design Tool

A self-hosted web app for planning a basement home theater: a 2D layout
designer, theater math calculators, acoustics guidance, and an equipment/
budget tracker. Runs entirely on your own home server — no cloud, no
accounts beyond a single shared login.

## Features

- **Layout designer** — draw your basement room to scale (feet/inches) and
  drag-and-drop screens, seating, speakers, risers, furniture, doors, etc.
  Save as many layouts as you want to compare options side by side.
- **Theater math calculators** — screen size vs. seating distance & viewing
  angle (THX/SMPTE), projector throw distance, 5.1/7.1 speaker placement
  angles, riser height estimator.
- **Acoustics** — room mode calculator (flags problematic room dimension
  ratios) plus a treatment placement checklist (reflection points, bass
  traps, decoupling, basement-specific concerns).
- **Equipment & budget tracker** — a running list of gear with category,
  price, and status (wishlist/ordered/purchased/installed), with budget
  totals.

## Quick start (Docker, recommended)

1. Copy `.env.example` to `.env` and set a password:
   ```
   cp .env.example .env
   # edit .env and set APP_PASSWORD to something only you know
   ```
2. Build and start it:
   ```
   docker compose up -d --build
   ```
3. Visit `http://<your-server-ip>:8080` and log in with `APP_PASSWORD`.

All app data (layouts, items, equipment list) lives in a single JSON file
at `./data/db.json`, mounted as a volume so it survives container
rebuilds/updates.

### Changing the password later

Edit `APP_PASSWORD` in `.env`, then `docker compose up -d` to restart with
the new value. It takes effect immediately — no data loss, since the
password itself is never written to disk (only compared against the env
var at login).

## Can I use this from my laptop too?

Yes. This is a normal web app served over HTTP — any device with a
browser on a network path to the server can use it, laptop included, with
no separate install:

- **Same Wi-Fi/LAN as the server:** browse to `http://<server-lan-ip>:8080`
  from the laptop. Find the server's LAN IP with `ip addr` / `hostname -I`
  on Linux, or check your router's connected-devices list.
- **Want a name instead of an IP:** set up local DNS or mDNS (e.g. Avahi/
  Bonjour so it's reachable as `basement.local`), or add a line to your
  laptop's hosts file pointing at the server's IP.
- **Want access away from home:** don't just port-forward 8080 straight to
  the internet — there's no HTTPS and the login is a single password with
  no rate limiting. Instead:
  - **Tailscale or WireGuard (recommended)** — puts your laptop and the
    server on a private virtual network. Once connected, browse to the
    server's Tailscale/VPN address from anywhere, with nothing exposed
    publicly.
  - **Reverse proxy with HTTPS** (Caddy, Nginx Proxy Manager, Traefik) plus
    a domain, if you specifically want it reachable on the open internet.

## Local development (without Docker)

Run the API and the frontend dev server in two terminals:

```bash
# Terminal 1 — API on :8080
cd server
npm install
APP_PASSWORD=devpass npm start

# Terminal 2 — Vite dev server on :5173, proxies /api to :8080
cd client
npm install
npm run dev
```

Visit `http://localhost:5173`.

## Project layout

```
server/   Express API + JSON file storage (server/src/index.js)
client/   React (Vite) frontend
Dockerfile, docker-compose.yml   Multi-stage build: bundles the client,
                                 serves it + the API from one container.
```

## Notes & disclaimers

The calculators and acoustics guidance are planning aids based on common
industry rules of thumb (THX/SMPTE viewing angle ranges, standard 5.1/7.1
speaker angles, simplified riser and room-mode formulas). They're a
starting point for decisions, not an engineering or code review — for
structural changes (risers, framing), electrical work, moisture control,
or egress requirements, consult a licensed professional.
