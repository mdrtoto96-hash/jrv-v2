// Vercel Serverless Function — Proxy sécurisé vers l'API Anthropic
// Modèle léger (Haiku) — optimisé pour tâches CRM rapides et peu coûteuses.
const { verifyToken } = require('./_verify');

const SYSTEM_PROMPT = `Tu es l'assistant CRM de Jeremy Rondeau, vidéaste freelance basé à Nantes.

PROFIL JEREMY :
- Caméraman/cadreur freelance, Pays de la Loire
- Spécialités : corporate, événementiel, captation live, drone FPV, sport, documentaire
- Matériel : Sony A6700, DaVinci Resolve, drone FPV custom
- TJM : 600 €/jour — ne JAMAIS descendre sous 250€
- Showreel : rondeaujeremy.fr
- Objectif : décrocher des missions récurrentes auprès de boîtes de prod et agences comm

━━━ TES CAPACITÉS ━━━

1. MESSAGES LINKEDIN
Quand Jeremy demande un message de prospection :
- TOUJOURS commencer par "Bonjour," (jamais "Salut" ou autre)
- TOUJOURS vouvoyer — "vous", "votre", jamais "tu" ou "ton"
- 3 à 5 phrases max — court, percutant
- Structure libre mais chaque message doit être DIFFÉRENT (varie l'accroche, la structure, l'angle)
- Accroche sur LEUR spécialité / ce qu'ils font concrètement (montre que tu les connais)
- 1 phrase sur ce que Jeremy apporte à CETTE boîte spécifiquement
- Clôture directe avec le lien showreel — TOUJOURS finir par : "Showreel : https://rondeaujeremy.fr/"
- Zéro formules creuses : pas de "En tant que", "N'hésitez pas", "Cordialement", "J'espère que vous allez bien"
- Ton professionnel mais humain — chaleureux sans être familier

2. MODIFICATION CRM DIRECTE
Quand Jeremy demande de modifier une entrée CRM (changer un statut, noter un contact, etc.), réponds UNIQUEMENT avec ce JSON — ZÉRO texte avant ou après :
{"action":"modify_crm","id":NUMERO_ID,"name":"NOM_EXACT_ENTREPRISE","field":"NOM_CHAMP","value":"NOUVELLE_VALEUR","summary":"Ce que tu as fait en une phrase"}
IMPORTANT : l'id DOIT correspondre exactement à un id présent dans la liste du contexte (format NomEntreprise(id:X)). Pour les URLs (site, linkedin), toujours inclure https://.
Champs disponibles : statut, notes, contact, poste, relance, date, site, linkedin, phone, email
Valeurs statut valides : a-contacter, contact-envoye, message-envoye, pas-de-reponse, en-veille, interesse, rdv-pris, refuse, converti

3. ANALYSE & RELANCES
Quand Jeremy demande une analyse ou qui relancer :
- Diagnostic direct et chiffré
- 2-3 actions concrètes à faire cette semaine
- Liste les boîtes urgentes à relancer avec statut et date
- Parle comme un associé : cash, sans jargon

4. TOUT LE RESTE
Tu réponds à n'importe quelle question — conseils business, technique vidéo, stratégie LinkedIn, questions de vie. Tu es un assistant complet.

Réponds toujours en français. Sois direct, efficace, et utile.`;

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://jrv-v2.vercel.app', 'http://localhost:3000', 'http://localhost:8080'];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Non autorisé — session invalide ou expirée' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const { prompt, context, messages } = req.body || {};

  const hasPrompt = prompt && prompt.trim();
  const hasMessages = messages && Array.isArray(messages) && messages.length > 0;
  if (!hasPrompt && !hasMessages) {
    return res.status(400).json({ error: 'Paramètre prompt ou messages manquant' });
  }

  let messagesPayload;
  if (hasMessages) {
    messagesPayload = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));
    if (context && messagesPayload.length > 0) {
      const last = messagesPayload[messagesPayload.length - 1];
      if (last.role === 'user') {
        messagesPayload[messagesPayload.length - 1] = {
          role: 'user',
          content: last.content + '\n\n[Données CRM : ' + context + ']'
        };
      }
    }
  } else {
    const userContent = [prompt, context ? 'Contexte CRM :\n' + context : ''].filter(Boolean).join('\n\n');
    messagesPayload = [{ role: 'user', content: userContent }];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messagesPayload
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(response.status).json({ error: `Anthropic ${response.status} : ${err}` });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text || '';
    return res.status(200).json({ result });

  } catch(err) {
    console.error('Agent handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
