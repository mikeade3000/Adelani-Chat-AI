const express  = require("express");
const cors     = require("cors");
const nodemailer = require("nodemailer");
const crypto   = require("crypto");
const fs       = require("fs");
const path     = require("path");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json({ limit: "10mb" }));

// ── Config ────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL  = "mikeade3000@yahoo.com";
const DATA_FILE    = path.join(__dirname, "users.json");
const BACKEND_URL  = process.env.BACKEND_URL  || "http://localhost:3001";
const SITE_URL     = process.env.FRONTEND_URL  || "https://yourusername.github.io/adelani-ai-chat";
const ADMIN_SECRET = process.env.ADMIN_SECRET  || "adelani-admin-2024";
const ADMIN_PASS   = process.env.ADMIN_PASSWORD|| "adelani2024";
const OR_API       = "https://openrouter.ai/api/v1/chat/completions";

// ── Models ────────────────────────────────────────────────────────────────────
const FREE_MODELS = [
  "meta-llama/llama-3.2-3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "nvidia/llama-nemotron-embed-vl-1b-v2:free",
];
const PREMIUM_MODEL = "meta-llama/llama-3.1-8b-instruct";
let modelRound = 0;

// ── User store ────────────────────────────────────────────────────────────────
let users = {};
const loadUsers = () => {
  try { if (fs.existsSync(DATA_FILE)) users = JSON.parse(fs.readFileSync(DATA_FILE,"utf8")); }
  catch(e) { users = {}; }
};
const saveUsers = () => {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(users,null,2)); } catch(e){}
};
loadUsers();

// ── Email ─────────────────────────────────────────────────────────────────────
const mailer = () => nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
});

const sendEmail = async (subject, html) => {
  if (!process.env.GMAIL_USER) { console.log("📧 Email skipped (no GMAIL_USER configured)"); return; }
  try {
    await mailer().sendMail({ from:`"Adelani AI" <${process.env.GMAIL_USER}>`, to:ADMIN_EMAIL, subject, html });
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
    <h2 style="color:#F0B429;margin:0 0 20px;font-size:18px">A new user has registered ✨</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px;width:110px">Username</td><td style="padding:10px 0;color:#E8E0D5;font-weight:700">${u.username}</td></tr>
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px">Email</td><td style="padding:10px 0;color:#E8E0D5">${u.email||"Not provided"}</td></tr>
      <tr><td style="padding:10px 0;color:#666;font-size:13px">Date</td><td style="padding:10px 0;color:#888;font-size:13px">${new Date(u.createdAt).toUTCString()}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0">
      <a href="${url}" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#F0B429,#E05C2A);color:#0A0A0B;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px">✅ Activate This User</a>
    </div>
    <p style="color:#444;font-size:12px;text-align:center">Once activated, ${u.username} will have access to premium AI on Adelani AI Chat.</p>
  </div>
  <p style="color:#333;font-size:11px;text-align:center;margin-top:16px">Adelani AI Chat · <a href="${SITE_URL}" style="color:#F0B429">${SITE_URL}</a></p>
</div></body></html>`;

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status:"🟢 Adelani AI Backend", version:"2.0.0", time:new Date().toISOString() }));

// Register
app.post("/api/register", async (req,res) => {
  const { username, email, password } = req.body;
  if (!username||!password) return res.status(400).json({ error:"Username and password required." });
  if (username==="admin")   return res.status(400).json({ error:"That username is reserved." });
  if (password.length<6)    return res.status(400).json({ error:"Password must be 6+ characters." });
  if (users[username])      return res.status(409).json({ error:"Username already taken." });

  const token = crypto.randomBytes(32).toString("hex");
  const user = { id:crypto.randomUUID(), username, email:email||"", password, role:"user", activated:false, banned:false, activationToken:token, createdAt:new Date().toISOString(), msgCount:0 };
  users[username] = user;
  saveUsers();

  const activationUrl = `${BACKEND_URL}/api/activate?token=${token}&u=${encodeURIComponent(username)}`;
  await sendEmail(`🆕 New Registration: ${username} — Adelani AI Chat`, regEmailHtml(user, activationUrl));

  res.json({ success:true, message:"Registration submitted! Awaiting admin activation. You'll receive access once approved." });
});

// Login
app.post("/api/login", (req,res) => {
  const { username, password } = req.body;
  if (username==="admin"&&password===ADMIN_PASS)
    return res.json({ id:"admin", username:"admin", role:"admin", activated:true, sessionToken: crypto.createHmac("sha256",ADMIN_SECRET).update("admin").digest("hex") });

  const user = users[username];
  if (!user||user.password!==password) return res.status(401).json({ error:"Invalid username or password." });
  if (user.banned) return res.status(403).json({ error:"Account suspended. Contact admin." });

  const sessionToken = crypto.randomBytes(24).toString("hex");
  user.sessionToken = sessionToken;
  user.sessionExpiry = Date.now()+7*86400000;
  saveUsers();
  res.json({ id:user.id, username:user.username, email:user.email, role:user.role, activated:user.activated, sessionToken });
});

// Activate via email link
app.get("/api/activate", (req,res) => {
  const { token, u } = req.query;
  const user = users[decodeURIComponent(u||"")];
  if (!user||user.activationToken!==token)
    return res.status(400).send(`<html><body style="background:#0A0A0B;color:#E8E0D5;font-family:sans-serif;text-align:center;padding:60px 20px"><h2 style="color:#FF6B6B">❌ Invalid or expired link.</h2></body></html>`);
  user.activated = true; saveUsers();
  res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans&display=swap" rel="stylesheet"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0A0A0B;color:#E8E0D5;font-family:'DM Sans',sans-serif;padding:20px;text-align:center}.card{background:#141416;border:1px solid #222;border-radius:20px;padding:40px 28px;max-width:400px;width:100%}</style></head>
  <body><div class="card"><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:22px;background:linear-gradient(135deg,#F0B429,#E05C2A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:24px">Adelani AI</div>
  <div style="font-size:52px;margin-bottom:18px">🎉</div><h2 style="color:#3ECF8E;font-size:22px;margin:0 0 10px">Account Activated!</h2>
  <p style="color:#888"><strong style="color:#E8E0D5">${decodeURIComponent(u)}</strong> now has full premium access.</p>
  <div style="display:inline-block;margin-top:18px;padding:8px 20px;border-radius:20px;background:#3ECF8E22;border:1px solid #3ECF8E44;color:#3ECF8E;font-size:13px;font-weight:600">✦ Premium Access Granted</div>
  </div></body></html>`);
});

// Check activation status
app.get("/api/status/:username", (req,res) => {
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error:"Not found" });
  res.json({ activated:user.activated, banned:user.banned });
});

// Chat — proxies to OpenRouter
app.post("/api/chat", async (req,res) => {
  const { messages, systemPrompt, sessionToken, username } = req.body;
  if (!messages?.length) return res.status(400).json({ error:"No messages provided." });

  let model = FREE_MODELS[modelRound % FREE_MODELS.length];
  let activated = false;

  if (username==="admin") { model=PREMIUM_MODEL; activated=true; }
  else if (username&&sessionToken) {
    const user = users[username];
    if (user&&user.sessionToken===sessionToken&&user.sessionExpiry>Date.now()) {
      activated = user.activated;
      if (activated) model = PREMIUM_MODEL;
      user.msgCount=(user.msgCount||0)+1; saveUsers();
    }
  }
  if (!activated) modelRound++;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error:"Server not configured (missing OPENROUTER_API_KEY)." });

  const orMsgs = systemPrompt ? [{ role:"system", content:systemPrompt }, ...messages] : messages;
  const tryModels = activated ? [PREMIUM_MODEL] : [model,...FREE_MODELS.filter(m=>m!==model)];
  let lastErr = "";

  for (const m of tryModels) {
    try {
      const r = await fetch(OR_API, { method:"POST",
        headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json", "HTTP-Referer":SITE_URL, "X-Title":"Adelani AI Chat" },
        body:JSON.stringify({ model:m, messages:orMsgs, max_tokens:1024, temperature:0.7 })
      });
      const data = await r.json();
      if (data.error) { lastErr=data.error.message; console.warn("Model err:",m,lastErr); continue; }
      const reply = data.choices?.[0]?.message?.content || "No response generated.";
      return res.json({ reply, model:m, activated });
    } catch(e) { lastErr=e.message; }
  }
  res.status(502).json({ error:`All models failed. ${lastErr}` });
});

// Admin: list users
app.get("/api/admin/users", (req,res) => {
  if (req.query.secret!==ADMIN_SECRET) return res.status(403).json({ error:"Unauthorized" });
  res.json(Object.values(users).map(u=>({ id:u.id,username:u.username,email:u.email,activated:u.activated,banned:u.banned,createdAt:u.createdAt,msgCount:u.msgCount||0 })));
});

// Admin: actions (activate/ban/delete)
app.post("/api/admin/action", (req,res) => {
  const { secret, username, action } = req.body;
  if (secret!==ADMIN_SECRET) return res.status(403).json({ error:"Unauthorized" });
  if (action==="delete") { delete users[username]; saveUsers(); return res.json({ success:true }); }
  const user = users[username];
  if (!user) return res.status(404).json({ error:"Not found" });
  if (action==="activate")   user.activated=true;
  if (action==="deactivate") user.activated=false;
  if (action==="ban")        user.banned=true;
  if (action==="unban")      user.banned=false;
  saveUsers();
  res.json({ success:true, user:{ username:user.username, activated:user.activated, banned:user.banned } });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`\n🚀 Adelani AI Backend on port ${PORT}\n`));
