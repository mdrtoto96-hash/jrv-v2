// Utilitaire de vérification JWT — non exposé comme route Vercel (prefix _)
const crypto = require('crypto');

function verifyToken(token) {
  if (!token) return false;
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, body, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', jwtSecret)
      .update(`${header}.${body}`).digest('base64url');

    // Comparaison constant-time (anti-timing attack)
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch(e) {
    return false;
  }
}

module.exports = { verifyToken };
