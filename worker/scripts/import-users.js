// Import users from the old server's users.json into the D1 database.
//
//   node scripts/import-users.js path/to/users.json
//   npx wrangler d1 execute adelani-users --remote --file=import.sql
//
// Plaintext passwords are hashed here; already-hashed (scrypt) ones are kept and
// upgraded automatically the next time that user logs in.
const fs = require("fs");
const crypto = require("crypto");

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/import-users.js path/to/users.json"); process.exit(1); }

const users = JSON.parse(fs.readFileSync(file, "utf8"));
const q = v => (v === null || v === undefined) ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
const hash = pw => {
  if (pw.startsWith("scrypt$") || pw.startsWith("pbkdf2$")) return pw;
  const salt = crypto.randomBytes(16).toString("hex");
  return `pbkdf2$20000$${salt}$${crypto.pbkdf2Sync(pw, Buffer.from(salt, "hex"), 20000, 32, "sha256").toString("hex")}`;
};

const rows = Object.values(users).filter(u => u && u.username && u.password).map(u =>
  `INSERT OR IGNORE INTO users (username, id, email, password, role, activated, banned, activation_token, created_at, msg_count) VALUES (` +
  [q(u.username), q(u.id || crypto.randomUUID()), q(u.email || ""), q(hash(u.password)), q(u.role || "user"),
   u.activated ? 1 : 0, u.banned ? 1 : 0, q(u.activated ? null : u.activationToken), q(u.createdAt || new Date().toISOString()),
   Number(u.msgCount) || 0].join(", ") + `);`
);
fs.writeFileSync("import.sql", rows.join("\n") + "\n");
console.log(`Wrote import.sql with ${rows.length} user(s).`);
