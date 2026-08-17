# Attendily — Attendance & Schedule Tracker

Attendily is a student attendance tracker and college timetable companion Progressive Web App (PWA).

## 📁 Project Structure

* **`index.html`** — Clean HTML layout and DOM mount points.
* **`style.css`** — Full design system, dark mode UI, animations, and responsive mobile layouts.
* **`app.js`** — Frontend application logic, state management, attendance calculations, conflict checks, and Supabase client integration.
* **`sw.js`** — Service Worker handling background Web Push notifications.
* **`manifest.json`** — PWA configuration for installable desktop & mobile app.
* **`schema-core.sql`** — Core PostgreSQL schema (`subjects` table, Row Level Security policies).
* **`schema-schedule.sql`** — Full timetable schema (`class_schedule`, `push_tokens`, `class_log`).
* **`schema_schedule_update.sql`** — Migration script adding day-wise slot attendance columns (`attended`, `missed`).
* **`supabase/functions/`**
  * `parse-timetable/` — Edge Function for parsing timetable photos using Gemini 3.5 Flash-Lite.
  * `send-notifications/` — Edge Function triggered by `pg_cron` for 5-minute pre-class push reminders.

## 🚀 Deployment
Deployed automatically to Vercel via Git integration.
