create table class_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users default auth.uid(),
  subject_id uuid references subjects(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);

alter table class_schedule enable row level security;

create policy "select own" on class_schedule
  for select using (auth.uid() = user_id);
create policy "insert own" on class_schedule
  for insert with check (auth.uid() = user_id);
create policy "update own" on class_schedule
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on class_schedule
  for delete using (auth.uid() = user_id);

create index class_schedule_user_day_idx on class_schedule(user_id, day_of_week);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_tokens enable row level security;

create policy "select own" on push_tokens
  for select using (auth.uid() = user_id);
create policy "insert own" on push_tokens
  for insert with check (auth.uid() = user_id);
create policy "delete own" on push_tokens
  for delete using (auth.uid() = user_id);

create table class_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users default auth.uid(),
  schedule_id uuid references class_schedule(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  class_date date not null,
  status text not null default 'pending' check (status in ('pending','present','absent','cancelled')),
  notified_at timestamptz,
  final_reminder_sent boolean default false,
  resolved_at timestamptz,
  unique(schedule_id, class_date)
);

alter table class_log enable row level security;

create policy "select own" on class_log
  for select using (auth.uid() = user_id);
create policy "insert own" on class_log
  for insert with check (auth.uid() = user_id);
create policy "update own" on class_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index class_log_user_date_idx on class_log(user_id, class_date);
create index class_log_status_idx on class_log(status);

select cron.schedule(
  'attendily-notify-classes',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
