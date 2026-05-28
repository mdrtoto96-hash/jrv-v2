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

## Roadmap — 3 Agents à construire

### Agent 1 — Scraper
- Trouve des centaines de boîtes de prod sur le web
- Les injecte directement dans la table `companies` Supabase
- Déclenché en un clic depuis le CRM

### Agent 2 — Copywriter
- Bouton sur chaque fiche boîte dans le CRM
- Génère un message LinkedIn ultra-personnalisé basé sur :
  - Les infos de la boîte (site, zone, spécialité)
  - Les réussites et missions précédentes de JRV
  - Le style de message qui a bien marché

### Agent 3 — Workflow
- Gère les relances automatiquement selon le statut Supabase
- Rappels : relancer après X jours sans réponse
- Suivi pipeline visuel

## Prochaine étape immédiate
Migrer COMPANIES_DEFAULT (hardcodé dans HTML) vers table `companies` dans Supabase.
Cela permet d'ajouter/supprimer des boîtes sans toucher au code.

### SQL à créer dans Supabase :
```sql
create table if not exists public.companies (
  id serial primary key,
  name text not null,
  site text,
  zone text,
  priority int default 0,
  contact text default '',
  poste text default '',
  canal text default 'LinkedIn',
  date text default '',
  statut text default 'a-contacter',
  notes text default '',
  relance text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.companies disable row level security;
grant all on public.companies to anon;
grant usage, select on sequence public.companies_id_seq to anon;
```
