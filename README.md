# pons traction detector

This is a small Node.js indexer for pons launches on Robinhood Chain.

It follows the pons integration docs:

- indexes the factory `TokenLaunched` event
- registers each emitted pool
- indexes each pool's Uniswap V3 `Swap` events
- reads token metadata and social links directly from token contracts
- polls `graduationStatus(token)` from the pons factory
- indexes ERC-20 `Transfer` events for holder counts, holder growth, and concentration checks
- derives buy/sell direction from pool token ordering
- computes a live traction score over a rolling five-minute window
- persists state locally in `data/state.json`

By default the first run scans the latest `20,000` blocks so it starts quickly.
Set `FULL_BACKFILL=true` to crawl from the documented factory start blocks.

## Features & Qualifications

- **Migration / Graduation Filter**: Option `REQUIRE_GRADUATED=true` to alert only on graduated/migrated tokens.
- **Market Cap Threshold**: `MIN_MARKET_CAP_USD=50000` (default >$50k USD) to prevent low market cap rug tokens.
- **Recent Migration Momentum Surge**: Detects recently migrated tokens (`MAX_MIGRATION_AGE_HOURS=24`) accelerating post-migration via buy volume surges, buyer velocity, buy/sell ratio pressure, and market cap growth.
- **WhatsApp Alerts**: Sends initial alerts for newly migrated tokens + dedicated **🔥 MOMENTUM SURGE ALERTS 🔥** when momentum triggers. Supports Twilio, CallMeBot, or Webhooks.
- **Smart Escalation**: Sends follow-up alerts if a surging token gains an additional +50% MCap (`RENOTIFY_MCAP_GROWTH_PERCENT=50`).
- **State Deduplication**: Tracks notified tokens in `data/state.json` to prevent duplicate alerts.

## Run

```bash
npm start
```

For a single polling pass:

```bash
npm run once
```

Check code integrity:

```bash
npm run check
```

## Environment Variables (.env)

Key variables from `.env.example`:

- `MIN_MARKET_CAP_USD=50000`
- `REQUIRE_GRADUATED=true`
- `ETH_PRICE_USD=1800`
- `WHATSAPP_ENABLED=true`
- `WHATSAPP_PROVIDER=twilio` (options: `twilio` | `callmebot` | `webhook`)

### Twilio Setup (Recommended)
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886`
- `TO_WHATSAPP_NUMBER=whatsapp:+1234567890`

## 24/7 Free Hosting Alternatives

Here are the best **100% Free** hosting options to run your bot 24/7 continuously:

### 1. 🚀 Koyeb (Best Free Choice - 24/7 Continuous, No Sleep)
- **Free Tier Specs**: 512 MB RAM, 0.1 vCPU, runs 24/7 without sleeping!
- **Setup**:
  1. Create a free account at [koyeb.com](https://www.koyeb.com/).
  2. Create a **New App** -> Select **GitHub** -> Choose this repository.
  3. Select **Builder**: Dockerfile (or Node.js).
  4. Add your `.env` variables under **Environment Variables**.
  5. Click **Deploy**. Koyeb will build and run your bot continuously!

### 2. 🟢 Render.com (Free Web Service)
- **Free Tier Specs**: 512 MB RAM.
- **Setup**:
  1. Create an account at [render.com](https://render.com/).
  2. Click **New +** -> **Web Service** -> Connect GitHub repo.
  3. Uses the included `render.yaml` or build command `npm ci` and start command `npm start`.
  4. Set `PORT=10000` and add your WhatsApp `.env` credentials in Render environment settings.

### 3. 🪁 Fly.io (Free Allowance)
- **Free Tier Specs**: Up to 3 shared-cpu-1x VMs (256MB RAM) for free.
- **Setup**:
  1. Install Fly CLI: `flyctl`.
  2. Run `fly launch` in the project folder (uses included `Dockerfile`).
  3. Set secrets: `fly secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=...`.
  4. Run `fly deploy`.

### 4. ⚡ Zeabur (Free Developer Credits)
- **Setup**:
  1. Sign up at [zeabur.com](https://zeabur.com/).
  2. Click **Create Project** -> Connect GitHub -> Deploy repo.
  3. Add environment variables in Zeabur dashboard.

### 5. 🐧 Oracle Cloud Always Free VPS (100% Free Linux Server)
- **Specs**: Always Free ARM Ampere VM with up to 4 vCPUs and 24GB RAM.
- **Setup**:
  1. Create an Always Free instance on Oracle Cloud Console.
  2. SSH into your instance, install Node.js 20 (`nvm install 20`).
  3. Clone your repo, create `.env`, and run with PM2 (`npm install -g pm2 && pm2 start src/index.js --name robinhood-bot`).
  4. PM2 will automatically restart the bot if it crashes or server reboots!


