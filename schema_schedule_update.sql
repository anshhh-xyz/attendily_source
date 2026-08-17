-- Migration: Add day-wise attendance tracking columns to class_schedule
alter table class_schedule 
  add column if not exists attended int not null default 0,
  add column if not exists missed int not null default 0;
