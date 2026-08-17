create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('theory','lab')),
  min_attendance int not null default 75,
  attended int not null default 0,
  missed int not null default 0,
  notifications_enabled boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz default now()
);

alter table subjects enable row level security;

alter table subjects add column if not exists user_id uuid references auth.users default auth.uid();

create policy "select own" on subjects
  for select using (auth.uid() = user_id);
create policy "insert own" on subjects
  for insert with check (auth.uid() = user_id);
create policy "update own" on subjects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on subjects
  for delete using (auth.uid() = user_id);

create index if not exists subjects_user_id_idx on subjects(user_id);
