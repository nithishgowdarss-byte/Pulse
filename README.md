
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

Required env: `SESSION_SECRET` (>= 32 random chars; the server refuses to start without it) and
`SUPER_OWNER_PIN` (bootstraps the super owner's PIN on first boot; then set everyone else's PIN in the app).
Optional: `PULSE_BASIC_AUTH`, `WHATSAPP_WEBHOOK_SECRET` (required for the WhatsApp webhook to accept calls),
`TRUST_PROXY=1` behind a reverse proxy.

```bash
npm ci && npm run build
SESSION_SECRET=$(openssl rand -hex 32) SUPER_OWNER_PIN=<pin> npm start   # binds 127.0.0.1:3000
npm test        # vitest: API, authz, persistence, validation
```
Docker: `docker build -t pulse . && docker run -p 3000:3000 -v pulse-data:/data -e SESSION_SECRET=... -e SUPER_OWNER_PIN=... pulse`
