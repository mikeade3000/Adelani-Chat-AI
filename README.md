# Adelani AI Chat

A multi-agent AI chat app (Asha, Scholar, Bizna, Dawa, Ubuntu, Nexus, Grace) plus an
Office add-in for Word, Excel and PowerPoint.

| Part | Where it runs | Cost |
|---|---|---|
| Chat app (`index.html`) and Office add-in (`taskpane.html`) | GitHub Pages | Free |
| Backend (`worker/`) | Cloudflare Workers | Free plan |
| User accounts | Cloudflare D1 database | Free plan |
| Activation emails (optional) | Resend | Free plan |
| AI answers | OpenRouter | **Paid per use** (pay-as-you-go credits) |

The old Render backend (`server.js`, `render.yaml`) is kept for reference only.

---

## Getting it running — step by step

You need: a GitHub account (you have one), a free Cloudflare account, and your
OpenRouter API key. Nothing has to be installed on your computer.

> Cloudflare sometimes renames menu items. If a button below isn't exactly where
> described, look for the closest match. The idea stays the same.

### Step 1 — Create a free Cloudflare account
1. Go to <https://dash.cloudflare.com/sign-up> and sign up (no card needed).
2. Confirm your email.

### Step 2 — Create the user database (D1)
1. In the Cloudflare dashboard, open **Storage & Databases → D1 SQL Database**.
2. Click **Create database**, name it `adelani-users`, and click **Create**.
3. Open the new database, go to the **Console** tab, paste the whole contents of
   [`worker/schema.sql`](worker/schema.sql), and click **Execute**.
   You should see a success message, and a `users` table now exists.

### Step 3 — Create the Worker (the backend)
1. Open **Compute (Workers) → Workers & Pages → Create → Create Worker**
   (choose the "Hello World" starter if asked).
2. Name it `adelani-ai-backend` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste the whole contents
   of [`worker/src/index.js`](worker/src/index.js), and click **Deploy**.
4. Copy your Worker's address shown at the top. It looks like
   `https://adelani-ai-backend.YOUR-NAME.workers.dev`. You need it in Step 6.

### Step 4 — Connect the database and settings to the Worker
Open your Worker, then **Settings**:

1. **Bindings → Add → D1 database**
   - Variable name: `DB` (exactly, in capitals)
   - Database: `adelani-users`
2. **Variables and Secrets → Add**. Add each of these. Use type **Secret** for the
   first two:

   | Name | Type | Value |
   |---|---|---|
   | `OPENROUTER_API_KEY` | Secret | your OpenRouter key (`sk-or-...`) |
   | `ADMIN_PASSWORD` | Secret | a **new** strong password (not the old one) |
   | `ADMIN_EMAIL` | Text | `mikeade3000@yahoo.com` |
   | `FRONTEND_URL` | Text | `https://mikeade3000.github.io/Adelani-Chat-AI` |

3. **Runtime → Compatibility flags → Add** `nodejs_compat`.
   (Only needed for users imported from the old server. It's harmless otherwise.)
4. Click **Deploy** if the dashboard asks you to.

**Check:** open your Worker address in a browser. You should see something like
`{"status":"🟢 Adelani AI Backend (Cloudflare)","version":"3.0.0", ...}`.

### Step 5 — (Optional) Activation emails with Resend
When someone registers, you get an email with an **Activate** button. You can skip
this and activate users from the Admin Panel (⚙ button after logging in as `admin`).

1. Sign up at <https://resend.com> **using `mikeade3000@yahoo.com`**. Without your
   own domain, Resend only delivers to the email you signed up with, and that's
   exactly where these emails go.
2. Create an API key (**API Keys → Create**).
3. In your Worker: **Settings → Variables and Secrets → Add** `RESEND_API_KEY`
   (type **Secret**) with that key.

### Step 6 — Point the app at the new backend
In this GitHub repository, edit these two files in the browser (pencil icon ✏️):

1. **`config.js`**: replace the address with your Worker address from Step 3:
   ```js
   window.ADELANI_BACKEND = "https://adelani-ai-backend.YOUR-NAME.workers.dev";
   ```
   No slash at the end.
2. **`manifest.xml`** (Office add-in only): replace
   `https://adelani-ai-backend.YOUR-SUBDOMAIN.workers.dev` with the same address.

Commit the changes to the branch GitHub Pages publishes from (usually `main`).

### Step 7 — Make sure GitHub Pages is on
Repository **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`,
folder `/ (root)`. Your app is at <https://mikeade3000.github.io/Adelani-Chat-AI/>.
Changes take about a minute to go live.

### Step 8 — Test it
1. Open the app, choose **Explore as Guest**, and ask something. The answer should
   start appearing within a second or two and fill in word by word.
2. Log in as `admin` with your new `ADMIN_PASSWORD` and open the ⚙ Admin Panel.
3. Register a test user, activate it (email link or Admin Panel), and log in.

### Step 9 — (Optional) Bring back users from Render
Only if you still have the old `users.json` file:
1. Install Node.js from <https://nodejs.org>, then in this repo's `worker` folder run
   `node scripts/import-users.js path/to/users.json`. This writes `import.sql`.
2. Open the D1 database **Console**, paste the contents of `import.sql`, and **Execute**.
   Old passwords keep working and are re-secured the next time each person logs in.

---

## Why it's fast now

- **No sleeping server.** Cloudflare Workers answer instantly. Render's free plan
  took 30–60 s to wake up.
- **Answers stream in** word by word, so you see the reply as soon as the AI starts
  writing instead of waiting for the whole thing.
- **Fastest provider first.** Each request asks OpenRouter for the provider with the
  lowest latency for that model.
- **Smaller requests.** Only the last 12 messages are sent (old images become a short
  note), so the AI has less to read and starts answering sooner.
- **Quick page loads.** The app is compiled once and remembered by the browser. The
  3 MB compiler is only downloaded again after you change `index.html`.

To make answers faster still, keep OpenRouter credit topped up (free models are
slower and rate-limited) and keep the quick `meta-llama/llama-3.1-8b-instruct`
model first in the chat list.

## Changing AI models
Defaults are at the top of `worker/src/index.js` (`DEFAULT_TIERS`). To change them
without editing code, add a Worker variable with a comma-separated list of OpenRouter
model IDs. They're tried in order:

| Variable | Used for |
|---|---|
| `CHAT_MODELS` | normal chat |
| `HEAVY_MODELS` | full Scholar review articles |
| `GRACE_MODELS` | Grace's slides and graphics |
| `VISION_MODELS` | messages with images |

## Free plan limits (approximate)
- Workers: about 100,000 requests a day.
- D1: 5 GB storage, about 5 million rows read and 100,000 written per day. If a
  daily limit is reached, the database pauses until midnight UTC. Nothing is billed
  and no data is lost.
- Resend: 100 emails a day, 3,000 a month.

## For developers
```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create adelani-users          # paste the database_id into wrangler.toml
npm run db:init                               # create the users table
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```
For local testing, put secrets in `worker/.dev.vars` and run `npm run dev`.
