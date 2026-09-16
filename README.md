# Basement Theater Design Tool

A self-hosted web app for planning a basement home theater: a 2D layout
designer, theater math calculators, acoustics guidance, and an equipment/
budget tracker. Runs entirely on your own home server — no cloud, no
accounts beyond a single shared login.

## Features

- **Floor plan designer** — draw the basement's outer shell to exact
  dimensions (L-shapes and bump-outs included), add interior walls with real
  framing thickness, drop in doors, cased openings and windows, then click
  inside any enclosed space to turn it into a named room. Areas are computed
  automatically and update as you move walls.
- **Object library** — structure (columns, beams, soffits, duct chases),
  utilities (furnace, water heater, panel, sump), stairs, seating, tables,
  bar, gym, storage, AV/network and lighting. Everything is a real-world size,
  freely rotatable and resizable.
- **Server rack planning** — rack objects draw their front and rear service
  clearance, estimate heat output in BTU/hr, and warn when placed somewhere
  that will be audible from the theater.
- **3D preview** — orbit the whole basement with walls extruded to their
  ceiling height, door and window openings cut through, and room floors
  colour-coded by purpose.
- **Design checks** — flags rooms that aren't enclosed, objects hanging
  outside the shell, gear taller than the ceiling, and similar mistakes.
- **Theater designer** — mark a room as a theater and it gets its own page:
  - Auto-place any layout from 2.1 up to 9.2.6 at Dolby reference angles, then
    drag individual speakers to fit real walls and soffits. Every speaker is
    continuously re-checked for azimuth, elevation, left/right symmetry and
    front-stage distance, with the problem stated in plain language.
  - Screen sizing with live viewing angle against the SMPTE 30° / THX 36–40°
    targets, and detail expressed as pixels-per-degree against the ~60 PPD
    limit of human acuity.
  - Projector analysis: throw range vs. your actual mount distance, image
    brightness in foot-lamberts and nits for SDR and HDR, required lens shift
    vs. the projector's range, and whether the light path clears people's
    heads.
  - Seating rows with riser heights, per-row viewing angles, and a sightline
    check that tells you exactly how tall a riser needs to be to see over the
    row in front.
  - Boundary interference (SBIR) notes for speakers near walls.
- **Bass and acoustics modelling** — room modes (axial, tangential, oblique)
  with the Schroeder frequency and warnings where modes pile up, plus a
  **bass map** that solves the modal field at ear height and shades the room
  blue where bass cancels and red where it piles up. Drag a subwoofer and the
  nulls move. A placement ranker scores standard one- and two-sub
  arrangements by seat-to-seat consistency and applies the winner in a click.
  First-reflection points are computed by mirror image and drawn on the plan
  so you know exactly where panels go.
- **Theater math calculators** — screen size vs. seating distance & viewing
  angle (THX/SMPTE), projector throw distance, 5.1/7.1 speaker placement
  angles, riser height estimator.
- **Acoustics** — room mode calculator (flags problematic room dimension
  ratios) plus a treatment placement checklist (reflection points, bass
  traps, decoupling, basement-specific concerns).
- **Equipment & budget tracker** — a running list of gear with category,
  price, and status (wishlist/ordered/purchased/installed), with budget
  totals.

### Editor tips

- Lengths accept `32'`, `32'6"`, `390"` or a plain number.
- `Shift` temporarily flips ortho (straight-line) drawing; `Alt` disables
  snapping; `[` and `]` rotate the selection by 15°.
- `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo; `Ctrl+D` duplicates.
- Tool shortcuts: `V` select, `S` shell, `W` wall, `D` door/window, `R` room,
  `M` measure.

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

## Deploying to a Proxmox VM (Docker already installed)

This covers getting the app running inside a VM on a Proxmox host, assuming
the VM already has Docker (and the Docker Compose plugin) installed and
you can SSH into it.

### 1. Get the code onto the VM

From your own machine, copy the project to the VM (replace `user@vm-ip`):

```bash
scp -r Basement-design-tool- user@vm-ip:~/basement-theater
```

Or, if the VM has internet access and you'd rather clone directly, SSH into
the VM and run:

```bash
git clone <your-repo-url> ~/basement-theater
```

### 2. Configure and start it

SSH into the VM, then:

```bash
cd ~/basement-theater
cp .env.example .env
nano .env   # set APP_PASSWORD to something only you know
docker compose up -d --build
docker compose logs -f   # confirm it started, Ctrl+C to stop following
```

### 3. Find the VM's address and connect

```bash
ip -4 addr show   # note the VM's IP on your LAN/bridge
```

Visit `http://<vm-ip>:8080` from any device on the same network and log in
with `APP_PASSWORD`.

### 4. Proxmox-specific notes

- **Networking:** make sure the VM's network device is attached to a
  bridge (e.g. `vmbr0`) that's actually on your home LAN, not an isolated
  internal-only bridge — otherwise other devices (like your laptop) won't
  be able to reach it. Check this under the VM's **Hardware → Network
  Device** in the Proxmox UI.
- **Stable IP:** give the VM a static IP or a DHCP reservation in your
  router (or a static config in the VM's `/etc/netplan/*.yaml` or
  `/etc/network/interfaces`) so `http://<vm-ip>:8080` doesn't change after
  a reboot.
- **Firewall:** if you have the Proxmox firewall enabled on this VM or its
  bridge, add a rule allowing inbound TCP on port 8080 (Datacenter/Node/VM
  → **Firewall**). If it's disabled, nothing to do.
- **Autostart:** enable **Start at boot** in the VM's **Options** in
  Proxmox so it comes back up after a host reboot. Docker Compose's
  `restart: unless-stopped` (already set in `docker-compose.yml`) then
  brings the container back up automatically once the VM itself boots and
  Docker starts.
- **Backups:** Proxmox VM backups/snapshots (via the Backup job or
  `vzdump`) will capture the whole VM including `./data/db.json`, which is
  the simplest way to back this app up. If you'd rather back up just the
  app data, copy `~/basement-theater/data/db.json` off the VM periodically
  (e.g. with `scp` or a cron job) instead of snapshotting the whole disk.

### 5. Updating later

```bash
cd ~/basement-theater
git pull                      # or re-copy updated files with scp
docker compose up -d --build  # rebuilds and restarts with the new code
```

Your data in `./data/db.json` is untouched by this — it lives outside the
container image.

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
