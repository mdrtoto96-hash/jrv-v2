// Endpoint de connexion sécurisé — vérifie le mot de passe, retourne un JWT
const crypto = require('crypto');

function createToken(secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = {
    sub: 'jeremy',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 jours
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret)
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const appPassword = process.env.APP_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!appPassword || !jwtSecret) {
    return res.status(500).json({ error: 'Variables APP_PASSWORD ou JWT_SECRET non configurées dans Vercel' });
  }

  const { password } = req.body || {};

  // Hash les deux mots de passe pour comparaison constant-time
  const inputHash = crypto.createHash('sha256').update(password || '').digest();
  const correctHash = crypto.createHash('sha256').update(appPassword).digest();

  if (!crypto.timingSafeEqual(inputHash, correctHash)) {
    // Délai artificiel anti-bruteforce
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = createToken(jwtSecret);
  return res.status(200).json({ token });
};
