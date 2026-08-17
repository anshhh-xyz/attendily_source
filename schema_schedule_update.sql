-- Migration: Add day-wise attendance tracking columns to class_schedule
alter table class_schedule 
  add column if not exists attended int not null default 0,
  add column if not exists missed int not null default 0;

-- Migration: Add missing UPDATE policy for push_tokens (Fix Bug 1)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'push_tokens' and policyname = 'update own'
  ) then
    create policy "update own" on push_tokens
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
