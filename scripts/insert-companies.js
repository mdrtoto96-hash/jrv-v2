#!/usr/bin/env node
/**
 * Agent Scraper — Script d'insertion Supabase
 * Usage: node scripts/insert-companies.js '[{"name":"...","site":"...","zone":"...","notes":"..."}]'
 * Ou via pipe: echo '[...]' | node scripts/insert-companies.js
 */

const SB_URL = 'https://emetgeoaoexrafyofimc.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZXRnZW9hb2V4cmFmeW9maW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTAxNDMsImV4cCI6MjA5NTQyNjE0M30.nSHrbn3dcGXZH601rjte-9E4QbzR78yG2xCSXLkA06U';

const HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates,return=representation'
};

async function getMaxId() {
  const r = await fetch(`${SB_URL}/rest/v1/companies?select=id&order=id.desc&limit=1`, { headers: HEADERS });
  if (!r.ok) return 200;
  const data = await r.json();
  return data.length > 0 ? data[0].id : 200;
}

async function insertCompanies(companies) {
  let maxId = await getMaxId();

  const rows = companies.map((c, i) => ({
    id: maxId + i + 1,
    name: c.name,
    site: c.site || '',
    zone: c.zone || 'Autre',
    priority: c.priority || c.p || 0,
    contact: '',
    poste: '',
    canal: 'LinkedIn',
    date: '',
    statut: 'a-contacter',
    notes: c.notes || '',
    relance: '',
    updated_at: new Date().toISOString()
  }));

  const r = await fetch(`${SB_URL}/rest/v1/companies`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(rows)
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('Erreur Supabase:', r.status, err);
    process.exit(1);
  }

  const inserted = await r.json();
  console.log(`\n✓ ${inserted.length} boite(s) ajoutee(s) dans Supabase :\n`);
  inserted.forEach(c => console.log(`  [${c.id}] ${c.name} — ${c.zone}`));
  console.log('');
  return inserted;
}

async function main() {
  let input = '';

  if (process.argv[2]) {
    input = process.argv[2];
  } else {
    // Lire depuis stdin
    for await (const chunk of process.stdin) input += chunk;
  }

  if (!input.trim()) {
    console.error('Usage: node scripts/insert-companies.js \'[{"name":"...","site":"...","zone":"...","notes":"..."}]\'');
    process.exit(1);
  }

  let companies;
  try {
    companies = JSON.parse(input.trim());
    if (!Array.isArray(companies)) companies = [companies];
  } catch (e) {
    console.error('JSON invalide:', e.message);
    process.exit(1);
  }

  await insertCompanies(companies);
}

main().catch(e => { console.error(e); process.exit(1); });
