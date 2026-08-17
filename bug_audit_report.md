# 🔍 Attendily — Full Codebase Bug Audit

I've gone through **every file** in the project line by line. Below are the bugs I found, grouped by file. Each includes the **line number**, **what's wrong**, and **why it matters**.

---

## Bug 1 — `index.html` Line 3576: `log` variable is undefined (CRITICAL)

```javascript
// Line 3576
if (log.schedule_id) {
```

**Problem:** Inside `CONFIRM.resolve()`, the function parameters are `(logId, subjectId, status)`, but line 3576 references `log.schedule_id` — a variable named `log` that **does not exist in this scope**. The fetched log data from `checkConfirmParam()` (line 3545) was passed to `renderConfirmOverlay()` but **never stored** anywhere accessible to `CONFIRM.resolve()`.

**Impact:** When a user taps "Present" or "Absent" from a push notification deep-link (`?confirm=...`), **it will throw `ReferenceError: log is not defined`** and silently fail. The class_log row gets updated on the server (line 3572) but the **local attendance counters never update**, so the UI is out of sync.

**Fix:** Capture the log data in a closure variable (e.g. `var _pendingLog = null;`) and set it in `renderConfirmOverlay`, then use `_pendingLog.schedule_id` on line 3576.

---

## Bug 2 — `index.html` Line 2943: `prevSlotVal` may be undefined in catch block (MEDIUM)

```javascript
// Line 2941-2943
if (slotId) {
  var c = getSlotCounts(slotId);
  c[field] = prevSlotVal;  // ← prevSlotVal was declared inside the 'if (slotId)' above
```

**Problem:** `prevSlotVal` is declared on line 2921 inside the `if (slotId)` block, but due to JavaScript's `var` hoisting, it's hoisted to the function scope as `undefined` if the code took the `else` branch. However, this specific catch block is also inside `if (slotId)`, so it will only be reached if `prevSlotVal` was actually set. **This is technically safe** but fragile and confusing — a minor code quality issue rather than a runtime bug.

**Impact:** Low. The logic is correct as-is, but the structure is misleading.

---

## Bug 3 — `index.html` Line 2890: `loadSchedule()` called without `await` (MEDIUM)

```javascript
// Line 2890
loadSchedule();
```

**Problem:** After `submitAdd` finishes inserting a new subject + schedule rows, it calls `render()` then `loadSchedule()` without `await`. Since `loadSchedule()` calls `render()` internally (line 3135), the first `render()` on line 2889 will display stale schedule data. The new slots won't appear in the day tabs **until `loadSchedule()` eventually resolves** — causing a brief visual glitch where a newly-added class is invisible.

**Impact:** Visual flash/glitch after adding a subject. The class appears correctly after a moment.

**Fix:** Add `await` before `loadSchedule()` on line 2890, or move `render()` after `loadSchedule()`.

---

## Bug 4 — `index.html`: `initializeSlotCountsForSubjects` not called after schedule loads in `loadSchedule()` (MEDIUM)

```javascript
// Line 3125-3136 (loadSchedule)
async function loadSchedule() {
  ...
  schedule = res.data;
  ...
  renderSchedule();
  render();   // ← no initializeSlotCountsForSubjects() here!
}
```

**Problem:** `initializeSlotCountsForSubjects()` is called in `loadData()` (line 1931), but **not** in `loadSchedule()`. When the schedule is reloaded after editing or removing a class, new slots added via the edit modal won't get their `slotCounts` entries initialized. This means a newly-rescheduled slot's stepper will show `0/0` even if the subject has existing attendance.

**Impact:** After editing a class to a different day, the attendance counter for the new slot starts at 0 instead of carrying over.

**Fix:** Add `initializeSlotCountsForSubjects()` call after `schedule = res.data;` in `loadSchedule()`.

---

## Bug 5 — `index.html`: Notification muting is per-subject, not per-slot (DESIGN FLAW)

```javascript
// Line 2603
var isMuted = mutedSubjectIds.includes(s.id);
```

**Problem:** The mute/unmute notification toggle operates on the **subject ID**. If a subject (e.g., "Mathematics") appears on both Monday and Wednesday, muting it from the Monday card **also mutes** the Wednesday card. There's no way to mute notifications for a specific day only.

Additionally, the `toggleNotifForDay` function (line 2759) mutes *all subjects* on that day — but those same subjects on *other days* also get muted.

**Impact:** Users who want fine-grained "mute Monday's Math but keep Wednesday's Math" can't do so.

**Fix:** This would require switching `mutedSubjectIds` to `mutedSlotIds` (per schedule slot). This is a feature change, so I'm flagging it rather than auto-fixing.

---

## Bug 6 — `manifest.json` Line 9: Missing `icon-192.png` file (MEDIUM)

```json
{ "src": "icon-192.png", "sizes": "192x192", "type": "image/png" }
```

**Problem:** The manifest references `icon-192.png`, but this file **does not exist** in the project directory. Only `icon-512.png` is present. Browsers use `icon-192.png` as the primary PWA icon on home screens (especially Android).

**Impact:** PWA install may show a broken/missing icon on the home screen.

**Fix:** Either generate a 192x192 version of the icon, or update the manifest to only reference `icon-512.png`.

---

## Bug 7 — `sw.js` Line 21: `client.navigate()` before focus can cause issues (LOW)

```javascript
// Line 21
client.navigate(url);
return client.focus();
```

**Problem:** The service worker calls `client.navigate(url)` then immediately `client.focus()`. On some browsers/platforms, `navigate()` returns a promise and calling `focus()` before it resolves can cause the navigation to be lost. The spec recommends awaiting navigate before focusing.

**Impact:** Rare — notification click may occasionally fail to navigate to the correct URL.

**Fix:** Chain as `client.navigate(url).then(() => client.focus())`.

---

## Bug 8 — `index.html` Line 1360: Duplicate `html, body` CSS declaration (LOW)

```css
/* Line 48-53 */
html, body { margin: 0; padding: 0; background: var(--bg); }

/* Line 1360-1364 */
html, body { min-height: 100vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
```

**Problem:** There are two separate `html, body` rule blocks. While CSS handles duplicates by merging, this is confusing and could lead to accidental overrides during future edits.

**Impact:** No functional bug, but maintainability concern.

---

## Bug 9 — `index.html`: `showStatus` parameter `isError` is unused (LOW)

```javascript
// Line 1836
function showStatus(msg, isError) {
  // 'isError' is never used — banner always looks the same (red)
```

**Problem:** `showStatus` accepts an `isError` parameter but never uses it. Success messages (like "Class details updated successfully!") are rendered with the same red error styling as actual errors.

**Impact:** Success messages appear in red error banners, which is confusing to users.

**Fix:** Apply different styling based on `isError`.

---

## Bug 10 — `send-notifications/index.ts` Line 127: Missing CORS headers (LOW)

```typescript
return new Response("ok");
```

**Problem:** The edge function returns a plain `"ok"` without CORS headers. While this function is primarily called by pg_cron (not the browser), if it's ever invoked from the client side, it would fail CORS.

**Impact:** Only relevant if someone tries to invoke send-notifications from the browser. Currently benign since it's triggered server-side by pg_cron.

---

## Bug 11 — `vercel.json`: Build command uses shell echo with variable interpolation (LOW)

```json
"buildCommand": "echo \"window.SUPABASE_URL='$SUPABASE_URL';...\" > config.js"
```

**Problem:** If any of the environment variables contain single quotes, the generated `config.js` will have broken JavaScript syntax. This is unlikely with Supabase URLs/keys but is a latent vulnerability.

**Impact:** Extremely unlikely but could cause a broken deploy if env vars contain `'`.

---

## Summary

| # | File | Severity | Description |
|---|------|----------|-------------|
| **1** | `index.html:3576` | 🔴 CRITICAL | `log` is undefined in `CONFIRM.resolve()` — push notification attendance never updates locally |
| **3** | `index.html:2890` | 🟡 MEDIUM | `loadSchedule()` not awaited — new class briefly invisible after add |
| **4** | `index.html:loadSchedule()` | 🟡 MEDIUM | `initializeSlotCountsForSubjects()` missing after schedule reload |
| **6** | `manifest.json:9` | 🟡 MEDIUM | `icon-192.png` referenced but doesn't exist |
| **5** | `index.html` | 🟠 DESIGN | Notification muting is per-subject, not per-slot |
| **9** | `index.html:1836` | 🟢 LOW | `isError` param unused — success banners look like errors |
| **7** | `sw.js:21` | 🟢 LOW | `navigate()` + `focus()` should be chained |
| **8** | `index.html:1360` | 🟢 LOW | Duplicate `html, body` CSS rule |
| **10** | `send-notifications` | 🟢 LOW | Missing CORS headers (benign for server-to-server) |
| **11** | `vercel.json` | 🟢 LOW | Quote-unsafe build command |

---

> [!IMPORTANT]
> **Bug #1 is a real, user-facing crash.** When a user receives a push notification and taps "Present" or "Absent", the attendance update silently fails because `log` is referenced but never defined in that scope.

Would you like me to fix any of these? I'd recommend starting with **Bug #1** (critical) and **Bugs #3, #4, #6, #9** (medium/low but easy to fix).
