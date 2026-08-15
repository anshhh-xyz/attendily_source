import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
const siteUrl = Deno.env.get("SITE_URL")!;

webpush.setVapidDetails("mailto:admin@" + new URL(siteUrl).hostname, vapidPublic, vapidPrivate);

const supabase = createClient(supabaseUrl, serviceRoleKey);

function nowInKolkata() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10),
    dayOfWeek: new Date(`${map.year}-${map.month}-${map.day}T00:00:00`).getDay()
  };
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

async function pushToUser(userId: string, payload: Record<string, unknown>) {
  const { data: tokens } = await supabase.from("push_tokens").select("*").eq("user_id", userId);
  console.log(`pushToUser ${userId}: found ${tokens?.length ?? 0} token(s)`);
  if (!tokens) return;
  for (const t of tokens) {
    const subscription = {
      endpoint: t.endpoint,
      keys: { p256dh: t.p256dh, auth: t.auth_key }
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`push sent OK to token ${t.id}`);
    } catch (e) {
      console.log(`push FAILED for token ${t.id}: status=${e.statusCode} message=${e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from("push_tokens").delete().eq("id", t.id);
      }
    }
  }
}

Deno.serve(async () => {
  const { date, minutes, dayOfWeek } = nowInKolkata();
  console.log(`run at ${date} minutes=${minutes} dayOfWeek=${dayOfWeek}`);

  const { data: upcoming, error: upcomingErr } = await supabase
    .from("class_schedule")
    .select("id, user_id, subject_id, start_time, end_time, subjects(name, type)")
    .eq("day_of_week", dayOfWeek);

  if (upcomingErr) console.log(`class_schedule query error: ${upcomingErr.message}`);
  console.log(`found ${upcoming?.length ?? 0} class_schedule row(s) for today`);

  for (const cls of upcoming ?? []) {
    const endMin = timeToMinutes(cls.end_time);
    console.log(`checking schedule ${cls.id}: end=${cls.end_time} (${endMin}min) vs now=${minutes}min, diff=${endMin - minutes}`);
    if (endMin - minutes !== 5) continue;

    const { data: existing } = await supabase
      .from("class_log")
      .select("id")
      .eq("schedule_id", cls.id)
      .eq("class_date", date)
      .maybeSingle();

    if (existing) { console.log(`already logged for ${cls.id} today, skipping`); continue; }

    const { data: log, error: insertErr } = await supabase
      .from("class_log")
      .insert({
        user_id: cls.user_id,
        schedule_id: cls.id,
        subject_id: cls.subject_id,
        class_date: date,
        notified_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) console.log(`class_log insert error: ${insertErr.message}`);

    if (log) {
      console.log(`matched! sending push for schedule ${cls.id} to user ${cls.user_id}`);
      await pushToUser(cls.user_id, {
        title: (cls as any).subjects?.name ?? "Class ending soon",
        body: "Ends in 5 minutes. Tap to mark your attendance.",
        url: `${siteUrl}/?confirm=${log.id}`
      });
    }
  }

  const { data: pending } = await supabase
    .from("class_log")
    .select("id, user_id, class_date, notified_at, subjects(name), class_schedule(end_time)")
    .eq("status", "pending")
    .eq("final_reminder_sent", false);

  console.log(`found ${pending?.length ?? 0} pending reminder candidate(s)`);

  for (const log of pending ?? []) {
    if (log.class_date !== date) continue;
    const endMin = timeToMinutes((log as any).class_schedule?.end_time ?? "23:59");
    if (minutes - endMin < 30) continue;

    console.log(`sending final reminder for class_log ${log.id}`);
    await pushToUser(log.user_id, {
      title: (log as any).subjects?.name ?? "Unmarked class",
      body: "Still unmarked — tap to record attendance.",
      url: `${siteUrl}/?confirm=${log.id}`
    });

    await supabase.from("class_log").update({ final_reminder_sent: true }).eq("id", log.id);
  }

  return new Response("ok");
});
