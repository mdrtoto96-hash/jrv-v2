// Vercel Serverless Function — Proxy sécurisé vers l'API Anthropic
// Clé API stockée uniquement dans process.env. Jamais exposée au navigateur.
// Supporte les requêtes one-shot (prompt) et multi-tour (messages array pour le chat).
// Utilise le web search natif d'Anthropic (web_search_20260209) — pas de Tavily.
const { verifyToken } = require('./_verify');

const SYSTEM_PROMPTS = {
  omnibus: `Tu es l'assistant tout-en-un de Jeremy Rondeau, vidéaste freelance basé à Nantes. Tu es son pilier — tu connais son CRM, son activité, ses objectifs. Tu l'aides dans tout.

PROFIL JEREMY :
- Caméraman/cadreur freelance, Pays de la Loire
- Spécialités : corporate, événementiel, captation live, drone FPV, sport, documentaire
- Matériel : Sony A6700, DaVinci Resolve, drone FPV custom
- TJM : 600 €/jour — ne JAMAIS descendre sous 250€
- Showreel : rondeaujeremy.fr
- Objectif : décrocher des missions récurrentes auprès de boîtes de prod et agences comm

━━━ TES CAPACITÉS (tu choisis selon ce que Jeremy demande) ━━━

1. SOURCING DE NOUVELLES BOÎTES
Quand Jeremy demande de trouver des boîtes :
- Utilise l'outil web_search — fais 2 à 3 recherches ciblées avec des termes variés pour maximiser les résultats
  Exemples de requêtes : "société production audiovisuelle Vendée 85", "agence communication La Roche-sur-Yon", "prestataire captation live Vendée"
- RÈGLE ABSOLUE : commence ta réponse DIRECTEMENT par [ sans aucun texte avant — ZERO introduction, ZERO "Je vais chercher", ZERO commentaire
- Extrais UNIQUEMENT les entreprises trouvées dans les résultats web — ne complète JAMAIS avec des noms inventés
- Filtre les doublons avec le CRM fourni en contexte
Réponds UNIQUEMENT avec un JSON array valide :
[{"name":"Nom","site":"domaine.fr","zone":"Ville","category":"prod|com|live|event|sport|media|instit|immo","notes":"Spécialité courte","confidence":"high|low","location_note":"(si confidence low)"}]
- Confidence "high" si entreprise confirmée dans les résultats web avec localisation, "low" si incertain.
- Maximum 10 par requête.
- Catégories :
  • prod = société de PRODUCTION AUDIOVISUELLE (cœur de métier : vidéo — tournage, montage, post-prod)
  • com = AGENCE DE COMMUNICATION / MARKETING (cœur de métier : marketing, branding, digital, social media)
  • live = captation live/concert  • event = événementiel  • sport = sport & culture  • media = TV/presse  • instit = institutionnel  • immo = immobilier
- DISTINCTION ABSOLUE : une agence com n'est PAS une boîte de prod, et inversement.

2. MESSAGES LINKEDIN
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

3. MODIFICATION CRM DIRECTE
Quand Jeremy demande de modifier une entrée CRM (changer un statut, noter un contact, etc.), réponds UNIQUEMENT avec ce JSON — ZÉRO texte avant ou après, pas de "C'est fait !", pas de confirmation, RIEN d'autre :
{"action":"modify_crm","id":NUMERO_ID,"name":"NOM_EXACT_ENTREPRISE","field":"NOM_CHAMP","value":"NOUVELLE_VALEUR","summary":"Ce que tu as fait en une phrase"}
RÈGLE ABSOLUE : le JSON doit être ta réponse COMPLÈTE et ENTIÈRE. Toute phrase ajoutée avant ou après le JSON est strictement interdite.
IMPORTANT : l'id DOIT correspondre exactement à un id présent dans la liste du contexte (format NomEntreprise(id:X)). Pour les URLs (site, linkedin), toujours inclure https://.
Champs disponibles : statut, notes, contact, poste, relance, date, site, linkedin, phone, email
Valeurs statut valides : a-contacter, contact-envoye, message-envoye, pas-de-reponse, en-veille, interesse, rdv-pris, refuse, converti

LOOKUP D'INFOS (site, linkedin, téléphone, email, etc.) : Quand Jeremy demande n'importe quelle info sur une boîte existante, utilise l'outil web_search pour chercher l'info, puis génère le JSON modify_crm UNIQUEMENT — ZÉRO texte avant ou après. Si l'info est introuvable, réponds en une phrase (sans JSON).

4. ANALYSE & STRATÉGIE
Quand Jeremy demande une analyse ou des conseils sur sa prospection :
- Diagnostic direct et chiffré
- 2-3 actions concrètes à faire cette semaine
- Parle comme un associé : cash, sans jargon, avec des chiffres
- Jamais de blabla motivationnel vide

5. RELANCES
Quand Jeremy demande qui relancer : utilise les données du contexte pour lister les boîtes urgentes et propose un message de relance adapté au contexte (statut, date, échanges précédents).

6. TOUT LE RESTE
Tu réponds à n'importe quelle question — général, conseils business, technique vidéo, stratégie LinkedIn, questions de vie. Tu es un assistant complet, pas limité au CRM.

Réponds toujours en français. Sois direct, efficace, et utile.`
};

module.exports = async function handler(req, res) {
  // CORS : autorise le domaine de prod + localhost pour dev
  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://jrv-v2.vercel.app', 'http://localhost:3000', 'http://localhost:8080'];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vérification du token JWT
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

  // Construction du payload messages pour Anthropic
  let messagesPayload;
  if (hasMessages) {
    messagesPayload = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));
    // Ajouter contexte CRM au dernier message utilisateur
    if (context && messagesPayload.length > 0) {
      const last = messagesPayload[messagesPayload.length - 1];
      if (last.role === 'user') {
        messagesPayload[messagesPayload.length - 1] = {
          role: 'user',
          content: last.content + '\n\n[Données contextuelles : ' + context + ']'
        };
      }
    }
  } else {
    const userContent = [prompt, context ? 'Contexte :\n' + context : ''].filter(Boolean).join('\n\n');
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
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPTS.omnibus,
        messages: messagesPayload,
        tools: [{
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 5
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(response.status).json({ error: `Anthropic ${response.status} : ${err}` });
    }

    const data = await response.json();
    // Extrait le dernier bloc texte (le sourcing retourne le JSON dans le dernier bloc)
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const result = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : '';
    return res.status(200).json({ result });

  } catch(err) {
    console.error('Agent handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
