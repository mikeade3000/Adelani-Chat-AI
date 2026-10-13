const express    = require("express");
const cors       = require("cors");
const nodemailer = require("nodemailer");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");

const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json({ limit: "10mb" }));

// ── Config ────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL  = "mikeade3000@yahoo.com";
const DATA_FILE    = path.join(__dirname, "users.json");
const BACKEND_URL  = process.env.BACKEND_URL   || "http://localhost:3001";
const SITE_URL     = process.env.FRONTEND_URL   || "https://mikeade3000.github.io/Adelani-Chat-AI";
// Admin credentials come ONLY from the environment (set them in the Render dashboard).
// No defaults: if ADMIN_PASSWORD is unset, admin login is disabled.
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET   || ""; // optional — for scripted access to /api/admin/*
const ADMIN_SESSION_MS = 12 * 3600000;                 // admin sessions last 12 hours
// Admin session tokens are "<expiry>.<signature>", signed with a key derived from the
// admin password — they survive server restarts and stop working if the password changes.
const ADMIN_KEY = crypto.createHash("sha256").update("adelani-admin:" + ADMIN_PASS + ":" + ADMIN_SECRET).digest();
const signAdmin = exp => crypto.createHmac("sha256", ADMIN_KEY).update(String(exp)).digest("hex");
const OR_API       = "https://openrouter.ai/api/v1/chat/completions";

// ── Models ────────────────────────────────────────────────────────────────────
// Each tier is a fallback list: if a model errors or is retired by its provider,
// the next one is tried. Override any tier with a comma-separated env var.
const modelList = (env, defaults) =>
  (process.env[env] ? process.env[env].split(",").map(m => m.trim()).filter(Boolean) : defaults);
const MODEL_TIERS = {
  chat:  modelList("CHAT_MODELS",  [                    // default text model (cheap/fast)
    "meta-llama/llama-3.1-8b-instruct",
    "google/gemini-2.5-flash-lite",
    "openai/gpt-4o-mini",
  ]),
  heavy: modelList("HEAVY_MODELS", [                    // registered-user Scholar articles
    "meta-llama/llama-3.3-70b-instruct",
    "meta-llama/llama-3.1-70b-instruct",
    "deepseek/deepseek-chat",
  ]),
  grace: modelList("GRACE_MODELS", [                    // Grace (slides & graphics)
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.3-70b-instruct",
  ]),
  vision: modelList("VISION_MODELS", [                  // any message with an image
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "openai/gpt-4o-mini",
    "anthropic/claude-haiku-4.5",
  ]),
};
// Older frontends send exact model IDs — map them onto the matching tier.
const LEGACY_MODEL_IDS = {
  "meta-llama/llama-3.1-8b-instruct":  "chat",
  "meta-llama/llama-3.1-70b-instruct": "heavy",
  "deepseek/deepseek-chat":            "grace",
};
const CHAT_MODEL = MODEL_TIERS.chat[0];

// ── Helpers ───────────────────────────────────────────────────────────────────
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

// Passwords are stored as "scrypt$<salt>$<hash>". Accounts created before this
// change still hold plaintext; they are upgraded on their next successful login.
const hashPassword = pw => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
};
const verifyPassword = (pw, stored) => {
  if (typeof stored !== "string") return false;
  if (!stored.startsWith("scrypt$")) return safeEqual(pw, stored); // legacy plaintext
  const [, salt, hash] = stored.split("$");
  return safeEqual(crypto.scryptSync(pw, salt, 64).toString("hex"), hash);
};

const isAdminRequest = req => {
  const auth  = req.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [exp, sig] = token.split(".");
  if (ADMIN_PASS && sig && Number(exp) > Date.now() && safeEqual(sig, signAdmin(exp))) return true;
  const secret = req.query.secret || req.body?.secret;
  return !!(ADMIN_SECRET && secret && safeEqual(secret, ADMIN_SECRET));
};

// ── User store ────────────────────────────────────────────────────────────────
// Null-prototype object so usernames like "__proto__" are plain keys, not prototype setters.
let users = Object.create(null);
const loadUsers = () => {
  try { if (fs.existsSync(DATA_FILE)) users = Object.assign(Object.create(null), JSON.parse(fs.readFileSync(DATA_FILE,"utf8"))); }
  catch(e) { users = Object.create(null); }
};
const saveUsers = () => {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2)); } catch(e){}
};
loadUsers();

// ── Email ─────────────────────────────────────────────────────────────────────
const sendEmail = async (subject, html) => {
  if (!process.env.GMAIL_USER) { console.log("📧 Email skipped — no GMAIL_USER set"); return; }
  try {
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await t.sendMail({ from: `"Adelani AI" <${process.env.GMAIL_USER}>`, to: ADMIN_EMAIL, subject, html });
    console.log("📧 Sent:", subject);
  } catch(e) { console.error("📧 Failed:", e.message); }
};

const regEmailHtml = (u, url) => `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#0A0A0B;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#F0B429,#E05C2A);border-radius:16px 16px 0 0;padding:28px;text-align:center">
    <div style="font-size:28px;font-weight:900;color:#0A0A0B">Adelani AI Chat</div>
    <div style="font-size:11px;letter-spacing:3px;color:#0A0A0B;opacity:0.75;margin-top:4px">NEW USER REGISTRATION</div>
  </div>
  <div style="background:#141416;border:1px solid #222;border-top:none;border-radius:0 0 16px 16px;padding:28px">
    <h2 style="color:#F0B429;margin:0 0 20px;font-size:18px">New user registered ✨</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px;width:110px">Username</td><td style="padding:10px 0;color:#E8E0D5;font-weight:700">${escapeHtml(u.username)}</td></tr>
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px">Email</td><td style="padding:10px 0;color:#E8E0D5">${escapeHtml(u.email||"Not provided")}</td></tr>
      <tr><td style="padding:10px 0;color:#666;font-size:13px">Date</td><td style="padding:10px 0;color:#888;font-size:13px">${new Date(u.createdAt).toUTCString()}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0">
      <a href="${url}" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#F0B429,#E05C2A);color:#0A0A0B;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px">✅ Activate This User</a>
    </div>
  </div>
</div></body></html>`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  status: "🟢 Adelani AI Backend",
  version: "2.2.0",
  model: CHAT_MODEL,
  time: new Date().toISOString()
}));

// ── Register ──────────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password)
    return res.status(400).json({ error: "Username and password required." });
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username))
    return res.status(400).json({ error: "Username must be 3–32 letters, numbers, dots, dashes or underscores." });
  if (["admin","__proto__","constructor","prototype"].includes(username)) return res.status(400).json({ error: "That username is reserved." });
  if (password.length < 6)     return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (Object.prototype.hasOwnProperty.call(users, username)) return res.status(409).json({ error: "Username already taken." });

  const token = crypto.randomBytes(32).toString("hex");
  const user  = {
    id: crypto.randomUUID(), username, email: typeof email === "string" ? email.slice(0, 200) : "",
    password: hashPassword(password), role: "user", activated: false, banned: false,
    activationToken: token, createdAt: new Date().toISOString(), msgCount: 0
  };
  users[username] = user;
  saveUsers();

  const activationUrl = `${BACKEND_URL}/api/activate?token=${token}&u=${encodeURIComponent(username)}`;
  await sendEmail(`🆕 New Registration: ${username}`, regEmailHtml(user, activationUrl));
  res.json({ success: true, message: "Registration submitted! You'll be notified once activated." });
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "Username and password required." });
  if (username === "admin") {
    if (!ADMIN_PASS || !safeEqual(password, ADMIN_PASS))
      return res.status(401).json({ error: "Invalid username or password." });
    const exp = Date.now() + ADMIN_SESSION_MS;
    const sessionToken = `${exp}.${signAdmin(exp)}`;
    return res.json({ id: "admin", username: "admin", role: "admin", activated: true, sessionToken });
  }
  const user = Object.prototype.hasOwnProperty.call(users, username) ? users[username] : null;
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: "Invalid username or password." });
  if (user.banned) return res.status(403).json({ error: "Account suspended. Contact admin." });
  if (!user.password.startsWith("scrypt$")) user.password = hashPassword(password); // upgrade legacy plaintext

  const sessionToken = crypto.randomBytes(24).toString("hex");
  user.sessionToken  = sessionToken;
  user.sessionExpiry = Date.now() + 7 * 86400000;
  saveUsers();
  res.json({ id: user.id, username: user.username, email: user.email, role: user.role, activated: user.activated, sessionToken });
});

// ── Email activation ──────────────────────────────────────────────────────────
app.get("/api/activate", (req, res) => {
  const { token, u } = req.query;
  const name = String(u || "");
  const user = Object.prototype.hasOwnProperty.call(users, name) ? users[name] : null;
  if (!user || !user.activationToken || !token || !safeEqual(user.activationToken, token))
    return res.status(400).send("<html><body style='background:#0A0A0B;color:#E8E0D5;text-align:center;padding:60px;font-family:sans-serif'><h2 style='color:#FF6B6B'>❌ Invalid or expired link.</h2></body></html>");
  user.activated = true;
  delete user.activationToken; // one-time link
  saveUsers();
  res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0A0A0B;color:#E8E0D5;font-family:sans-serif;text-align:center;padding:20px}
  .c{background:#141416;border:1px solid #222;border-radius:20px;padding:40px 28px;max-width:400px;width:100%}</style></head>
  <body><div class="c">
    <div style="font-size:52px;margin-bottom:18px">🎉</div>
    <h2 style="color:#3ECF8E;font-size:22px;margin:0 0 10px">Account Activated!</h2>
    <p style="color:#888"><strong style="color:#E8E0D5">${escapeHtml(name)}</strong> now has access to Adelani AI Chat.</p>
  </div></body></html>`);
});

// ── User status ───────────────────────────────────────────────────────────────
app.get("/api/status/:username", (req, res) => {
  const user = Object.prototype.hasOwnProperty.call(users, req.params.username) ? users[req.params.username] : null;
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ activated: user.activated, banned: user.banned });
});

// ── Chat ──────────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, systemPrompt, sessionToken, username, hasImage, maxTokens, model } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "No messages provided." });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server not configured — OPENROUTER_API_KEY missing." });

  // Track message count for logged-in users
  if (username && username !== "admin" && sessionToken) {
    const user = users[username];
    if (user && user.sessionToken === sessionToken && user.sessionExpiry > Date.now()) {
      user.msgCount = (user.msgCount || 0) + 1;
      saveUsers();
    }
  }

  const orMsgs = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

  // Choose model tier.
  //  • Image present → vision tier.
  //  • `model` names a tier ("heavy", "grace") or a legacy model ID → that tier,
  //    falling back to the chat tier if every model in it errors.
  //  • Otherwise → chat tier.
  const useVision = hasImage || messages.some(m => Array.isArray(m.content));
  const tier = typeof model === "string" ? (LEGACY_MODEL_IDS[model] || model) : "chat";
  const textTier = (tier === "heavy" || tier === "grace") ? tier : "chat";
  const models = useVision
    ? MODEL_TIERS.vision
    : [...new Set([...MODEL_TIERS[textTier], ...MODEL_TIERS.chat])];

  // Honor a per-request token budget (e.g. heavier output for registered users), clamped for safety.
  const tokenBudget = Math.min(Math.max(parseInt(maxTokens) || 1500, 256), 4000);

  let lastErr = "";
  for (const model of models) {
    try {
      console.log(`→ Using model: ${model}${useVision?" [vision]":""}`);
      const r = await fetch(OR_API, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type":  "application/json",
          "HTTP-Referer":  SITE_URL,
          "X-Title":       "Adelani AI Chat"
        },
        body: JSON.stringify({ model, messages: orMsgs, max_tokens: tokenBudget, temperature: 0.7 })
      });

      const data = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }));
      if (data.error || !r.ok) {
        lastErr = data.error?.message || `HTTP ${r.status}`;
        console.warn(`✗ ${model}:`, lastErr);
        continue; // try next model
      }
      const reply = data.choices?.[0]?.message?.content || "No response generated.";
      console.log(`✓ Reply from ${model}`);
      return res.json({ reply, model });

    } catch(e) {
      lastErr = e.message;
      console.warn(`✗ ${model} (network):`, lastErr);
    }
  }

  // All models failed
  res.status(502).json({ error: lastErr || "All models failed." });
});

// ── Admin: list users ─────────────────────────────────────────────────────────
app.get("/api/admin/users", (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: "Unauthorized" });
  res.json(Object.values(users).map(u => ({
    id: u.id, username: u.username, email: u.email,
    activated: u.activated, banned: u.banned,
    createdAt: u.createdAt, msgCount: u.msgCount || 0
  })));
});

// ── Admin: actions ────────────────────────────────────────────────────────────
app.post("/api/admin/action", (req, res) => {
  const { username, action } = req.body;
  if (!isAdminRequest(req)) return res.status(403).json({ error: "Unauthorized" });
  const user = Object.prototype.hasOwnProperty.call(users, username) ? users[username] : null;
  if (action === "delete") { if (user) { delete users[username]; saveUsers(); } return res.json({ success: true }); }
  if (!user) return res.status(404).json({ error: "User not found" });
  if (action === "activate")   user.activated = true;
  if (action === "deactivate") user.activated = false;
  if (action === "ban")        user.banned    = true;
  if (action === "unban")      user.banned    = false;
  saveUsers();
  res.json({ success: true, user: { username: user.username, activated: user.activated, banned: user.banned } });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Adelani AI Backend`);
  console.log(`   Port  : ${PORT}`);
  console.log(`   Model : ${CHAT_MODEL}`);
  if (!ADMIN_PASS) console.warn("   ⚠️  ADMIN_PASSWORD not set — admin login is disabled.");
  console.log(`   Site  : ${SITE_URL}\n`);
});
