# CLAUDE.md — JRV V2 CRM

## Projet
CRM de prospection audiovisuelle pour Jeremy Rondeau (JRV), vidéaste freelance basé à Nantes.
Objectif : trouver des boîtes de production audiovisuelle pour décrocher des missions cadreur/cameraman.

## Fichiers clés
- `JRV_V2.html` — Application complète (HTML/CSS/JS en un seul fichier)
- `vercel.json` — Config déploiement Vercel (pas de build, HTML direct)
- `package.json` + `vite.config.js` — Présents mais NON utilisés pour le déploiement

## Stack
- Frontend : HTML/CSS/JS vanilla (tout dans JRV_V2.html)
- Déploiement : Vercel (static, sans build)
- Base de données : Supabase Free (projet : emetgeoaoexrafyofimc)
- URL prod : https://jrv-v2.vercel.app
- GitHub : https://github.com/mdrtoto96-hash/jrv-v2

## Supabase
- URL : https://emetgeoaoexrafyofimc.supabase.co
- Anon key (JWT) : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXRnZW9hb2V4cmFmeW9maW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTAxNDMsImV4cCI6MjA5NTQyNjE0M30.nSHrbn3dcGXZH601rjte-9E4QbzR78yG2xCSXLkA06U
- Connexion : fetch direct (pas de SDK), headers apikey + Authorization Bearer
- RLS : DISABLED sur toutes les tables
- Table actuelle : `app_storage` (key/value pour localStorage sync cross-device)

## Données CRM
- 116 boîtes de prod (ids 1-120, sauf 37/52/53/118 supprimés)
- Champs : id, name, site, zone, p (priorité 0/1), contact, poste, canal, date, statut, notes, relance
- Statuts : a-contacter, contacte, reponse-positive, reponse-negative, rdv-pris, refuse, converti
- Zones : Nantes, Rennes, Bretagne, Captation Live Concert, + autres
- Actuellement stocké dans localStorage (clé: jrv_crm_v2)

## Design
- Noir et blanc — bg: #080808, accent: #ffffff
- Font : Inter (Google Fonts)
- Design pro et agréable, bonnes pratiques UI/UX obligatoires

## Règles importantes
- Ne JAMAIS push vers GitHub sans que Jeremy dise explicitement "push to main"
- Toujours tester en local (http://localhost:8080) avant de push
- Le dossier s'appelle "JRV production " (avec espace à la fin)

## Architecture Agents — Décisions techniques (V2 finale)

### Sécurité clé API
- Clé Anthropic (`sk-ant-...`) → JAMAIS dans le JS front-end
- Stockée dans `process.env.ANTHROPIC_API_KEY` (Vercel env vars)
- Proxy sécurisé : `/api/agent.js` (Vercel Serverless Function)
- Le front-end appelle `/api/agent` (même domaine, pas de fuite possible)

### Fichiers agents
- `api/agent.js` — Serverless Vercel, proxy API Anthropic, 3 system prompts
- `.env.example` — Template pour configurer la clé en local

### Agents implémentés
1. **🕵️ Sourcing** — Barre en haut du CRM, commande texte → JSON → Supabase (direct)
2. **✍️ Copywriter** — Bouton sur chaque ligne, side panel, message LinkedIn personnalisé
3. **📊 Tracker** — Carte dans le CRM, analyse stats → insights JSON

### Pour tester les agents en local
```
npm i -g vercel
vercel dev   # à la place de python3 -m http.server
# Site sur http://localhost:3000
```
Créer `.env.local` avec `ANTHROPIC_API_KEY=sk-ant-...`

### Mode terminal (sans clé API)
Le script `scripts/insert-companies.js` reste utilisable directement depuis Claude Code terminal.
Claude Code génère la liste JSON et l'insère sans passer par la clé API.

---

## Agent 1 — Scraper & Sourcing (via Claude Code terminal)

### Commande type
"Ajoute [N] boîtes de [secteur] à [ville] dans mon CRM"

### Secteurs gérés
- Production audiovisuelle
- Agence de communication
- Agence événementielle
- Captation live / concert
- Sport & Culture
- Médias / TV régionale
- Immobilier

### Script : `scripts/insert-companies.js`
- Prend un JSON array en argument ou stdin
- POST vers Supabase `companies` avec upsert (pas de doublons)
- Affiche le nombre de boîtes insérées

---

## Agent 2 — Copywriter LinkedIn (via Claude Code terminal)

### Commande type
"Génère-moi les messages LinkedIn pour les 10 dernières boîtes ajoutées"
"Génère un message pour [nom boîte]"

### Workflow
1. Claude fetch les boîtes depuis Supabase (ou prend les infos directement)
2. Génère un message LinkedIn personnalisé pour chacune
3. Présente les messages dans le terminal
4. Jeremy copie-colle sur LinkedIn

### Critères message JRV
- Accroche sur la spécialité de la boîte (captation live, événementiel, corporate...)
- Référence à une réalisation concrète de JRV si pertinent
- Proposition de collaboration / mission freelance
- Ton pro mais humain, 300-400 caractères max
- Pas de copier-coller générique

---

## Agent 3 — Workflow & Relances (100% JS dans le CRM)

### Fonctionnement (pas d'API, JS pur)
- Filtre : statut='message-envoye' AND date > 4 jours → liste "À relancer"
- Badge rouge dans sidebar si relances en attente
- Section "À relancer aujourd'hui" en haut du CRM
- Jeremy peut demander à Claude (terminal) de générer le message de relance

---

## Tables Supabase

### `app_storage`
Sync localStorage cross-device (notes, priorités, etc.)

### `companies`
Boîtes de prod. Champs : id, name, site, zone, priority, contact, poste, canal, date, statut, notes, relance, created_at, updated_at

---

## Script d'insertion Supabase
Fichier : `scripts/insert-companies.js`
Usage : `node scripts/insert-companies.js '[{...}]'`
