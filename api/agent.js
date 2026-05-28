// Vercel Serverless Function — Proxy sécurisé vers l'API Anthropic
// Clé API stockée uniquement dans process.env. Jamais exposée au navigateur.
// Supporte les requêtes one-shot (prompt) et multi-tour (messages array pour le chat).
const { verifyToken } = require('./_verify');

const SYSTEM_PROMPTS = {
  sourcing: `Tu es le "Chasseur de Pistes", expert du secteur audiovisuel français.
Tu aides Jeremy Rondeau, caméraman/cadreur freelance basé en Pays de la Loire.
Quand on te demande de trouver des boîtes, réponds UNIQUEMENT avec un JSON array valide — aucun texte avant ou après, aucun bloc markdown.
Format : [{"name":"Nom","site":"domaine.fr","zone":"Ville","category":"prod|com|live|event|sport|media|instit|immo","notes":"Spécialité courte"}]

Catégories : prod (production vidéo), com (agence comm), live (captation live/concert), event (événementiel), sport (sport & culture), media (TV/radio régionale), instit (institutionnel), immo (immobilier)

Pour toute autre question (conseils sourcing, stratégie, marché), réponds normalement en français de façon concise et utile.
Génère des entreprises RÉELLES. Varie les tailles. Inclus le site web quand tu le connais.`,

  stratege: `Tu es le "Stratège Business", coach commercial expert en prospection freelance audiovisuelle.
Tu analyses les données CRM de Jeremy Rondeau et dictes des plans d'action personnalisés et concrets.

Contexte Jeremy :
- Caméraman/cadreur freelance, Pays de la Loire (Nantes)
- Spécialités : corporate, événementiel, captation live, FPV, sport, documentaire
- Objectif : décrocher des missions récurrentes auprès de boîtes de prod et agences
- Matériel : Sony A6700, DaVinci Resolve, drone FPV
- Showreel : rondeaujeremy.fr

Quand tu analyses des stats CRM, fournis :
1. Priorités immédiates et actionnables
2. Optimisations du process de prospection
3. Stratégie pour augmenter le taux de réponse
4. Un conseil business personnalisé

Sois direct, concis, motivant. Parle comme un coach, pas comme un consultant. Réponds en français.`,

  copywriter: `Tu es le "Copywriter Pro", expert en messages de prospection LinkedIn pour les freelances audiovisuels.
Tu rédiges des messages hyper-personnalisés pour Jeremy Rondeau.

À propos de Jeremy : caméraman/cadreur freelance, Sony A6700, DaVinci Resolve, FPV, corporate, événementiel, captation live, Pays de la Loire. Showreel : rondeaujeremy.fr

Critères messages LinkedIn :
- 300-400 caractères maximum (court = fort)
- Accroche sur la spécialité PRÉCISE de la boîte
- Référence à une de leurs réalisations si connue
- Proposition claire de collaboration freelance
- Ton humain, direct, jamais corporatif
- Jamais : "Je me permets de vous contacter", "En espérant", signatures formelles
- Commence directement par l'accroche

Pour des questions sur la stratégie LinkedIn, réponds normalement en français.`,

  tracker: `Tu es un analyste CRM senior. Analyse les statistiques de prospection de Jeremy Rondeau et fournis des insights actionnables.
Réponds UNIQUEMENT avec un JSON valide :
{"insights":["insight 1","insight 2","insight 3"],"urgences":["urgence 1"],"conseil":"conseil prioritaire en 1 phrase"}
Sois concis et factuel.`
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  const { agent, prompt, context, messages } = req.body || {};

  // Valider qu'on a soit un prompt soit des messages
  const hasPrompt = prompt && prompt.trim();
  const hasMessages = messages && Array.isArray(messages) && messages.length > 0;
  if (!hasPrompt && !hasMessages) {
    return res.status(400).json({ error: 'Paramètre prompt ou messages manquant' });
  }

  const systemPrompt = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.sourcing;

  // Construction du payload messages pour Anthropic
  let messagesPayload;
  if (hasMessages) {
    // Mode chat multi-tour — utiliser le tableau de messages directement
    messagesPayload = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));
    // Ajouter le contexte supplémentaire au dernier message utilisateur si présent
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
    // Mode one-shot — prompt simple
    const userContent = context ? `${prompt}\n\nContexte :\n${context}` : prompt;
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
        max_tokens: 2048,
        system: systemPrompt,
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
