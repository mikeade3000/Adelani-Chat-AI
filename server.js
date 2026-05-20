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
const ADMIN_SECRET = process.env.ADMIN_SECRET   || "adelani-admin-2024";
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || "adelani2024";
const OR_API       = "https://openrouter.ai/api/v1/chat/completions";
const CHAT_MODEL   = "meta-llama/llama-3.1-8b-instruct"; // text model
const VISION_MODELS = [
  "qwen/qwen-2-vl-7b-instruct:free",          // Qwen VL — free, reliable vision
  "google/gemini-2.0-flash-exp:free",          // Gemini — free, excellent vision
  "meta-llama/llama-3.2-90b-vision-instruct:free", // Llama 90B vision — free fallback
  "meta-llama/llama-3.2-11b-vision-instruct:free", // Llama 11B — last resort
];

// ── User store ────────────────────────────────────────────────────────────────
let users = {};
const loadUsers = () => {
  try { if (fs.existsSync(DATA_FILE)) users = JSON.parse(fs.readFileSync(DATA_FILE,"utf8")); }
  catch(e) { users = {}; }
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
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px;width:110px">Username</td><td style="padding:10px 0;color:#E8E0D5;font-weight:700">${u.username}</td></tr>
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px">Email</td><td style="padding:10px 0;color:#E8E0D5">${u.email||"Not provided"}</td></tr>
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
  version: "2.1.0",
  model: CHAT_MODEL,
  time: new Date().toISOString()
}));

// ── Register ──────────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password)  return res.status(400).json({ error: "Username and password required." });
  if (username === "admin")    return res.status(400).json({ error: "That username is reserved." });
  if (password.length < 6)     return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (users[username])         return res.status(409).json({ error: "Username already taken." });

  const token = crypto.randomBytes(32).toString("hex");
  const user  = {
    id: crypto.randomUUID(), username, email: email || "",
    password, role: "user", activated: false, banned: false,
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
  if (username === "admin" && password === ADMIN_PASS) {
    return res.json({
      id: "admin", username: "admin", role: "admin", activated: true,
      sessionToken: crypto.createHmac("sha256", ADMIN_SECRET).update("admin").digest("hex")
    });
  }
  const user = users[username];
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid username or password." });
  if (user.banned) return res.status(403).json({ error: "Account suspended. Contact admin." });

  const sessionToken = crypto.randomBytes(24).toString("hex");
  user.sessionToken  = sessionToken;
  user.sessionExpiry = Date.now() + 7 * 86400000;
  saveUsers();
  res.json({ id: user.id, username: user.username, email: user.email, role: user.role, activated: user.activated, sessionToken });
});

// ── Email activation ──────────────────────────────────────────────────────────
app.get("/api/activate", (req, res) => {
  const { token, u } = req.query;
  const user = users[decodeURIComponent(u || "")];
  if (!user || user.activationToken !== token)
    return res.status(400).send("<html><body style='background:#0A0A0B;color:#E8E0D5;text-align:center;padding:60px;font-family:sans-serif'><h2 style='color:#FF6B6B'>❌ Invalid or expired link.</h2></body></html>");
  user.activated = true;
  saveUsers();
  res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0A0A0B;color:#E8E0D5;font-family:sans-serif;text-align:center;padding:20px}
  .c{background:#141416;border:1px solid #222;border-radius:20px;padding:40px 28px;max-width:400px;width:100%}</style></head>
  <body><div class="c">
    <div style="font-size:52px;margin-bottom:18px">🎉</div>
    <h2 style="color:#3ECF8E;font-size:22px;margin:0 0 10px">Account Activated!</h2>
    <p style="color:#888"><strong style="color:#E8E0D5">${decodeURIComponent(u)}</strong> now has access to Adelani AI Chat.</p>
  </div></body></html>`);
});

// ── User status ───────────────────────────────────────────────────────────────
app.get("/api/status/:username", (req, res) => {
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ activated: user.activated, banned: user.banned });
});

// ── Chat ──────────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, systemPrompt, sessionToken, username, hasImage } = req.body;
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

  // Choose model — switch to vision-capable model when an image is attached
  const useVision = hasImage || messages.some(m => Array.isArray(m.content));
  const modelList = useVision ? VISION_MODELS : [CHAT_MODEL];

  let lastErr = "";
  for (const model of modelList) {
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
        body: JSON.stringify({ model, messages: orMsgs, max_tokens: 1500, temperature: 0.7 })
      });

      const data = await r.json();
      if (data.error) {
        lastErr = data.error.message;
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
  if (req.query.secret !== ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });
  res.json(Object.values(users).map(u => ({
    id: u.id, username: u.username, email: u.email,
    activated: u.activated, banned: u.banned,
    createdAt: u.createdAt, msgCount: u.msgCount || 0
  })));
});

// ── Admin: actions ────────────────────────────────────────────────────────────
app.post("/api/admin/action", (req, res) => {
  const { secret, username, action } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (action === "delete") { delete users[username]; saveUsers(); return res.json({ success: true }); }
  const user = users[username];
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
  console.log(`   Site  : ${SITE_URL}\n`);
});
