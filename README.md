# Unicorn Factory — Launchpad for AI Startups (MVP)

A pump.fun-style launchpad for AI/deep-tech projects. Founders submit projects, the community contributes test-crypto on a bonding curve, tokens are issued to backers, and successful raises appear in the Launch Zone. Includes a basic secondary market via user offers.

## Tech
- Server: Node + Express + TypeScript (in-memory data)
- Client: Vite + React + TypeScript

## Features in this MVP
- Founder submission (video, summary, resumes, plan)
- Bonding curve simulation (buy/sell; price scales with supply)
- Fundraising cap (100k) triggers Launch Zone
- Token issuance + holdings display
- Basic secondary market (create offers, fill offers)

---

## Local Development

Prereqs: Node 18+

1) Server
```
cd server
npm install
npm run build
npm run start
```
Visit http://localhost:4000 to see API index.

2) Client
```
cd client
npm install
npm run dev
```
Visit http://localhost:5173.

Configure API URL (optional): create client/.env with:
```
VITE_API_URL=http://localhost:4000
```

---

## Quick Demo Flow (2–3 minutes)
1. Submit a project (name, summary, plan). It appears in Dashboard.
2. Open the project → Contribute (test) to buy tokens on the curve; see supply/reserve update.
3. Holdings → see your token balances.
4. Project → Sell tokens, or create a Sell Offer; click “Buy 1” to fill an offer.
5. Keep buying to reach 100,000 reserve → project shows in Launch Zone.

---

## Deployment

### Server (Render)
- Create a new Web Service from the server folder
- Build Command: npm install && npm run build
- Start Command: npm run start
- Node version: 18+ (auto)
- Exposes: / : 4000

### Client (Netlify)
- Base directory: client
- Build command: npm run build
- Publish directory: client/dist
- Environment variable: VITE_API_URL → your Render server URL

Alternatively: Vercel for the client with the same build and env var.

App link :- https://unicorn-factory.pages.dev/
---

## Notes / Next steps
- This MVP is off-chain for speed. Next: connect wallets and deploy an on-chain bonding curve.
- Add persistence (Postgres) and auth.
- Richer secondary market (order book, matching, history).
