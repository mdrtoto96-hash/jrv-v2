-- Table CRM companies
create table if not exists crm_companies (
  id bigint primary key generated always as identity,
  legacy_id integer,
  name text not null,
  site text default '',
  zone text default '',
  p boolean default false,
  contact text default '',
  poste text default '',
  canal text default 'LinkedIn',
  date text default '',
  statut text default 'a-contacter',
  notes text default '',
  relance text default '',
  msg boolean default false,
  created_at timestamptz default now()
);

-- Sécurité : seulement les utilisateurs connectés peuvent lire/écrire
alter table crm_companies enable row level security;

create policy "Acces utilisateur connecte" on crm_companies
  for all using (auth.role() = 'authenticated');
