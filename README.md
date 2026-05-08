# Genesis — AI-Powered HighLevel App Builder

## Live URLs
- **Frontend:** https://genesis-ghl.web.app
- **Functions base:** https://us-central1-genesis-ghl.cloudfunctions.net
- **Loom walkthrough:** [TO BE ADDED]

## HighLevel Setup
1. Go to developers.gohighlevel.com → your marketplace app
2. Set OAuth Redirect URI to: `https://rishabh-genesis.web.app/connect/done`
3. Copy Client ID → `VITE_HL_CLIENT_ID` and `HL_CLIENT_ID` in env files
4. Copy Client Secret → `HL_CLIENT_SECRET` in functions/.env
5. Create a sandbox sub-account from your developer dashboard for testing

## Local Setup
```bash
# 1. Clone repo
git clone https://github.com/YOUR_USERNAME/Genesis-go-highlevel
cd Genesis-go-highlevel

# 2. Fill env vars
cp .env.example functions/.env
cp .env.example frontend/.env
# Edit both files with real values

# 3. Install dependencies
cd functions && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Start emulators
firebase emulators:start

# 5. In a separate terminal
cd frontend && npm run dev
```
Frontend runs at http://localhost:5173
Functions run at http://localhost:5001

## Function URLs (Production)
- oauthCallback: https://oauthcallback-ag27fjkxyq-uc.a.run.app
- hlProxy: https://hlproxy-ag27fjkxyq-uc.a.run.app
- projectsApi: https://projectsapi-ag27fjkxyq-uc.a.run.app
- snapshotsApi: https://snapshotsapi-ag27fjkxyq-uc.a.run.app
- generateApp: https://generateapp-ag27fjkxyq-uc.a.run.app

## Architecture Decisions
1. **SSE over WebSockets** — unidirectional stream matches LLM token output perfectly; stateless Cloud Functions don't support persistent WebSocket connections
2. **@gohighlevel/api-client SDK with FirestoreSessionStorage** — replaces ~80 lines of manual token fetch/refresh; SDK handles 401 auto-retry and token rotation
3. **HL token proxy pattern** — raw OAuth token never reaches the browser; preview iframe calls our Cloud Function which injects the token server-side
4. **AES-256-GCM for token encryption** — authenticated encryption detects tampering; key stored in functions/.env (Firebase Secret Manager recommended for production)
5. **Firestore transaction for generation lock** — atomic compare-and-set prevents two concurrent prompts from corrupting the same project files
6. **XML file tags in LLM output** — deterministic regex parse; resilient to surrounding prose; malformed output caught without crashing the function
7. **Append-only snapshots subcollection** — version history is immutable; restore overwrites project files, never mutates snapshots
8. **Merged file updates for iterative refinement** — second prompt only replaces files the LLM outputs; unchanged files preserved automatically
9. **window.__HL_CONFIG__ injection at preview render** — generated app works without hard-coded URLs; token force-refreshed on each preview build
10. **Multi-site Firebase Hosting** — OAuth callback routed through rishabh-genesis.web.app to avoid HL validator rejecting URLs containing "ghl"

## What I Would Improve
1. **Generation cancellation** — AbortController on LLM stream + client-side cancel signal over a separate endpoint
2. **Monaco diff view** — createDiffEditor to show exactly what changed per generation
3. **Queue-based architecture** — Cloud Tasks for generation requests; decouple UX from LLM latency; natural retry on LLM failure
4. **Per-user rate limiting** — Firestore counters tracking requests per minute; return 429 before hitting provider limits
5. **HighLevel webhook support** — subscribe to HL contact/conversation webhooks; push updates to preview via Firestore realtime listener

## Deployment Notes
- Firebase project: genesis-ghl (Blaze plan required for Cloud Functions)
- Region: us-central1 for all services
- Two hosting sites: genesis-ghl (main app) + rishabh-genesis (OAuth callback)
- LLM: DeepSeek-V4-Flash via Requesty gateway (openai-compatible SDK)
- Secrets stored in functions/.env locally
- Deploy command: `firebase deploy`

## Environment Variables
See `.env.example` for all required variables.
Key variables:
- `REQUESTY_API_KEY` — from app.requesty.ai
- `HL_CLIENT_ID` / `HL_CLIENT_SECRET` — from developers.gohighlevel.com
- `ENCRYPTION_KEY` — 32-char random hex string
- `VITE_FIREBASE_*` — from Firebase Console → Project Settings
