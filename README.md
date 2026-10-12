
## Login & roles (PIN auth)

Everyone signs in with **phone number + PIN**. PINs are stored only as scrypt hashes; sessions are
HMAC-signed `HttpOnly; SameSite=Strict` cookies (12 h, `Secure` in production). 5 wrong PINs lock the
phone number (and the client IP) for 15 minutes. Resetting a PIN revokes that person's existing sessions.

| Role | Access |
|---|---|
| super_owner | everything, **the only role that can set/reset PINs** (key icon in header), reset seed, hard delete |
| owner | all branches and data; cannot manage PINs |
| branch_manager | staff features scoped to assigned branch(es); no global config (AI keys, branches, SMS, DLT) |
| trainer | own branch's members, check-in, onboarding, payments/renewals for own-branch members, AI studio, own payroll only |
| member | own pass, payments, measurements, freeze request, announcements, AI coach |

Every `/api` route is default-deny and enforced server-side (`src/server/auth.ts`).

### Dev PINs (development only — never used in production)

Seeded automatically when `NODE_ENV` is not `production` (or `PULSE_SEED_DEV_PINS=1`):

| Who | Phone | PIN |
|---|---|---|
| Bipin Amrutha (super owner) | 9876543210 | 1111 |
| Bipin Amrutha (owner) | 9876543210 | 2222 |
| Branch manager (RR Nagar) | 9822334455 | 3333 |
| Trainers (e.g. Vishal, Nagarabhavi) | 9812345671 | 4444 (all trainers) |
| Any seeded member (e.g. Rhea Sen) | 9876001122 | 5555 (all members) |

### Production

Required env: `SESSION_SECRET` (>= 32 random chars; the server refuses to start without it), `SECRETS_KEY` (32 bytes hex; encrypts stored MSG91 keys with AES-256-GCM) and
`SUPER_OWNER_PIN` (bootstraps the super owner's PIN on first boot; then set everyone else's PIN in the app).
Optional: `PULSE_BASIC_AUTH`, `WHATSAPP_WEBHOOK_SECRET` (required for the WhatsApp webhook to accept calls),
`TRUST_PROXY=1` behind a reverse proxy.

```bash
npm ci && npm run build
SESSION_SECRET=$(openssl rand -hex 32) SUPER_OWNER_PIN=<pin> npm start   # binds 127.0.0.1:3000
npm test        # vitest: API, authz, persistence, validation
```
Docker: `docker build -t pulse . && docker run -p 3000:3000 -v pulse-data:/data -e SESSION_SECRET=... -e SUPER_OWNER_PIN=... pulse`

## Banner Studio (super owner + owner only)

Header → **Banners**. Make shareable posters for marathons, games, events, offers, ads and festival wishes
(Diwali, Ugadi, Sankranti, Ganesh Chaturthi, Dasara, Kannada Rajyotsava, Christmas, New Year, Holi).
Copy comes from AI (Gemini, then local FreeLLMAPI) with an offline English + Kannada template fallback, and you can edit it.
Banners are drawn in the browser on a canvas at 1080×1920 (story) or 1080×1080 (post) with Pulse branding and branch phone numbers.
You can download a PNG, share it (Web Share API, or wa.me text as a fallback), and save it to history on the server.
Members and staff only see active offers and events for their own branch (Member app → Notice). Only owners can create or edit banners;
the server enforces this, so branch managers, trainers and members get 403.

## Storage

Data lives in SQLite (`DATA_DIR/pulse.db`, built-in `node:sqlite`, WAL mode, file mode 0600) and the schema is set up by numbered
migrations (`src/server/sqliteStore.ts`). On first boot an existing legacy `pulse-db.json` is imported automatically and
renamed to `pulse-db.json.imported-<ts>`. Writes are batched about every 500 ms and flushed on shutdown, and only collections that changed are rewritten.
`/healthz` returns 503 if the database can't be reached. `STORAGE=json` switches back to the old JSON file store.
Back up by copying `pulse.db*` while the app is stopped, or with `sqlite3 pulse.db ".backup out.db"`.

## Container (verified with Podman 5.4)

```bash
podman build --format docker -t pulse .        # or: docker build -t pulse .
podman run -d --name pulse -p 3000:3000 -v pulse-data:/data \
  -e SESSION_SECRET=$(openssl rand -hex 32) -e SECRETS_KEY=$(openssl rand -hex 32) -e SUPER_OWNER_PIN=<pin> pulse
curl http://127.0.0.1:3000/healthz             # {"status":"ok","db":"ok",...}
```
The image runs as the non-root `node` user, data goes in the `/data` volume, and the `HEALTHCHECK` polls `/healthz` (Podman needs `--format docker` for HEALTHCHECK).
Keep `SESSION_SECRET` and `SECRETS_KEY` the same across restarts: changing `SECRETS_KEY` makes stored MSG91 keys unreadable, and changing `SESSION_SECRET` logs everyone out.

## Using it from a phone (LAN or hosted)

- The server listens on `127.0.0.1` by default. To reach it from phones on the gym Wi-Fi, set `HOST=0.0.0.0` (the container does this already)
  and open `http://<server-LAN-IP>:3000`.
- **Use HTTPS for real use.** Over plain `http://` on a LAN IP, browsers will not register the service worker (no offline mode or install),
  camera access (QR check-in) is blocked, and the production session cookie is `Secure`, so login won't stick.
  Put Caddy or nginx in front with a certificate (e.g. `caddy reverse-proxy --from pulse.example.in --to 127.0.0.1:3000`)
  and set `TRUST_PROXY=1`. Only for a short LAN trial over HTTP can you set `COOKIE_INSECURE=1` (not for production).
- Without HTTPS the **Desk → Check-in** camera shows "The camera only works over HTTPS"; phone-number check-in still works.
  Members' QR passes still display over HTTP (verified from the LAN IP in Playwright).

## Front desk (Desk button: owners, managers, trainers)

- **QR check-in.** Every member's Digital Pass shows a signed QR (HMAC, valid 24 h, refreshed automatically and cached for
  offline display). Staff tap **Desk → Start camera** and point it at the member's phone, or type the member's phone number.
  The server verifies the signature and branch scope, blocks repeat check-ins within 3 h, and refuses expired or inactive
  memberships unless staff tap **Allow one-time entry** (recorded as an override). It also shows warnings for dues and memberships
  ending soon. Members can't check themselves in. Note that a screenshot of a pass works until it expires; the 3-hour dedupe limits sharing.
- **Dues** (owners/managers). This tab lists members with a balance. **WhatsApp** opens a prefilled `wa.me` message (free, no API key)
  and logs the reminder with a 3-day cooldown. Members whose phone number is invalid are listed separately rather than dropped. You can export a CSV.
- **PT sessions.** Owners and managers sell PT packages (sessions, price, optional expiry, trainer from the member's branch).
  Trainers log sessions (no double-logging within 30 min). Managers and owners can undo the last session, and members see
  the sessions they have left on their pass. You can export a CSV.
- All CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`).

## Open it on a real phone (free, nothing deployed)

The QR camera needs HTTPS. The built-in LAN HTTPS mode uses a self-signed certificate and works only on your gym or home Wi-Fi.

1. On the computer that will run Pulse (same Wi-Fi as the phone), with Node 22+ and `openssl`:
   ```bash
   npm ci && npm run build
   cp .env.example .env      # set SESSION_SECRET (32+ chars), SECRETS_KEY (openssl rand -hex 32), SUPER_OWNER_PIN
   npm run cert:lan          # creates certs/lan.crt + certs/lan.key for this machine's LAN IPs and prints the phone URL
   HTTPS_CERT=certs/lan.crt HTTPS_KEY=certs/lan.key HOST=0.0.0.0 PORT=3443 npm start
   ```
   For a quick demo with sample data and the dev PINs, also set `PULSE_SEED_DEV_PINS=1`. Never use dev PINs for real members.
2. Allow incoming TCP port 3443 if a firewall asks. On Linux: `sudo ufw allow 3443/tcp`.
3. On the phone, open the printed `https://<computer-LAN-IP>:3443`. The browser warns that the certificate is not trusted. Choose
   **Advanced → Proceed** (Chrome) or **Show details → visit this website** (Safari). The warning is expected because the certificate is self-signed.
4. Sign in. Staff tap **Desk → Start camera → Allow**. A member opens their pass on another phone, and scanning it checks them in.
5. Limits of self-signed mode: there is no install or offline mode (browsers refuse service workers on untrusted certificates), and every phone sees the warning once.
   To remove the warning on your own phones, install `certs/lan.crt` as a trusted certificate (Android: Settings → Security → Encryption &
   credentials → Install a certificate → CA certificate; iOS: AirDrop it, install the profile, then Settings → General → About → Certificate Trust Settings).
   For real use, put Pulse behind a proper domain with a free Let's Encrypt certificate (Caddy).
6. A public tunnel (e.g. Cloudflare Tunnel or ngrok) gives a trusted HTTPS URL without installing anything on the phone, but it
   exposes the app to the internet. Only do that if the owner agrees, with real PINs set and dev PINs off.

## Business tools (owners & branch managers)

Open **Business** in the top bar.

- **Reports**: monthly revenue by branch, plan and payment method; expenses and net; daily check-ins; members whose plan ended this month and did not renew (churn). Use **Export CSV**, or **Print / Save PDF** (the browser print dialog, no paid service).
- **Expenses**: record rent, salaries, electricity and other costs per branch. Managers see only their own branch. Only owners can delete an expense.
- **Renewals**: members can ask to renew from their app. There is no online payment: the desk collects the money, records it with **Renew**, then presses **Confirm**. Trainers see this queue under **Desk → Renewals**.
- **Privacy (DPDP Act, 2023)**:
  - Members accept a data notice on first login. They can **Download my data** or **Request data deletion** from their app.
  - Only an owner can approve a deletion request. Approving it anonymises the member: name, phone, measurements, PIN and consent are removed. Payment records are kept without identity.
- **Backup (super owner only)**:
  - **Download backup** gives one SQLite file.
  - **Restore** checks the uploaded file first: the SQLite header, an integrity check, the required tables, and that its schema version is not newer than the app's. Nothing changes until you type `RESTORE`. A pre-restore copy is kept in `DATA_DIR/backups/`.
  - Backups contain member phone numbers. Store them privately.
