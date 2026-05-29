// Vercel Serverless Function — Proxy sécurisé vers l'API Anthropic
// Clé API stockée uniquement dans process.env. Jamais exposée au navigateur.
// Supporte les requêtes one-shot (prompt) et multi-tour (messages array pour le chat).
// Intègre Tavily web search pour le sourcing de boîtes (résultats réels, pas hallucinations).
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
Quand Jeremy demande de trouver des boîtes ET que des résultats web sont fournis dans le contexte :

PROCESSUS OBLIGATOIRE EN 2 ÉTAPES — dans cet ordre strict :
  ÉTAPE 1 — EXTRACTION WEB : Ignore complètement le CRM. Extrais TOUTES les entreprises des résultats web qui correspondent à la demande. Ne te laisse pas influencer par ce qui est déjà dans la base.
  ÉTAPE 2 — FILTRE DOUBLONS : Seulement après avoir ta liste complète, retire celles qui sont déjà dans le CRM (même orthographe différente). Le CRM sert UNIQUEMENT à ce filtre final — jamais à guider la recherche.

- Utilise UNIQUEMENT les entreprises présentes dans les résultats web — ne complète JAMAIS avec des boîtes inventées
- Extrais les infos (nom, site, zone, spécialité) depuis les snippets web
- Si les résultats web sont insuffisants, dis-le clairement plutôt qu'inventer
Réponds UNIQUEMENT avec un JSON array valide :
[{"name":"Nom","site":"domaine.fr","zone":"Ville","category":"prod|com|live|event|sport|media|instit|immo","notes":"Spécialité courte","confidence":"high|low","location_note":"(si confidence low)"}]
- Confidence "low" si le site ou la localisation n'est pas confirmé dans les résultats web.
- Maximum 10 par requête.
- Catégories :
  • prod = société de PRODUCTION AUDIOVISUELLE (leur cœur de métier est la vidéo — tournage, montage, post-prod)
  • com = AGENCE DE COMMUNICATION / MARKETING (leur métier est le marketing, branding, digital, social media, pub — ils commandent de la vidéo à des prestataires comme Jeremy ou ont une petite équipe interne)
  • live = captation live/concert, • event = événementiel, • sport = sport & culture, • media = TV/presse, • instit = institutionnel, • immo = immobilier
- DISTINCTION ABSOLUE : une agence com n'est PAS une boîte de prod. Si Jeremy demande des "agences de com", ne propose JAMAIS des sociétés de production audiovisuelle (Animoz, Mstream, NTU, etc.) — c'est une catégorie différente.

2. MESSAGES LINKEDIN
Quand Jeremy demande un message de prospection :
- 3 phrases maximum, pas une de plus
- Commence par un fait concret sur LEUR activité (pas sur Jeremy)
- Une phrase sur ce que Jeremy apporte concrètement à CETTE boîte
- Une phrase de clôture directe (pas une question molle)
- Zéro formules IA : pas de "J'espère que vous allez bien", "En tant que", "Je me permets", "N'hésitez pas", "Cordialement"
- Ton humain, direct, jamais corporate

3. MODIFICATION CRM DIRECTE
Quand Jeremy demande de modifier une entrée CRM (changer un statut, noter un contact, etc.), réponds UNIQUEMENT avec ce JSON — ZÉRO texte avant ou après, pas de "C'est fait !", pas de confirmation, RIEN d'autre :
{"action":"modify_crm","id":NUMERO_ID,"name":"NOM_EXACT_ENTREPRISE","field":"NOM_CHAMP","value":"NOUVELLE_VALEUR","summary":"Ce que tu as fait en une phrase"}
RÈGLE ABSOLUE : le JSON doit être ta réponse COMPLÈTE et ENTIÈRE. Toute phrase ajoutée avant ou après le JSON est strictement interdite.
IMPORTANT : l'id DOIT correspondre exactement à un id présent dans la liste du contexte (format NomEntreprise(id:X)). Pour les URLs (site, linkedin), toujours inclure https://.
Champs disponibles : statut, notes, contact, poste, relance, date, site, linkedin, phone, email
Valeurs statut valides : a-contacter, contact-envoye, message-envoye, pas-de-reponse, en-veille, interesse, rdv-pris, refuse, converti

LOOKUP D'INFOS (site, linkedin, téléphone, email, etc.) : Quand Jeremy demande n'importe quelle info sur une boîte existante ET que des résultats web sont fournis dans le contexte, extrais l'info directement depuis ces résultats et génère le JSON modify_crm UNIQUEMENT (pas de texte autour). Ne demande JAMAIS à Jeremy de chercher lui-même — utilise TOUJOURS les résultats web fournis. Si l'info n'est pas dans les résultats web, dis-le clairement en une phrase (sans JSON).

4. ANALYSE & STRATÉGIE
Quand Jeremy demande une analyse ou des conseils sur sa prospection :
- Diagnostic direct et chiffré
- 2-3 actions concrètes à faire cette semaine
- Parle comme un associé : cash, sans jargon, avec des chiffres
- Jamais de blabla motivationnel vide

5. RELANCES
Quand Jeremy demande qui relancer : utilise les données du contexte pour lister les boîtes urgentes et propose un message de relance adapté au contexte (statut, date, échanges précédents).

6. LOOKUP SITE/LINKEDIN D'UNE BOÎTE EXISTANTE
Quand Jeremy demande le site ou le LinkedIn d'une boîte existante ET que des résultats web sont fournis dans le contexte :
- Extrais l'URL exacte depuis les résultats web (site officiel ou profil LinkedIn)
- Réponds UNIQUEMENT avec le JSON modify_crm — ZÉRO texte avant ou après, pas de "C'est fait !", rien
- Utilise l'id de la boîte dans le contexte CRM
- Si les résultats ne contiennent pas l'info → utilise ta connaissance mais mentionne dans "summary" que l'URL est à vérifier

7. TOUT LE RESTE
Tu réponds à n'importe quelle question — général, conseils business, technique vidéo, stratégie LinkedIn, questions de vie. Tu es un assistant complet, pas limité au CRM.

Réponds toujours en français. Sois direct, efficace, et utile.`
};

// Détecte si le message est une demande de sourcing de nouvelles boîtes
function isSourcingRequest(text) {
  return /\b(trouv|cherch|source|sourc|ajoute|rajoute|donne.moi|liste.moi)\b/i.test(text) &&
    /\b(boîte|boite|agence|studio|société|entreprise|production|prod|comm|communication|event|média|media)\b/i.test(text);
}

// Détecte si le message est une demande de lookup d'infos sur une boîte existante
function isWebLookupRequest(text) {
  return /\b(site|lien|url|web|linkedin|téléphone|telephone|tél|tel|phone|email|mail|adresse|contact|dirigeant|responsable|numéro|numero|info)\b/i.test(text) &&
    /\b(trouv|cherch|rajoute|ajoute|mets?|donne|quel est|c.est quoi|donne.moi|trouve.moi)\b/i.test(text);
}

// Extrait une requête de recherche optimisée depuis le message utilisateur (sourcing)
function buildSearchQuery(userMessage) {
  const msg = userMessage.toLowerCase();
  // Détection ville
  const cityMatch = userMessage.match(/\b(Nantes|Rennes|Bretagne|Brest|Bordeaux|Paris|Lyon|Toulouse|Lille|Marseille|Montpellier|Angers|Le Mans|Saint-Nazaire|Lorient)\b/i);
  const city = cityMatch ? cityMatch[1] : 'Nantes';

  const isProd = /\b(production|audiovisuel|vidéo|video|prod\b)/.test(msg);
  const isCom  = /\b(communication|agence comm|agence de comm|\bcom\b)/.test(msg);
  const isEvent = /\b(événementiel|evenementiel|\bevent\b)/.test(msg);
  const isLive  = /\b(live|concert|captation)/.test(msg);
  const isImmo  = /\b(immobilier|\bimmo\b)/.test(msg);
  const isSport = /\bsport\b/.test(msg);
  const isMedia = /\b(média|media|\btv\b|presse)/.test(msg);

  const sectors = [];
  // Distinction cruciale : agence COM (marketing/brand) ≠ prod audiovisuelle
  if (isCom && !isProd)  sectors.push('agence communication marketing digital brand content');
  else if (isCom && isProd) sectors.push('agence communication audiovisuelle');
  else if (isProd)       sectors.push('société production audiovisuelle vidéo');
  if (isEvent) sectors.push('agence événementielle');
  if (isLive)  sectors.push('captation live concert');
  if (isImmo)  sectors.push('immobilier');
  if (isSport) sectors.push('sport');
  if (isMedia) sectors.push('télévision médias');

  if (sectors.length === 0) {
    return userMessage
      .replace(/\b(trouve|trouves|trouver|cherche|chercher|ajoute|rajouter|donne.moi|liste.moi|nouveaux?|nouvelles?|boîtes?|boites?|dans mon crm|pour mon crm|il m.en faudrait|je voudrais|exetera|etc\.?)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
  }
  return `${sectors.join(' ')} ${city}`;
}

// Construit une requête de recherche propre pour un lookup site/linkedin
function buildLookupQuery(userMessage) {
  // Extraire les noms propres (mots commençant par une majuscule)
  const properNouns = userMessage.match(/\b[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ0-9]+(?:\s+[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][a-zA-ZÀ-ÿ0-9]+)*/g) || [];
  const companyName = properNouns.join(' ').trim();
  const isLinkedin = /linkedin/i.test(userMessage);
  const suffix = isLinkedin ? 'linkedin' : 'site web officiel';
  return companyName ? `${companyName} ${suffix}` : userMessage;
}

// Appel Tavily Web Search
async function tavilySearch(query, tavilyKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: query,
      search_depth: 'basic',
      max_results: 7,
      include_answer: false
    })
  });
  if (!response.ok) {
    console.error('Tavily error:', response.status, await response.text());
    return [];
  }
  const data = await response.json();
  return data.results || [];
}

// Formate les résultats Tavily en contexte lisible pour Claude
function formatSearchResults(results) {
  if (!results.length) return '';
  return results.map((r, i) =>
    `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.content ? r.content.slice(0, 200) : ''}`
  ).join('\n\n');
}

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

  const tavilyKey = process.env.TAVILY_API_KEY;

  const { agent, prompt, context, messages } = req.body || {};

  const hasPrompt = prompt && prompt.trim();
  const hasMessages = messages && Array.isArray(messages) && messages.length > 0;
  if (!hasPrompt && !hasMessages) {
    return res.status(400).json({ error: 'Paramètre prompt ou messages manquant' });
  }

  // Récupère le dernier message utilisateur pour détecter le sourcing
  const lastUserText = hasMessages
    ? String(messages[messages.length - 1]?.content || '')
    : String(prompt || '');

  // --- TAVILY WEB SEARCH ---
  const needsSearch = tavilyKey && (isSourcingRequest(lastUserText) || isWebLookupRequest(lastUserText));
  const isLookup = isWebLookupRequest(lastUserText) && !isSourcingRequest(lastUserText);
  let webSearchContext = '';
  if (needsSearch) {
    try {
      const searchQuery = isLookup ? buildLookupQuery(lastUserText) : buildSearchQuery(lastUserText);
      console.log('Tavily search query:', searchQuery);
      const results = await tavilySearch(searchQuery, tavilyKey);
      if (results.length > 0) {
        const label = isLookup
          ? '[RÉSULTATS WEB RÉELS — extrais l\'URL exacte de la boîte pour mettre à jour le CRM via modify_crm]'
          : '[RÉSULTATS WEB RÉELS — utilise UNIQUEMENT ces sources pour le sourcing]';
        webSearchContext = '\n\n' + label + '\n' + formatSearchResults(results);
      } else if (isLookup) {
        webSearchContext = '\n\n[Recherche web sans résultat — utilise ta connaissance pour l\'URL, indique dans summary que c\'est à vérifier]';
      }
    } catch(e) {
      console.error('Tavily search failed:', e.message);
      webSearchContext = isLookup
        ? '\n\n[Recherche web indisponible — utilise ta connaissance pour l\'URL, indique dans summary que c\'est à vérifier]'
        : '\n\n[Recherche web indisponible — base-toi uniquement sur ta connaissance, confidence "low" obligatoire pour toutes les boîtes]';
    }
  }

  const systemPrompt = SYSTEM_PROMPTS.omnibus;

  // Construction du payload messages pour Anthropic
  let messagesPayload;
  if (hasMessages) {
    messagesPayload = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));
    // Ajouter contexte CRM + résultats web au dernier message utilisateur
    const extraContent = [context ? '[Données contextuelles : ' + context + ']' : '', webSearchContext].filter(Boolean).join('\n');
    if (extraContent && messagesPayload.length > 0) {
      const last = messagesPayload[messagesPayload.length - 1];
      if (last.role === 'user') {
        messagesPayload[messagesPayload.length - 1] = {
          role: 'user',
          content: last.content + '\n\n' + extraContent
        };
      }
    }
  } else {
    const userContent = [prompt, context ? 'Contexte :\n' + context : '', webSearchContext].filter(Boolean).join('\n\n');
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
