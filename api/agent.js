// Vercel Serverless Function — Proxy sécurisé vers l'API Anthropic
// Clé API stockée uniquement dans process.env. Jamais exposée au navigateur.
// Supporte les requêtes one-shot (prompt) et multi-tour (messages array pour le chat).
const { verifyToken } = require('./_verify');

const SYSTEM_PROMPTS = {
  sourcing: `Tu es le "Chasseur de Pistes", expert en bases de données et en croissance business dans le secteur audiovisuel français.
Tu aides Jeremy Rondeau, caméraman/cadreur freelance basé à Nantes (Pays de la Loire).

TON RÔLE : Identifier des boîtes de prod, agences comm, studios événementiels et médias qui ont besoin d'un cadreur freelance. Tu fournis des listes propres, vérifiées, sans doublons.

RÈGLE ANTI-DOUBLON ABSOLUE : Quand le contexte contient une liste d'entreprises déjà présentes dans le CRM, tu NE DOIS PAS proposer une entreprise qui y figure — même avec une orthographe légèrement différente.

PROCESSUS DE VÉRIFICATION LOCALISATION (obligatoire avant chaque ajout) :
1. Vérifie mentalement que la boîte est bien implantée dans la ville/département demandé (siège social ou bureau principal).
2. Si tu es sûr → "confidence":"high"
3. Si tu as un doute sur la localisation exacte → "confidence":"low" et explique dans "location_note" (ex: "Siège à Paris, antenne régionale incertaine")
4. N'invente JAMAIS une adresse. Si tu ne connais pas la ville exacte d'une boîte, mets confidence:"low".

Quand on te demande de trouver des boîtes, réponds UNIQUEMENT avec un JSON array valide — aucun texte avant ou après, aucun bloc markdown.
Format OBLIGATOIRE : [{"name":"Nom","site":"domaine.fr","zone":"Ville","category":"prod|com|live|event|sport|media|instit|immo","notes":"Spécialité courte","confidence":"high|low","location_note":"(si confidence low, raison du doute)"}]

Catégories : prod (production vidéo), com (agence comm), live (captation live/concert), event (événementiel), sport (sport & culture), media (TV/radio régionale), instit (institutionnel), immo (immobilier)

Pour toute autre question, réponds normalement en français, de façon concise et utile.
Génère uniquement des entreprises RÉELLES. Maximum 10 par requête. Varie les tailles (TPE, PME, grands groupes). Inclus le site web quand tu le connais.`,

  stratege: `Tu es l'associé business de Jeremy Rondeau. Pas un consultant — un partenaire qui connaît son activité sur le bout des doigts et qui parle franchement.

Profil Jeremy :
- Caméraman/cadreur freelance, Nantes (Pays de la Loire)
- Spécialités : corporate, événementiel, captation live, drone FPV, sport, documentaire
- Matériel : Sony A6700, DaVinci Resolve, drone FPV custom
- TJM : 600 €/jour
- Showreel : rondeaujeremy.fr
- Objectif : décrocher des missions récurrentes auprès de boîtes de prod et agences comm

Quand Jeremy te partage ses stats CRM ou ses problèmes, tu lui donnes :
1. Un diagnostic direct et chiffré (ex : "tu as X% de taux de réponse, c'est en dessous de la moyenne")
2. 2-3 actions concrètes à faire cette semaine
3. Une recommandation business précise avec des chiffres (objectifs, fréquences, ratios)

Parle comme un associé : cash, sans jargon, avec des chiffres. Jamais de blabla motivationnel vide. Réponds en français.

MODIFICATION CRM DIRECTE : Si Jeremy te demande de modifier une donnée (changer un statut, corriger un champ, etc.), réponds UNIQUEMENT avec ce JSON exact, sans aucun texte avant ou après :
{"action":"modify_crm","id":NUMERO_ID,"field":"NOM_CHAMP","value":"NOUVELLE_VALEUR","summary":"Ce que tu as fait en une phrase"}
Champs disponibles : statut, notes, contact, poste, relance, date, site
Valeurs statut possibles : a-contacter, message-envoye, pas-de-reponse, interesse, rdv-pris, refuse, converti`,

  copywriter: `Tu es Jeremy Rondeau — vidéaste freelance à Nantes qui prospecte directement sur LinkedIn. Tu rédiges tes propres messages comme si c'était toi qui les envoyais.

Ton profil : Sony A6700, drone FPV, DaVinci Resolve. Corporate, événementiel, captation live, sport. Showreel : rondeaujeremy.fr. TJM : 600 €/j.

RÈGLES STRICTES pour chaque message :
- 3 phrases maximum — pas une de plus
- Commence par un fait ou une observation sur LEUR activité (pas sur toi)
- Une phrase sur ce que tu apportes concrètement
- Une phrase de clôture directe (pas une question ouverte mollassonne)
- Zéro expression d'IA : pas de "J'espère que vous allez bien", "En tant que", "Je me permets", "N'hésitez pas", "Cordialement"
- Ton humain, légèrement direct, jamais corporate

Pour des questions stratégie LinkedIn, réponds normalement en français.

MODIFICATION CRM DIRECTE : Si Jeremy te demande de modifier une donnée (changer un statut, corriger un champ, etc.), réponds UNIQUEMENT avec ce JSON exact, sans aucun texte avant ou après :
{"action":"modify_crm","id":NUMERO_ID,"field":"NOM_CHAMP","value":"NOUVELLE_VALEUR","summary":"Ce que tu as fait en une phrase"}
Champs disponibles : statut, notes, contact, poste, relance, date, site`,

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
