/* ══════════════════════════════════════════════════════════════════════════
   Adelani AI Chat — Backend API (Cloudflare Worker)

   Same API as the old Express server (server.js), but runs on Cloudflare's
   free plan: no sleeping / cold starts, and users live in a D1 database so
   accounts are never lost on redeploy.

   Bindings (see wrangler.toml):
     DB                  D1 database (schema in ../schema.sql)
   Secrets (set with `npx wrangler secret put NAME`):
     OPENROUTER_API_KEY  required
     ADMIN_PASSWORD      required for admin login
     ADMIN_SECRET        optional — scripted access to /api/admin/*
     RESEND_API_KEY      optional — activation emails to the admin
   Vars (wrangler.toml):
     ADMIN_EMAIL, FRONTEND_URL, EMAIL_FROM,
     CHAT_MODELS / HEAVY_MODELS / GRACE_MODELS / VISION_MODELS (comma-separated)
   ══════════════════════════════════════════════════════════════════════════ */

const VERSION          = "3.0.0";
const OR_API           = "https://openrouter.ai/api/v1/chat/completions";
const ADMIN_SESSION_MS = 12 * 3600000;     // admin sessions last 12 hours
const USER_SESSION_MS  = 7 * 86400000;     // user sessions last 7 days
const PBKDF2_ITERS     = 20000;            // kept modest to fit the free plan's CPU budget

// ── Models ────────────────────────────────────────────────────────────────────
// Each tier is a fallback list: if a model errors or is retired by its provider,
// the next one is tried. Override any tier with a comma-separated var.
const DEFAULT_TIERS = {
  chat:   ["meta-llama/llama-3.1-8b-instruct", "google/gemini-2.5-flash-lite", "openai/gpt-4o-mini"],
  heavy:  ["meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.1-70b-instruct", "deepseek/deepseek-chat"],
  grace:  ["deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct"],
  vision: ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash", "openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"],
};
// Older frontends send exact model IDs — map them onto the matching tier.
const LEGACY_MODEL_IDS = {
  "meta-llama/llama-3.1-8b-instruct":  "chat",
  "meta-llama/llama-3.1-70b-instruct": "heavy",
  "deepseek/deepseek-chat":            "grace",
};
const tiers = env => {
  const pick = (name, defaults) => {
    const v = env[name];
    return v ? v.split(",").map(m => m.trim()).filter(Boolean) : defaults;
  };
  return {
    chat:   pick("CHAT_MODELS",   DEFAULT_TIERS.chat),
    heavy:  pick("HEAVY_MODELS",  DEFAULT_TIERS.heavy),
    grace:  pick("GRACE_MODELS",  DEFAULT_TIERS.grace),
    vision: pick("VISION_MODELS", DEFAULT_TIERS.vision),
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Expose-Headers": "X-Model",
};
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });

const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = hex => new Uint8Array((hex.match(/../g) || []).map(h => parseInt(h, 16)));
const randomHex = bytes => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

const safeEqual = (a, b) => {
  const ba = enc.encode(String(a)), bb = enc.encode(String(b));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
};

const hmacHex = async (key, msg) => {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
};

// Passwords are stored as "pbkdf2$<iters>$<salt>$<hash>". Accounts imported from the
// old server may hold "scrypt$<salt>$<hash>" or plaintext; both are upgraded on login.
const pbkdf2 = async (pw, saltHex, iters) => {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: iters }, k, 256);
  return toHex(bits);
};
const hashPassword = async pw => {
  const salt = randomHex(16);
  return `pbkdf2$${PBKDF2_ITERS}$${salt}$${await pbkdf2(pw, salt, PBKDF2_ITERS)}`;
};
const verifyPassword = async (pw, stored) => {
  if (typeof stored !== "string") return false;
  if (stored.startsWith("pbkdf2$")) {
    const [, iters, salt, hash] = stored.split("$");
    return safeEqual(await pbkdf2(pw, salt, Number(iters)), hash);
  }
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    const { scryptSync } = await import("node:crypto");
    return safeEqual(scryptSync(pw, salt, 64).toString("hex"), hash);
  }
  return safeEqual(pw, stored); // legacy plaintext
};

// Admin session tokens are "<expiry>.<signature>", signed with a key derived from the
// admin password — they stop working if the password changes.
const adminKey  = env => "adelani-admin:" + (env.ADMIN_PASSWORD || "") + ":" + (env.ADMIN_SECRET || "");
const signAdmin = (env, exp) => hmacHex(adminKey(env), String(exp));

const isAdminRequest = async (req, env, body) => {
  const auth  = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [exp, sig] = token.split(".");
  if (env.ADMIN_PASSWORD && sig && Number(exp) > Date.now() && safeEqual(sig, await signAdmin(env, exp))) return true;
  const secret = new URL(req.url).searchParams.get("secret") || body?.secret;
  return !!(env.ADMIN_SECRET && secret && safeEqual(secret, env.ADMIN_SECRET));
};

const getUser = (env, username) =>
  env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();

const readJson = async req => { try { return await req.json(); } catch { return {}; } };

// ── Email (Resend) ────────────────────────────────────────────────────────────
const sendEmail = async (env, subject, body) => {
  if (!env.RESEND_API_KEY) { console.log("📧 Email skipped — no RESEND_API_KEY set"); return; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Adelani AI <onboarding@resend.dev>",
        to: [env.ADMIN_EMAIL || "mikeade3000@yahoo.com"], subject, html: body,
      }),
    });
    if (!r.ok) console.error("📧 Failed:", r.status, await r.text());
    else console.log("📧 Sent:", subject);
  } catch (e) { console.error("📧 Failed:", e.message); }
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
      <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#666;font-size:13px">Email</td><td style="padding:10px 0;color:#E8E0D5">${escapeHtml(u.email || "Not provided")}</td></tr>
      <tr><td style="padding:10px 0;color:#666;font-size:13px">Date</td><td style="padding:10px 0;color:#888;font-size:13px">${new Date(u.created_at).toUTCString()}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0">
      <a href="${url}" style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#F0B429,#E05C2A);color:#0A0A0B;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px">✅ Activate This User</a>
    </div>
  </div>
</div></body></html>`;

// ── Routes ────────────────────────────────────────────────────────────────────
const health = env => json({
  status: "🟢 Adelani AI Backend (Cloudflare)",
  version: VERSION,
  model: tiers(env).chat[0],
  time: new Date().toISOString(),
});

async function register(req, env, ctx) {
  const { username, email, password } = await readJson(req);
  if (typeof username !== "string" || typeof password !== "string" || !username || !password)
    return json({ error: "Username and password required." }, 400);
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username))
    return json({ error: "Username must be 3–32 letters, numbers, dots, dashes or underscores." }, 400);
  if (["admin", "__proto__", "constructor", "prototype"].includes(username))
    return json({ error: "That username is reserved." }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
  if (await getUser(env, username)) return json({ error: "Username already taken." }, 409);

  const user = {
    id: crypto.randomUUID(), username,
    email: typeof email === "string" ? email.slice(0, 200) : "",
    password: await hashPassword(password),
    activation_token: randomHex(32),
    created_at: new Date().toISOString(),
  };
  try {
    await env.DB.prepare(
      `INSERT INTO users (username, id, email, password, role, activated, banned, activation_token, created_at, msg_count)
       VALUES (?, ?, ?, ?, 'user', 0, 0, ?, ?, 0)`
    ).bind(user.username, user.id, user.email, user.password, user.activation_token, user.created_at).run();
  } catch (e) {
    return json({ error: "Username already taken." }, 409); // lost a race on the same name
  }

  const origin = new URL(req.url).origin;
  const activationUrl = `${origin}/api/activate?token=${user.activation_token}&u=${encodeURIComponent(username)}`;
  ctx.waitUntil(sendEmail(env, `🆕 New Registration: ${username}`, regEmailHtml(user, activationUrl)));
  return json({ success: true, message: "Registration submitted! You'll be notified once activated." });
}

async function login(req, env) {
  const { username, password } = await readJson(req);
  if (typeof username !== "string" || typeof password !== "string")
    return json({ error: "Username and password required." }, 400);

  if (username === "admin") {
    if (!env.ADMIN_PASSWORD || !safeEqual(password, env.ADMIN_PASSWORD))
      return json({ error: "Invalid username or password." }, 401);
    const exp = Date.now() + ADMIN_SESSION_MS;
    return json({ id: "admin", username: "admin", role: "admin", activated: true, sessionToken: `${exp}.${await signAdmin(env, exp)}` });
  }

  const user = await getUser(env, username);
  if (!user || !(await verifyPassword(password, user.password)))
    return json({ error: "Invalid username or password." }, 401);
  if (user.banned) return json({ error: "Account suspended. Contact admin." }, 403);

  const sessionToken = randomHex(24);
  const newHash = user.password.startsWith("pbkdf2$") ? user.password : await hashPassword(password);
  await env.DB.prepare("UPDATE users SET session_token = ?, session_expiry = ?, password = ? WHERE username = ?")
    .bind(sessionToken, Date.now() + USER_SESSION_MS, newHash, username).run();
  return json({ id: user.id, username: user.username, email: user.email, role: user.role, activated: !!user.activated, sessionToken });
}

async function activate(req, env) {
  const q = new URL(req.url).searchParams;
  const name = q.get("u") || "", token = q.get("token") || "";
  const user = await getUser(env, name);
  if (!user || !user.activation_token || !token || !safeEqual(user.activation_token, token))
    return html("<html><body style='background:#0A0A0B;color:#E8E0D5;text-align:center;padding:60px;font-family:sans-serif'><h2 style='color:#FF6B6B'>❌ Invalid or expired link.</h2></body></html>", 400);
  await env.DB.prepare("UPDATE users SET activated = 1, activation_token = NULL WHERE username = ?").bind(name).run();
  return html(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0A0A0B;color:#E8E0D5;font-family:sans-serif;text-align:center;padding:20px}
  .c{background:#141416;border:1px solid #222;border-radius:20px;padding:40px 28px;max-width:400px;width:100%}</style></head>
  <body><div class="c">
    <div style="font-size:52px;margin-bottom:18px">🎉</div>
    <h2 style="color:#3ECF8E;font-size:22px;margin:0 0 10px">Account Activated!</h2>
    <p style="color:#888"><strong style="color:#E8E0D5">${escapeHtml(name)}</strong> now has access to Adelani AI Chat.</p>
  </div></body></html>`);
}

async function status(env, username) {
  const user = await getUser(env, username);
  if (!user) return json({ error: "Not found" }, 404);
  return json({ activated: !!user.activated, banned: !!user.banned });
}

async function chat(req, env, ctx) {
  const { messages, systemPrompt, sessionToken, username, hasImage, maxTokens, model, stream } = await readJson(req);
  if (!Array.isArray(messages) || !messages.length) return json({ error: "No messages provided." }, 400);
  if (!env.OPENROUTER_API_KEY) return json({ error: "Server not configured — OPENROUTER_API_KEY missing." }, 500);

  // Count messages for logged-in users — in the background, so it never delays the reply.
  if (typeof username === "string" && username !== "admin" && typeof sessionToken === "string" && sessionToken) {
    ctx.waitUntil(env.DB.prepare(
      "UPDATE users SET msg_count = msg_count + 1 WHERE username = ? AND session_token = ? AND session_expiry > ?"
    ).bind(username, sessionToken, Date.now()).run().catch(() => {}));
  }

  const orMsgs = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

  // Choose model tier: image → vision; "heavy"/"grace" (or a legacy ID) → that tier,
  // then the chat tier as a last resort; anything else → chat.
  const T = tiers(env);
  const useVision = hasImage || messages.some(m => Array.isArray(m.content));
  const tier = typeof model === "string" ? (LEGACY_MODEL_IDS[model] || model) : "chat";
  const textTier = (tier === "heavy" || tier === "grace") ? tier : "chat";
  const models = useVision ? T.vision : [...new Set([...T[textTier], ...T.chat])];

  // Honor a per-request token budget, clamped for safety.
  const tokenBudget = Math.min(Math.max(parseInt(maxTokens) || 1500, 256), 4500);

  let lastErr = "";
  for (const m of models) {
    try {
      const r = await fetch(env.OPENROUTER_URL || OR_API, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type":  "application/json",
          "HTTP-Referer":  env.FRONTEND_URL || "https://mikeade3000.github.io/Adelani-Chat-AI",
          "X-Title":       "Adelani AI Chat",
        },
        body: JSON.stringify({
          model: m, messages: orMsgs, max_tokens: tokenBudget, temperature: 0.7,
          stream: !!stream,
          provider: { sort: "latency" }, // route to the provider that starts answering fastest
        }),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        lastErr = data.error?.message || `HTTP ${r.status}`;
        console.warn(`✗ ${m}:`, lastErr);
        continue; // try next model
      }

      if (stream) {
        // Pass OpenRouter's server-sent events straight through to the browser.
        return new Response(r.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Model": m, ...CORS },
        });
      }

      const data = await r.json().catch(() => ({ error: { message: "Bad response from model." } }));
      if (data.error) { lastErr = data.error.message; console.warn(`✗ ${m}:`, lastErr); continue; }
      return json({ reply: data.choices?.[0]?.message?.content || "No response generated.", model: m });
    } catch (e) {
      lastErr = e.message;
      console.warn(`✗ ${m} (network):`, lastErr);
    }
  }
  return json({ error: lastErr || "All models failed." }, 502);
}

async function adminUsers(req, env) {
  if (!(await isAdminRequest(req, env))) return json({ error: "Unauthorized" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT id, username, email, activated, banned, created_at, msg_count FROM users ORDER BY created_at DESC"
  ).all();
  return json(results.map(u => ({
    id: u.id, username: u.username, email: u.email,
    activated: !!u.activated, banned: !!u.banned,
    createdAt: u.created_at, msgCount: u.msg_count || 0,
  })));
}

async function adminAction(req, env) {
  const body = await readJson(req);
  if (!(await isAdminRequest(req, env, body))) return json({ error: "Unauthorized" }, 403);
  const { username, action } = body;
  if (action === "delete") {
    await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
    return json({ success: true });
  }
  const SETS = {
    activate:   "activated = 1",
    deactivate: "activated = 0",
    ban:        "banned = 1",
    unban:      "banned = 0",
  };
  const user = await getUser(env, username);
  if (!user) return json({ error: "User not found" }, 404);
  if (SETS[action]) await env.DB.prepare(`UPDATE users SET ${SETS[action]} WHERE username = ?`).bind(username).run();
  const u = await getUser(env, username);
  return json({ success: true, user: { username: u.username, activated: !!u.activated, banned: !!u.banned } });
}

// ── Router ────────────────────────────────────────────────────────────────────
export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(req.url);
    try {
      if (req.method === "GET"  && pathname === "/")                  return health(env);
      if (req.method === "POST" && pathname === "/api/register")      return await register(req, env, ctx);
      if (req.method === "POST" && pathname === "/api/login")         return await login(req, env);
      if (req.method === "GET"  && pathname === "/api/activate")      return await activate(req, env);
      if (req.method === "GET"  && pathname.startsWith("/api/status/"))
        return await status(env, decodeURIComponent(pathname.slice("/api/status/".length)));
      if (req.method === "POST" && pathname === "/api/chat")          return await chat(req, env, ctx);
      if (req.method === "GET"  && pathname === "/api/admin/users")   return await adminUsers(req, env);
      if (req.method === "POST" && pathname === "/api/admin/action")  return await adminAction(req, env);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      console.error("Unhandled:", e.stack || e.message);
      return json({ error: "Server error." }, 500);
    }
  },
};
