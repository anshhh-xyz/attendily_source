(function () {
      var SUPABASE_URL = window.SUPABASE_URL || '';
      var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

      var supabase = null;
      var configured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
      if (configured && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }

      var subjects = [];
      var schedule = [];
      var slotCounts = JSON.parse(localStorage.getItem('attendily_slot_counts') || '{}');
      var loaded = false;
      var showAdd = false;
      var addFormMode = 'global'; // 'global' or 'day'
      var addPresetDay = 1; // 1-6
      var activeDayTab = 1; // 1-6 (Default Mon)
      var currentUser = null;
      var firstRender = true;

      // Local storage for subject notification preferences
      var mutedSubjectIds = JSON.parse(localStorage.getItem('attendily_muted_subjects') || '[]');

      var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6 (Sunday completely removed from premade tabs)
      var DAY_ORDER = [1, 2, 3, 4, 5, 6];

      // Time picker state (12-hour format with AM/PM)
      var startHour12 = 9, startMin = 0, startAmpm = 'AM';
      var endHour12 = 10, endMin = 0, endAmpm = 'AM';

      var EYE_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
      var EYE_CLOSED = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

      var authMode = 'signin';
      var pwPanelOpen = false;

      // Helper function: Return only valid schedule entries whose subject exists in subjects list
      function validScheduleForDay(day) {
        return schedule.filter(function (c) {
          return c.day_of_week === day && subjects.some(function (s) { return s.id === c.subject_id; });
        });
      }

      function fieldWithEye(id, placeholder, autocomplete) {
        return (
          '<div class="field-wrap">' +
          '<input class="auth-input" type="password" id="' + id + '" placeholder="' + placeholder + '" autocomplete="' + autocomplete + '"/>' +
          '<button type="button" class="eye-btn" id="' + id + 'Eye" onclick="AUTH.toggleVisibility(\'' + id + '\')">' + EYE_OPEN + '</button>' +
          '</div>'
        );
      }

      function renderAuth() {
        var mount = document.getElementById('authCardMount');
        var brandBlock =
          '<div class="brand">' +
          '<div class="brand-mark-wrap">' +
          '<svg width="20" height="20" viewBox="0 0 30 30">' +
          '<circle cx="15" cy="15" r="11" fill="none" stroke="var(--line)" stroke-width="4.5"/>' +
          '<circle cx="15" cy="15" r="11" fill="none" stroke="var(--primary)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="50 69.1" transform="rotate(-90 15 15)"/>' +
          '</svg>' +
          '</div>' +
          '<div><div class="brand-word" style="font-size:19px; font-weight:800;">Attendily</div></div>' +
          '</div>';

        if (authMode === 'forgot') {
          mount.innerHTML =
            brandBlock +
            '<div class="auth-title">Reset password</div>' +
            '<p class="auth-sub">Enter your email and we\'ll send a reset link.</p>' +
            '<div id="authMsgMount"></div>' +
            '<input class="auth-input" type="email" id="authEmail" placeholder="Email address" autocomplete="email"/>' +
            '<button class="auth-submit" id="authSubmitBtn" onclick="AUTH.sendReset()">Send reset link</button>' +
            '<div class="auth-links"><button class="link-btn muted" onclick="AUTH.toggleMode(\'signin\')">&larr; Back to sign in</button></div>';
        } else if (authMode === 'reset') {
          mount.innerHTML =
            brandBlock +
            '<div class="auth-title">Set new password</div>' +
            '<p class="auth-sub">Choose a new password for your account.</p>' +
            '<div id="authMsgMount"></div>' +
            fieldWithEye('authNewPassword', 'New password', 'new-password') +
            fieldWithEye('authNewPassword2', 'Confirm new password', 'new-password') +
            '<button class="auth-submit" id="authSubmitBtn" onclick="AUTH.updatePassword()">Update password</button>';
        } else {
          var isSignup = authMode === 'signup';
          mount.innerHTML =
            brandBlock +
            '<div class="auth-title">' + (isSignup ? 'Create account' : 'Sign in') + '</div>' +
            '<p class="auth-sub">' + (isSignup ? 'Track attendance across all your devices.' : 'Use your email to access your schedule.') + '</p>' +
            '<div id="authMsgMount"></div>' +
            '<button class="auth-google-btn" id="googleSignInBtn" onclick="AUTH.signInWithGoogle()">' +
            '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>' +
            '<span>' + (isSignup ? 'Sign up with Google' : 'Sign in with Google') + '</span>' +
            '</button>' +
            '<div class="auth-divider"><span>or</span></div>' +
            '<input class="auth-input" type="email" id="authEmail" placeholder="Email address" autocomplete="email"/>' +
            fieldWithEye('authPassword', 'Password', isSignup ? 'new-password' : 'current-password') +
            '<button class="auth-submit" id="authSubmitBtn" onclick="AUTH.submit()">' + (isSignup ? 'Sign up' : 'Sign in') + '</button>' +
            '<div class="auth-links">' +
            '<button class="link-btn" onclick="AUTH.toggleMode(\'' + (isSignup ? 'signin' : 'signup') + '\')">' + (isSignup ? 'Already have an account? Sign in' : 'New here? Create account') + '</button>' +
            (isSignup ? '' : '<button class="link-btn muted" onclick="AUTH.toggleMode(\'forgot\')">Forgot password?</button>') +
            '</div>';
        }

        var pwField = document.getElementById('authPassword');
        if (pwField) pwField.addEventListener('keydown', function (e) { if (e.key === 'Enter') AUTH.submit(); });
        var emailField = document.getElementById('authEmail');
        if (emailField && authMode === 'forgot') emailField.addEventListener('keydown', function (e) { if (e.key === 'Enter') AUTH.sendReset(); });
      }

      function showAuthMsg(msg, kind) {
        var mount = document.getElementById('authMsgMount');
        if (!mount) return;
        if (!msg) { mount.innerHTML = ''; return; }
        mount.innerHTML = '<div class="auth-msg ' + (kind || 'error') + '">' + msg + '</div>';
      }

      window.AUTH = {
        signInWithGoogle: async function () {
          if (!configured) { showAuthMsg("Attendily isn't configured yet — check back shortly."); return; }
          var btn = document.getElementById('googleSignInBtn');
          if (btn) btn.disabled = true;
          showAuthMsg(null);
          try {
            var res = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin }
            });
            if (res.error) throw res.error;
          } catch (e) {
            showAuthMsg(e.message || 'Failed to sign in with Google.');
            if (btn) btn.disabled = false;
          }
        },

        toggleMode: function (mode) {
          authMode = mode;
          renderAuth();
        },

        toggleVisibility: function (id) {
          var input = document.getElementById(id);
          var btn = document.getElementById(id + 'Eye');
          if (!input || !btn) return;
          if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = EYE_CLOSED;
          } else {
            input.type = 'password';
            btn.innerHTML = EYE_OPEN;
          }
        },

        submit: async function () {
          if (!configured) { showAuthMsg("Attendily isn't configured yet — check back shortly."); return; }
          var email = document.getElementById('authEmail').value.trim();
          var password = document.getElementById('authPassword').value;
          if (!email || !password) { showAuthMsg('Enter both email and password.'); return; }

          var btn = document.getElementById('authSubmitBtn');
          var original = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span>';
          showAuthMsg(null);

          try {
            if (authMode === 'signup') {
              var res = await supabase.auth.signUp({ email: email, password: password });
              if (res.error) throw res.error;
              if (res.data.session) {
                onSignedIn(res.data.session.user);
              } else {
                showAuthMsg('Check your inbox to confirm your email, then sign in.', 'info');
                btn.disabled = false;
                btn.innerHTML = original;
              }
            } else {
              var res2 = await supabase.auth.signInWithPassword({ email: email, password: password });
              if (res2.error) throw res2.error;
              onSignedIn(res2.data.user);
            }
          } catch (e) {
            showAuthMsg(e.message || 'Something went wrong.');
            btn.disabled = false;
            btn.innerHTML = original;
          }
        },

        sendReset: async function () {
          if (!configured) { showAuthMsg("Attendily isn't configured yet — check back shortly."); return; }
          var email = document.getElementById('authEmail').value.trim();
          if (!email) { showAuthMsg('Enter your email first.'); return; }
          var btn = document.getElementById('authSubmitBtn');
          var original = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span>';
          try {
            var res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
            if (res.error) throw res.error;
            showAuthMsg('Reset link sent. Check your inbox.', 'info');
          } catch (e) {
            showAuthMsg(e.message || 'Something went wrong.');
          }
          btn.disabled = false;
          btn.innerHTML = original;
        },

        updatePassword: async function () {
          var p1 = document.getElementById('authNewPassword').value;
          var p2 = document.getElementById('authNewPassword2').value;
          if (!p1 || p1.length < 6) { showAuthMsg('Password must be at least 6 characters.'); return; }
          if (p1 !== p2) { showAuthMsg("Passwords don't match."); return; }
          var btn = document.getElementById('authSubmitBtn');
          var original = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span>';
          try {
            var res = await supabase.auth.updateUser({ password: p1 });
            if (res.error) throw res.error;
            onSignedIn(res.data.user);
          } catch (e) {
            showAuthMsg(e.message || 'Something went wrong.');
            btn.disabled = false;
            btn.innerHTML = original;
          }
        },

        togglePwPanel: function () {
          pwPanelOpen = !pwPanelOpen;
          renderPwPanel();
        },

        changePasswordInApp: async function () {
          var p1 = document.getElementById('appNewPassword').value;
          var p2 = document.getElementById('appNewPassword2').value;
          var mount = document.getElementById('appPwMsg');
          if (!p1 || p1.length < 6) { mount.innerHTML = '<div class="auth-msg error">Password must be at least 6 characters.</div>'; return; }
          if (p1 !== p2) { mount.innerHTML = "<div class=\"auth-msg error\">Passwords don't match.</div>"; return; }
          var btn = document.getElementById('appPwSubmit');
          var original = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span>';
          try {
            var res = await supabase.auth.updateUser({ password: p1 });
            if (res.error) throw res.error;
            mount.innerHTML = '<div class="auth-msg info">Password updated.</div>';
            setTimeout(function () { pwPanelOpen = false; renderPwPanel(); }, 1200);
          } catch (e) {
            mount.innerHTML = '<div class="auth-msg error">' + (e.message || 'Something went wrong.') + '</div>';
            btn.disabled = false;
            btn.innerHTML = original;
          }
        },

        signOut: async function () {
          if (configured) {
            try { await supabase.auth.signOut(); } catch (e) { }
          }
          currentUser = null;
          subjects = [];
          schedule = [];
          showAdd = false;
          pwPanelOpen = false;
          firstRender = true;
          activeDayTab = 1;
          document.getElementById('appShell').classList.add('hidden');
          document.getElementById('authShell').classList.remove('hidden');
          authMode = 'signin';
          renderAuth();
        }
      };

      function renderPwPanel() {
        var mount = document.getElementById('pwPanelMount');
        if (!pwPanelOpen) { mount.innerHTML = ''; return; }
        mount.innerHTML =
          '<div class="panel-form">' +
          '<div class="panel-form-head"><span>Change Password</span><button onclick="AUTH.togglePwPanel()">&#10005;</button></div>' +
          '<div id="appPwMsg"></div>' +
          fieldWithEyeApp('appNewPassword', 'New password') +
          fieldWithEyeApp('appNewPassword2', 'Confirm new password') +
          '<button class="submit-btn" id="appPwSubmit" onclick="AUTH.changePasswordInApp()">Update password</button>' +
          '</div>';
      }

      function fieldWithEyeApp(id, placeholder) {
        return (
          '<div class="field-wrap">' +
          '<input class="auth-input" type="password" id="' + id + '" placeholder="' + placeholder + '" autocomplete="new-password"/>' +
          '<button type="button" class="eye-btn" id="' + id + 'Eye" onclick="AUTH.toggleVisibility(\'' + id + '\')">' + EYE_OPEN + '</button>' +
          '</div>'
        );
      }

      async function onSignedIn(user) {
        currentUser = user;
        firstRender = true;
        document.getElementById('authShell').classList.add('hidden');
        document.getElementById('appShell').classList.remove('hidden');
        document.getElementById('userEmailLabel').textContent = user.email;

        // Set default active tab to current day (Mon-Sat, default to Mon if Sun)
        var todayIndex = new Date().getDay();
        activeDayTab = (todayIndex >= 1 && todayIndex <= 6) ? todayIndex : 1;

        await loadData();
        checkConfirmParam();
      }

      async function checkExistingSession() {
        if (!configured) {
          renderAuth();
          showAuthMsg("Attendily isn't configured yet — check back shortly.");
          return;
        }
        try {
          var res = await supabase.auth.getSession();
          if (res.data.session) {
            onSignedIn(res.data.session.user);
          } else {
            renderAuth();
          }
        } catch (e) {
          renderAuth();
        }
      }

      function showStatus(msg, isError) {
        var mount = document.getElementById('statusMount');
        if (!msg) { mount.innerHTML = ''; return; }
        var style = isError
          ? 'background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#ffffff;'
          : 'background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); color:var(--safe);';
        mount.innerHTML = '<div class="status-banner" style="' + style + '">' + msg + '</div>';
      }

      function rowToLocal(r) {
        return { id: r.id, name: r.name, type: r.type, min: r.min_attendance, attended: r.attended, missed: r.missed };
      }

      
      function saveSlotCounts() {
        localStorage.setItem('attendily_slot_counts', JSON.stringify(slotCounts));
      }

      function getSlotCounts(slotId) {
        if (!slotId) return null;
        var slot = schedule.find(function (x) { return x.id === slotId; });
        if (slot) {
          if (typeof slot.attended !== 'number') slot.attended = 0;
          if (typeof slot.missed !== 'number') slot.missed = 0;
          slotCounts[slotId] = { attended: slot.attended, missed: slot.missed };
          return slot;
        }
        if (!slotCounts[slotId]) {
          slotCounts[slotId] = { attended: 0, missed: 0 };
        }
        return slotCounts[slotId];
      }

      function syncSubjectAttendanceFromSlots(subjectId) {
        var s = subjects.find(function (x) { return x.id === subjectId; });
        if (!s) return;
        var sSlots = slotsForSubject(subjectId);
        if (sSlots.length > 0) {
          var totalAtt = 0;
          var totalMiss = 0;
          sSlots.forEach(function (slot) {
            var counts = getSlotCounts(slot.id);
            totalAtt += (counts.attended || 0);
            totalMiss += (counts.missed || 0);
          });
          s.attended = totalAtt;
          s.missed = totalMiss;
        }
      }

      function initializeSlotCountsForSubjects() {
        subjects.forEach(function (s) {
          var sSlots = slotsForSubject(s.id);
          if (sSlots.length === 0) return;

          // Check if slots already have counts in database
          var totalInSlots = sSlots.reduce(function (sum, slot) {
            return sum + (slot.attended || 0) + (slot.missed || 0);
          }, 0);

          if (totalInSlots > 0) {
            // Populate local cache from DB and sync totals
            sSlots.forEach(function (slot) {
              slotCounts[slot.id] = { attended: slot.attended || 0, missed: slot.missed || 0 };
            });
            syncSubjectAttendanceFromSlots(s.id);
          } else if ((s.attended || 0) + (s.missed || 0) > 0) {
            // First time migration: distribute existing subject attendance cleanly to slots
            if (sSlots.length === 1) {
              sSlots[0].attended = s.attended || 0;
              sSlots[0].missed = s.missed || 0;
              slotCounts[sSlots[0].id] = { attended: sSlots[0].attended, missed: sSlots[0].missed };
            } else {
              var baseAtt = Math.floor((s.attended || 0) / sSlots.length);
              var remAtt = (s.attended || 0) % sSlots.length;
              var baseMiss = Math.floor((s.missed || 0) / sSlots.length);
              var remMiss = (s.missed || 0) % sSlots.length;

              sSlots.forEach(function (slot, idx) {
                slot.attended = baseAtt + (idx < remAtt ? 1 : 0);
                slot.missed = baseMiss + (idx < remMiss ? 1 : 0);
                slotCounts[slot.id] = { attended: slot.attended, missed: slot.missed };
              });
            }
            // Save to DB in background
            sSlots.forEach(function (slot) {
              supabase.from('class_schedule').update({ attended: slot.attended, missed: slot.missed }).eq('id', slot.id).then(function () {});
            });
          } else {
            sSlots.forEach(function (slot) {
              if (typeof slot.attended !== 'number') slot.attended = 0;
              if (typeof slot.missed !== 'number') slot.missed = 0;
              slotCounts[slot.id] = { attended: 0, missed: 0 };
            });
          }
        });
        saveSlotCounts();
      }

      async function loadData() {
        try {
          var res = await supabase.from('subjects').select('*').order('created_at', { ascending: true });
          if (res.error) throw res.error;
          subjects = res.data.map(rowToLocal);
          showStatus(null);
        } catch (e) {
          showStatus("Couldn't reach the server: " + e.message, true);
        }
        try {
          var schedRes = await supabase.from('class_schedule').select('*, subjects(name,type)').order('day_of_week').order('start_time');
          if (schedRes.error) throw schedRes.error;
          schedule = schedRes.data;
        } catch (e) {
          schedule = [];
        }
        initializeSlotCountsForSubjects();
        loaded = true;
        render();
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function formatLocalDate(d) {
        var year = d.getFullYear();
        var month = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
        var day = (d.getDate() < 10 ? '0' : '') + d.getDate();
        return year + '-' + month + '-' + day;
      }

      function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

      function calc(attended, missed, min) {
        var total = attended + missed;
        if (total === 0) return { pct: null, total: 0, canMiss: null, mustAttend: null, status: 'empty' };
        var pct = (attended / total) * 100;
        if (min <= 0) {
          return { pct: pct, total: total, canMiss: Infinity, mustAttend: 0, status: 'safe' };
        }
        if (min >= 100) {
          if (missed > 0) return { pct: pct, total: total, canMiss: 0, mustAttend: Infinity, status: 'impossible' };
          return { pct: pct, total: total, canMiss: 0, mustAttend: 0, status: pct >= 100 ? 'safe' : 'impossible' };
        }
        if (pct >= min) {
          var canMiss = Math.floor((attended * 100 - min * total) / min);
          if (canMiss < 0) canMiss = 0;
          return { pct: pct, total: total, canMiss: canMiss, mustAttend: 0, status: canMiss === 0 ? 'warn' : 'safe' };
        } else {
          var mustAttend = Math.ceil((min * total - attended * 100) / (100 - min));
          return { pct: pct, total: total, canMiss: 0, mustAttend: mustAttend, status: 'danger' };
        }
      }

      function statusColor(status) {
        if (status === 'safe') return 'var(--safe)';
        if (status === 'warn') return 'var(--warn)';
        if (status === 'danger' || status === 'impossible') return 'var(--danger)';
        return 'var(--text-faint)';
      }

      function ringSVG(pct, min, size, stroke, big) {
        size = size || 76; stroke = stroke || 6;
        var r = (size - stroke) / 2;
        var c = 2 * Math.PI * r;
        var p = pct === null ? 0 : clamp(pct, 0, 100);
        var dash = (p / 100) * c;
        var ringColor = pct === null ? 'var(--line)' : (pct >= min ? 'var(--safe)' : (pct >= min - 10 ? 'var(--warn)' : 'var(--danger)'));
        var minFrac = clamp(min, 0, 100) / 100;
        var minAngle = minFrac * 360 - 90;
        var rad = minAngle * Math.PI / 180;
        var cx = size / 2, cy = size / 2;
        var tickInner = r - stroke / 2 - 1;
        var tickOuter = r + stroke / 2 + 2;
        var tx1 = cx + tickInner * Math.cos(rad), ty1 = cy + tickInner * Math.sin(rad);
        var tx2 = cx + tickOuter * Math.cos(rad), ty2 = cy + tickOuter * Math.sin(rad);

        var progressCircle = pct !== null ? (
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + ringColor + '" stroke-width="' + stroke + '" ' +
          'stroke-dasharray="' + dash + ' ' + (c - dash) + '" stroke-linecap="butt" transform="rotate(-90 ' + cx + ' ' + cy + ')" ' +
          'style="transition:stroke-dasharray .4s cubic-bezier(.16,1,.3,1), stroke .3s ease"/>'
        ) : '';

        return (
          '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="overflow:visible;flex-shrink:0;">' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="' + stroke + '"/>' +
          progressCircle +
          '<line x1="' + tx1 + '" y1="' + ty1 + '" x2="' + tx2 + '" y2="' + ty2 + '" stroke="var(--text-faint)" stroke-width="1.2"/>' +
          '</svg>'
        );
      }

      function ringWithLabel(pct, min, size, stroke, big) {
        var numSize = big ? 20 : 14;
        var lblSize = big ? 9 : 7.5;
        var numText = pct === null ? '—' : Math.round(pct);
        return (
          '<div class="ring-wrap">' +
          ringSVG(pct, min, size, stroke, big) +
          '<div class="ring-num">' +
          '<span class="n" style="font-size:' + numSize + 'px;">' + numText + '</span>' +
          (pct !== null ? '<span class="l" style="font-size:' + lblSize + 'px;">PCT</span>' : '') +
          '</div>' +
          '</div>'
        );
      }

      var showEditModal = false;
      var editSlotId = null;
      var editSubjectId = null;
      var editFormType = 'theory';
      var editStartHour12 = 9, editStartMin = 0, editStartAmpm = 'AM';
      var editEndHour12 = 10, editEndMin = 0, editEndAmpm = 'AM';

      function parse24To12(timeStr) {
        if (!timeStr) return { hour12: 9, min: 0, ampm: 'AM' };
        var parts = timeStr.split(':');
        var h = parseInt(parts[0], 10) || 0;
        var m = parseInt(parts[1], 10) || 0;
        var ampm = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return { hour12: h12, min: m, ampm: ampm };
      }

      function updateEditAmpmUI() {
        var sAm = document.getElementById('editStartAmBtn');
        var sPm = document.getElementById('editStartPmBtn');
        var eAm = document.getElementById('editEndAmBtn');
        var ePm = document.getElementById('editEndPmBtn');
        if (sAm) sAm.classList.toggle('active', editStartAmpm === 'AM');
        if (sPm) sPm.classList.toggle('active', editStartAmpm === 'PM');
        if (eAm) eAm.classList.toggle('active', editEndAmpm === 'AM');
        if (ePm) ePm.classList.toggle('active', editEndAmpm === 'PM');
        calculateEditDuration();
      }
      window.updateEditAmpmUI = updateEditAmpmUI;

      function calculateEditDuration() {
        var shEl = document.getElementById('editStartHourSelect');
        var smEl = document.getElementById('editStartMinInput');
        var ehEl = document.getElementById('editEndHourSelect');
        var emEl = document.getElementById('editEndMinInput');
        var badgeEl = document.getElementById('editTimeDurationBadge');
        if (!shEl || !smEl || !ehEl || !emEl || !badgeEl) return;

        var sh12 = parseInt(shEl.value, 10);
        var sm = parseInt(smEl.value, 10) || 0;
        var eh12 = parseInt(ehEl.value, 10);
        var em = parseInt(emEl.value, 10) || 0;

        if (sm >= 60) sm = 59;
        if (em >= 60) em = 59;

        var startTime24 = format24Time(sh12, sm, editStartAmpm);
        var endTime24 = format24Time(eh12, em, editEndAmpm);

        var sTotal = parseInt(startTime24.split(':')[0], 10) * 60 + parseInt(startTime24.split(':')[1], 10);
        var eTotal = parseInt(endTime24.split(':')[0], 10) * 60 + parseInt(endTime24.split(':')[1], 10);
        var diff = eTotal - sTotal;

        if (diff <= 0) { badgeEl.textContent = 'Invalid duration'; return; }
        var hrs = Math.floor(diff / 60);
        var mins = diff % 60;
        badgeEl.textContent = (hrs > 0 ? hrs + 'h ' : '') + (mins > 0 ? mins + 'm' : (hrs === 0 ? '0m' : ''));
      }
      window.calculateEditDuration = calculateEditDuration;

      function renderEditModal() {
        var mount = document.getElementById('editModalMount');
        if (!mount) return;
        if (!showEditModal) { mount.innerHTML = ''; return; }

        var s = subjects.find(function (x) { return x.id === editSubjectId; });
        var slot = schedule.find(function (x) { return x.id === editSlotId; });
        if (!s || !slot) { mount.innerHTML = ''; return; }

        var hourOptionsStart = '';
        var hourOptionsEnd = '';
        for (var h = 1; h <= 12; h++) {
          hourOptionsStart += '<option value="' + h + '" ' + (h === editStartHour12 ? 'selected' : '') + '>' + (h < 10 ? '0' + h : h) + '</option>';
          hourOptionsEnd += '<option value="' + h + '" ' + (h === editEndHour12 ? 'selected' : '') + '>' + (h < 10 ? '0' + h : h) + '</option>';
        }

        var dayOptions = DAY_ORDER.map(function (d) {
          return '<option value="' + d + '" ' + (d === slot.day_of_week ? 'selected' : '') + '>' + DAY_FULL_NAMES[d] + '</option>';
        }).join('');

        var startMinFormatted = (editStartMin < 10 ? '0' : '') + editStartMin;
        var endMinFormatted = (editEndMin < 10 ? '0' : '') + editEndMin;
        var isMuted = mutedSubjectIds.includes(s.id);

        mount.innerHTML =
          '<div class="modal-overlay" onclick="if(event.target===this) AT.closeEditModal()">' +
          '<div class="modal-card">' +
          '<div class="panel-form-head"><span>Edit Class</span><button onclick="AT.closeEditModal()">&#10005;</button></div>' +
          '<div style="font-size:11.5px; font-weight:400; color:var(--primary); background:rgba(59,130,246,0.1); padding:7px 10px; border:1px solid rgba(59,130,246,0.3); margin-top:6px;">' +
          'Editing details for <b>' + escapeHtml(s.name) + '</b>' +
          '</div>' +
          '<div style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">' +
          '<div>' +
          '<label style="font-size:11.5px; color:var(--text-dim); display:block; margin-bottom:4px;">Subject Name</label>' +
          '<input type="text" id="editSubjectName" value="' + s.name.replace(/"/g, '&quot;') + '" maxlength="40"/>' +
          '</div>' +
          '<div class="type-row">' +
          '<button type="button" class="type-btn ' + (editFormType === 'theory' ? 'active' : '') + '" onclick="editFormType=\'theory\'; renderEditModal();">Theory</button>' +
          '<button type="button" class="type-btn ' + (editFormType === 'lab' ? 'active' : '') + '" onclick="editFormType=\'lab\'; renderEditModal();">Lab</button>' +
          '</div>' +
          '<div class="minrow" style="border-top:none; padding-top:0;">' +
          '<span class="lbl">Required Attendance %</span>' +
          '<div class="mininput-wrap"><input class="mininput" type="number" id="editSubjectMin" min="0" max="100" value="' + s.min + '"/><span class="pct-sign">%</span></div>' +
          '</div>' +
          '<div>' +
          '<label style="font-size:11.5px; color:var(--text-dim); display:block; margin-bottom:4px;">Scheduled Day</label>' +
          '<select class="time-select" id="editClassDay" style="width:100%; padding:8px;">' + dayOptions + '</select>' +
          '</div>' +
          '<div class="time-picker-box">' +
          '<div class="time-picker-title"><span>Interactive Class Timing</span><span class="time-duration-badge" id="editTimeDurationBadge">1h 0m</span></div>' +
          '<div class="time-block">' +
          '<span class="time-block-label">Start</span>' +
          '<select class="time-select" id="editStartHourSelect" onchange="calculateEditDuration()">' + hourOptionsStart + '</select>' +
          '<span style="color:var(--text-dim); font-weight:500;">:</span>' +
          '<input type="number" class="time-input-num" id="editStartMinInput" min="0" max="59" value="' + startMinFormatted + '" oninput="validateMinuteInput(this); calculateEditDuration();" onblur="formatMinutePadding(this); calculateEditDuration();"/>' +
          '<div class="ampm-toggle">' +
          '<button type="button" class="ampm-btn ' + (editStartAmpm === 'AM' ? 'active' : '') + '" id="editStartAmBtn" onclick="editStartAmpm=\'AM\'; updateEditAmpmUI();">AM</button>' +
          '<button type="button" class="ampm-btn ' + (editStartAmpm === 'PM' ? 'active' : '') + '" id="editStartPmBtn" onclick="editStartAmpm=\'PM\'; updateEditAmpmUI();">PM</button>' +
          '</div>' +
          '</div>' +
          '<div class="time-block">' +
          '<span class="time-block-label">End</span>' +
          '<select class="time-select" id="editEndHourSelect" onchange="calculateEditDuration()">' + hourOptionsEnd + '</select>' +
          '<span style="color:var(--text-dim); font-weight:500;">:</span>' +
          '<input type="number" class="time-input-num" id="editEndMinInput" min="0" max="59" value="' + endMinFormatted + '" oninput="validateMinuteInput(this); calculateEditDuration();" onblur="formatMinutePadding(this); calculateEditDuration();"/>' +
          '<div class="ampm-toggle">' +
          '<button type="button" class="ampm-btn ' + (editEndAmpm === 'AM' ? 'active' : '') + '" id="editEndAmBtn" onclick="editEndAmpm=\'AM\'; updateEditAmpmUI();">AM</button>' +
          '<button type="button" class="ampm-btn ' + (editEndAmpm === 'PM' ? 'active' : '') + '" id="editEndPmBtn" onclick="editEndAmpm=\'PM\'; updateEditAmpmUI();">PM</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<label style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-dim); cursor:pointer; background:var(--panel-2); padding:9px; border:1px solid var(--line);">' +
          '<input type="checkbox" id="editSubjectEnableNotif" ' + (!isMuted ? 'checked' : '') + '/> Enable Push Notifications for this class' +
          '</label>' +
          '<div style="display:flex; gap:8px; margin-top:4px;">' +
          '<button class="ghost-btn" style="flex:1; padding:10px 0;" onclick="AT.closeEditModal()">Cancel</button>' +
          '<button class="submit-btn" style="flex:2; margin-top:0;" onclick="AT.submitEditClass()">Save Changes</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';

        calculateEditDuration();
      }

      function render() {
        renderOverall();
        renderDaysNav();
        renderDayActionBar();
        renderAddForm();
        renderEditModal();
        renderMain();
        firstRender = false;
      }

      function renderOverall() {
        var withData = subjects.filter(function (s) { return (s.attended + s.missed) > 0; });
        var totalAttended = subjects.reduce(function (a, s) { return a + s.attended; }, 0);
        var totalClasses = subjects.reduce(function (a, s) { return a + s.attended + s.missed; }, 0);
        var overallPct = totalClasses > 0 ? (totalAttended / totalClasses) * 100 : null;
        var avgMin = subjects.length ? subjects.reduce(function (a, s) { return a + s.min; }, 0) / subjects.length : 75;

        var mainText = overallPct === null
          ? 'No classes logged yet'
          : overallPct.toFixed(1) + '% overall attendance (' + totalAttended + '/' + totalClasses + ' classes attended)';

        document.getElementById('overallCard').innerHTML =
          ringWithLabel(overallPct, avgMin, 80, 6, true) +
          '<div class="overall-text">' +
          '<span class="overall-label">OVERALL ATTENDANCE</span>' +
          '<span class="overall-main">' + mainText + '</span>' +
          '<span class="overall-sub">' + totalAttended + ' / ' + totalClasses + ' classes attended</span>' +
          '</div>';
      }

      function selectDayTab(day) {
        activeDayTab = day;
        if (showAdd && addFormMode === 'day') {
          addPresetDay = day;
        }
        render();
      }
      window.selectDayTab = selectDayTab;

      function updatePillNavIndicator() {
        var mount = document.getElementById('daysNavMount');
        var indicator = document.getElementById('pillNavIndicator');
        if (!mount || !indicator) return;
        var activeBtn = mount.querySelector('.day-tab.active');
        if (!activeBtn) return;

        var targetLeft = activeBtn.offsetLeft;
        var targetWidth = activeBtn.offsetWidth;

        if (window.gsap) {
          gsap.to(indicator, {
            left: targetLeft,
            width: targetWidth,
            duration: 0.35,
            ease: "power2.out"
          });
        } else {
          indicator.style.left = targetLeft + 'px';
          indicator.style.width = targetWidth + 'px';
        }
      }

      function renderDaysNav() {
        var mount = document.getElementById('daysNavMount');
        var html = '<div class="pill-nav-wrap">' +
          '<div class="pill-indicator" id="pillNavIndicator"></div>';

        // Mon - Sat Tabs Only
        DAY_ORDER.forEach(function (day) {
          var count = validScheduleForDay(day).length;
          var isActive = activeDayTab === day;
          html += '<button class="day-tab ' + (isActive ? 'active' : '') + '" onclick="selectDayTab(' + day + ')">' +
            '<span>' + DAY_NAMES[day] + '</span>' +
            '<span class="day-badge">' + count + '</span>' +
            '</button>';
        });

        html += '</div>';
        mount.innerHTML = html;
        setTimeout(updatePillNavIndicator, 20);
      }

      function renderDayActionBar() {
        var mount = document.getElementById('dayActionBarMount');
        var dayName = DAY_FULL_NAMES[activeDayTab];
        var daySlots = validScheduleForDay(activeDayTab);
        var daySubjectIds = daySlots.map(function (s) { return s.subject_id; });

        var allDayNotifsMuted = daySubjectIds.length > 0 && daySubjectIds.every(function (id) { return mutedSubjectIds.includes(id); });

        mount.innerHTML =
          '<div class="day-action-bar">' +
          '<div class="day-action-title">' + dayName + '\'s Schedule (' + daySlots.length + ' class' + (daySlots.length !== 1 ? 'es' : '') + ')</div>' +
          '<div style="display:flex; gap:8px;">' +
          '<button class="ghost-btn" onclick="AT.toggleNotifForDay(' + activeDayTab + ')">' + (allDayNotifsMuted ? 'Enable Day Notifs' : 'Mute Day Notifs') + '</button>' +
          '<button class="addbtn primary-action" onclick="toggleAddForm(\'day\', ' + activeDayTab + ')">+ Add subject to ' + DAY_NAMES[activeDayTab] + '</button>' +
          '</div>' +
          '</div>';
      }

      var addFormType = 'theory';

      function toggleAddForm(mode, targetDay) {
        if (mode === null || mode === undefined || typeof mode === 'number') {
          if (typeof mode === 'number') {
            targetDay = mode;
            mode = 'day';
          } else {
            mode = 'global';
          }
        }

        var reqDay = (targetDay !== null && targetDay !== undefined) ? targetDay : activeDayTab;

        if (showAdd && addFormMode === mode && (mode === 'global' || addPresetDay === reqDay)) {
          showAdd = false;
        } else {
          showAdd = true;
          addFormMode = mode;
          addPresetDay = reqDay;
        }
        render();
      }
      window.toggleAddForm = toggleAddForm;

      // 12-Hour AM/PM Helper
      function format24Time(hour12, minute, ampm) {
        var h = parseInt(hour12, 10);
        var m = parseInt(minute, 10);
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
      }

      function updateStartAmpm(val) {
        startAmpm = val;
        document.getElementById('startAmBtn').classList.toggle('active', val === 'AM');
        document.getElementById('startPmBtn').classList.toggle('active', val === 'PM');
        calculateDuration();
      }
      window.updateStartAmpm = updateStartAmpm;

      function updateEndAmpm(val) {
        endAmpm = val;
        document.getElementById('endAmBtn').classList.toggle('active', val === 'AM');
        document.getElementById('endPmBtn').classList.toggle('active', val === 'PM');
        calculateDuration();
      }
      window.updateEndAmpm = updateEndAmpm;

      function validateMinuteInput(el) {
        var val = parseInt(el.value, 10);
        if (isNaN(val)) { calculateDuration(); return; }
        if (val >= 60) {
          el.value = 59;
        } else if (val < 0) {
          el.value = 0;
        }
        calculateDuration();
      }
      window.validateMinuteInput = validateMinuteInput;

      function formatMinutePadding(el) {
        var val = parseInt(el.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        if (val >= 60) val = 59;
        el.value = (val < 10 ? '0' : '') + val;
        calculateDuration();
      }
      window.formatMinutePadding = formatMinutePadding;

      function calculateDuration() {
        var shEl = document.getElementById('startHourSelect');
        var smEl = document.getElementById('startMinInput');
        var ehEl = document.getElementById('endHourSelect');
        var emEl = document.getElementById('endMinInput');
        var badgeEl = document.getElementById('timeDurationBadge');
        if (!shEl || !smEl || !ehEl || !emEl || !badgeEl) return;

        startHour12 = parseInt(shEl.value, 10);
        startMin = parseInt(smEl.value, 10) || 0;
        endHour12 = parseInt(ehEl.value, 10);
        endMin = parseInt(emEl.value, 10) || 0;

        if (startMin >= 60) { startMin = 59; smEl.value = '59'; }
        if (endMin >= 60) { endMin = 59; emEl.value = '59'; }

        var startTime24 = format24Time(startHour12, startMin, startAmpm);
        var endTime24 = format24Time(endHour12, endMin, endAmpm);

        var sTotal = parseInt(startTime24.split(':')[0], 10) * 60 + parseInt(startTime24.split(':')[1], 10);
        var eTotal = parseInt(endTime24.split(':')[0], 10) * 60 + parseInt(endTime24.split(':')[1], 10);
        var diff = eTotal - sTotal;

        if (diff <= 0) { badgeEl.textContent = 'Invalid duration'; return; }
        var hrs = Math.floor(diff / 60);
        var mins = diff % 60;
        badgeEl.textContent = (hrs > 0 ? hrs + 'h ' : '') + (mins > 0 ? mins + 'm' : (hrs === 0 ? '0m' : ''));
      }
      window.calculateDuration = calculateDuration;

      function toggleCheckAllDays(selectAll) {
        var checkboxes = document.querySelectorAll('.day-checkbox');
        checkboxes.forEach(function (cb) {
          cb.checked = selectAll;
          var parent = cb.closest('.day-check-item');
          if (parent) parent.classList.toggle('checked', selectAll);
        });
      }
      window.toggleCheckAllDays = toggleCheckAllDays;

      function updateDayCheckStyle(cb) {
        var parent = cb.closest('.day-check-item');
        if (parent) parent.classList.toggle('checked', cb.checked);
      }
      window.updateDayCheckStyle = updateDayCheckStyle;



      function initMagicBentoSpotlight() {
        var bentoGrid = document.querySelector('.magic-bento-grid');
        if (!bentoGrid) return;

        bentoGrid.addEventListener('mousemove', function (e) {
          var cards = bentoGrid.querySelectorAll('.bento-card');
          cards.forEach(function (card) {
            var rect = card.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', x + 'px');
            card.style.setProperty('--mouse-y', y + 'px');
          });
        });

        var bentoCards = bentoGrid.querySelectorAll('.bento-card');
        bentoCards.forEach(function (card) {
          card.addEventListener('click', function () {
            if (window.gsap) {
              gsap.fromTo(card, { scale: 0.98 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
            }
          });
        });
      }

      function animateBentoStars() {
        if (!window.gsap) return;
        var stars = document.querySelectorAll('.bento-star');
        stars.forEach(function (star) {
          gsap.to(star, {
            opacity: "random(0.15, 0.85)",
            y: "random(-8, 8)",
            x: "random(-6, 6)",
            duration: "random(2.5, 4.5)",
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
          });
        });
      }

      function animateMobileList() {
        if (!window.gsap) return;
        var items = document.querySelectorAll('.animated-list-item');
        if (items.length) {
          gsap.fromTo(items,
            { opacity: 0, y: 25, scale: 0.96 },
            { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.06, ease: "power2.out" }
          );
        }
      }

      function renderAddForm() {
        var mount = document.getElementById('addFormMount');
        var addBtn = document.getElementById('addToggleBtn');

        if (!showAdd) {
          mount.innerHTML = '';
          if (addBtn) addBtn.classList.remove('active');
          return;
        }

        if (addBtn) addBtn.classList.add('active');

        var targetDay = addPresetDay || activeDayTab;
        var isGlobalMode = addFormMode === 'global';

        var headerTitle = isGlobalMode
          ? 'Add Subject (Schedule Across Days)'
          : 'Add Subject to ' + DAY_FULL_NAMES[targetDay];

        var modeNotice = isGlobalMode
          ? '<div style="font-size:11.5px; font-weight:400; color:var(--primary); background:rgba(59,130,246,0.1); padding:7px 10px; border:1px solid rgba(59,130,246,0.3);">' +
          'Multi-Day Mode: Check the days to schedule this class across your week.' +
          '</div>'
          : '<div style="font-size:11.5px; font-weight:400; color:var(--orange); background:rgba(249,115,22,0.1); padding:7px 10px; border:1px solid rgba(249,115,22,0.3);">' +
          'Day-Specific Mode: Adding class exclusively to ' + DAY_FULL_NAMES[targetDay] + '.' +
          '</div>';

        // Render Day Checklist Grid ONLY for Global Add Subject Mode
        var dayChecklistSection = '';
        if (isGlobalMode) {
          var dayChecklistHTML = DAY_ORDER.map(function (d) {
            var isChecked = (d === targetDay);
            return (
              '<label class="day-check-item ' + (isChecked ? 'checked' : '') + '">' +
              '<input type="checkbox" class="day-checkbox" value="' + d + '" ' + (isChecked ? 'checked' : '') + ' onchange="updateDayCheckStyle(this)"/>' +
              '<span>' + DAY_NAMES[d] + '</span>' +
              '</label>'
            );
          }).join('');

          dayChecklistSection =
            '<div class="days-checklist-box">' +
            '<div class="days-checklist-header">' +
            '<span>Schedule Days</span>' +
            '<div style="display:flex; gap:6px;">' +
            '<button type="button" class="link-btn" onclick="toggleCheckAllDays(true)">Select All</button>' +
            '<span style="color:var(--line);">|</span>' +
            '<button type="button" class="link-btn muted" onclick="toggleCheckAllDays(false)">Clear</button>' +
            '</div>' +
            '</div>' +
            '<div class="days-checklist-grid">' + dayChecklistHTML + '</div>' +
            '</div>';
        }

        // 12-Hour options (1 to 12)
        var hourOptions = '';
        for (var h = 1; h <= 12; h++) {
          hourOptions += '<option value="' + h + '" ' + (h === 9 ? 'selected' : '') + '>' + (h < 10 ? '0' + h : h) + '</option>';
        }

        // Minute options (00, 15, 30, 45)
        var minOptions = '<option value="0" selected>00</option>' +
          '<option value="15">15</option>' +
          '<option value="30">30</option>' +
          '<option value="45">45</option>';

        mount.innerHTML =
          '<div class="panel-form">' +
          '<div class="panel-form-head"><span>' + headerTitle + '</span><button onclick="AT.closeAdd()">&#10005;</button></div>' +
          modeNotice +
          '<input type="text" id="newSubjectName" placeholder="Subject name (e.g. Mathematics)" maxlength="40"/>' +
          '<div class="type-row">' +
          '<button type="button" class="type-btn ' + (addFormType === 'theory' ? 'active' : '') + '" onclick="AT.setType(\'theory\')">Theory</button>' +
          '<button type="button" class="type-btn ' + (addFormType === 'lab' ? 'active' : '') + '" onclick="AT.setType(\'lab\')">Lab</button>' +
          '</div>' +
          '<div class="minrow" style="border-top:none; padding-top:0;">' +
          '<span class="lbl">Required Attendance</span>' +
          '<div class="mininput-wrap"><input class="mininput" type="number" id="newSubjectMin" min="0" max="100" value="75"/><span class="pct-sign">%</span></div>' +
          '</div>' +
          '<div id="newSubjectTimeFields" style="display:flex; flex-direction:column; gap:10px;">' +
          dayChecklistSection +
          '<div class="time-picker-box">' +
          '<div class="time-picker-title"><span>Interactive Class Timing</span><span class="time-duration-badge" id="timeDurationBadge">1h 0m</span></div>' +
          '<div class="time-block">' +
          '<span class="time-block-label">Start</span>' +
          '<select class="time-select" id="startHourSelect" onchange="calculateDuration()">' + hourOptions + '</select>' +
          '<span style="color:var(--text-dim); font-weight:500;">:</span>' +
          '<input type="number" class="time-input-num" id="startMinInput" min="0" max="59" value="00" placeholder="00" oninput="validateMinuteInput(this)" onblur="formatMinutePadding(this)"/>' +
          '<div class="ampm-toggle">' +
          '<button type="button" class="ampm-btn active" id="startAmBtn" onclick="updateStartAmpm(\'AM\')">AM</button>' +
          '<button type="button" class="ampm-btn" id="startPmBtn" onclick="updateStartAmpm(\'PM\')">PM</button>' +
          '</div>' +
          '</div>' +
          '<div class="time-block">' +
          '<span class="time-block-label">End</span>' +
          '<select class="time-select" id="endHourSelect" onchange="calculateDuration()">' + hourOptions.replace('value="9" selected', 'value="9"').replace('value="10"', 'value="10" selected') + '</select>' +
          '<span style="color:var(--text-dim); font-weight:500;">:</span>' +
          '<input type="number" class="time-input-num" id="endMinInput" min="0" max="59" value="00" placeholder="00" oninput="validateMinuteInput(this)" onblur="formatMinutePadding(this)"/>' +
          '<div class="ampm-toggle">' +
          '<button type="button" class="ampm-btn active" id="endAmBtn" onclick="updateEndAmpm(\'AM\')">AM</button>' +
          '<button type="button" class="ampm-btn" id="endPmBtn" onclick="updateEndAmpm(\'PM\')">PM</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<label style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-dim); cursor:pointer; background:var(--panel-2); padding:9px; border:1px solid var(--line);">' +
          '<input type="checkbox" id="newSubjectEnableNotif" checked/> Enable Push Notifications for this class' +
          '</label>' +
          '<button class="submit-btn" onclick="AT.submitAdd()">Save Subject</button>' +
          '</div>';

        var nameInput = document.getElementById('newSubjectName');
        if (nameInput) {
          nameInput.focus();
          nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') AT.submitAdd(); });
        }
        calculateDuration();
      }

      function slotsForSubject(subjectId) {
        return schedule.filter(function (c) { return c.subject_id === subjectId; })
          .sort(function (a, b) { return a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time); });
      }

      function slotLabel(slot) {
        return DAY_NAMES[slot.day_of_week] + ' ' + slot.start_time.slice(0, 5) + '\u2013' + slot.end_time.slice(0, 5);
      }

      function renderMain() {
        var mount = document.getElementById('mainMount');
        if (subjects.length === 0) {
          mount.innerHTML = showAdd ? '' : '<div class="empty">No subjects added yet. Click "+ Add subject to ' + DAY_NAMES[activeDayTab] + '" to start.</div>';
          return;
        }

        var cardIndex = 0;
        var html = '';

        // Show subjects scheduled on activeDayTab
        var daySlots = validScheduleForDay(activeDayTab).sort(function (a, b) { return a.start_time.localeCompare(b.start_time); });

        if (daySlots.length === 0) {
          html = '<div class="empty">' +
            '<div style="font-size:14.5px; font-weight:600; color:var(--text); margin-bottom:4px;">No classes scheduled for ' + DAY_FULL_NAMES[activeDayTab] + '</div>' +
            '<div style="margin-bottom:14px; font-size:12.5px;">Click below to add a class for this day.</div>' +
            '<button class="addbtn primary-action" onclick="toggleAddForm(\'day\', ' + activeDayTab + ')">+ Add subject to ' + DAY_NAMES[activeDayTab] + '</button>' +
            '</div>';
        } else {
          html = '<div class="grid">';
          daySlots.forEach(function (slot) {
            var s = subjects.find(function (x) { return x.id === slot.subject_id; });
            if (!s) return;
            html += cardHTML(s, cardIndex++, slotLabel(slot), slot);
          });
          html += '</div>';
        }

        mount.innerHTML = html;
      }

      function cardHTML(s, i, slotText, slot) {
        var r = calc(s.attended, s.missed, s.min);
        var color = statusColor(r.status);
        var message;
        if (s.min === 0) message = 'No minimum attendance required';
        else if (r.status === 'empty') message = 'No classes logged yet';
        else if (r.status === 'impossible') message = s.missed > 0 ? "100% target missed" : "Cannot miss any class";
        else if (r.status === 'danger') message = 'Attend next ' + r.mustAttend + ' class' + (r.mustAttend !== 1 ? 'es' : '') + ' to reach ' + s.min + '%';
        else if (r.status === 'warn') message = "On boundary — 0 misses allowed";
        else message = 'Can afford to miss ' + (r.canMiss === Infinity ? 'any' : r.canMiss) + ' more';

        var safeName = s.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var revealClass = firstRender ? ' reveal' : '';
        var revealStyle = firstRender ? ' style="animation-delay:' + (i * 35) + 'ms;"' : '';

        var isMuted = mutedSubjectIds.includes(s.id);
        var notifBtnHTML = '<button class="notif-toggle-btn ' + (isMuted ? '' : 'active') + '" onclick="AT.toggleNotifForSubject(\'' + s.id + '\')">' +
          (isMuted ? 'Muted' : 'Notify') +
          '</button>';

        var slots = slotsForSubject(s.id);
        var whenHTML = '';
        if (slotText) {
          whenHTML = '<div style="font-family:\'JetBrains Mono\',monospace; font-size:10.5px; color:var(--primary); margin-top:4px;">' + slotText + '</div>';
        } else if (slots.length) {
          whenHTML = '<div style="font-family:\'JetBrains Mono\',monospace; font-size:10.5px; color:var(--text-faint); margin-top:4px;">' + slots.map(slotLabel).join(', ') + '</div>';
        }

        var editSlotParam = slot ? slot.id : '';

        var slotId = slot ? slot.id : '';
        var slotCountsData = slotId ? getSlotCounts(slotId) : null;
        var displayAttended = slotCountsData ? slotCountsData.attended : s.attended;
        var displayMissed = slotCountsData ? slotCountsData.missed : s.missed;

        var dayName = slot ? DAY_NAMES[slot.day_of_week] : DAY_NAMES[activeDayTab];
        var dayLabelSuffix = slots.length > 1 ? ' (' + dayName + ')' : '';

        return (
          '<div class="card' + revealClass + '"' + revealStyle + '>' +
          '<div class="card-top-actions">' +
          '<button class="card-action-btn edit-btn" onclick="AT.openEditModal(\'' + editSlotParam + '\', \'' + s.id + '\')" title="Edit Class Details">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="card-action-btn remove-btn" onclick="AT.promptRemoveClassSlot(\'' + (slot ? slot.id : '') + '\', \'' + s.id + '\')" title="Remove Class Slot / Subject">&#10005;</button>' +
          '</div>' +
          '<div class="card-head">' +
          ringWithLabel(r.pct, s.min, 68, 5, false) +
          '<div style="min-width:0; flex:1;">' +
          '<div class="card-name">' + safeName + '</div>' +
          '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px;">' +
          '<span class="tag ' + s.type + '">' + s.type + '</span>' +
          notifBtnHTML +
          '</div>' +
          whenHTML +
          '</div>' +
          '</div>' +
          '<div class="steppers">' +
          stepperHTML(s.id, 'attended', 'Present' + dayLabelSuffix, displayAttended, 'var(--safe)', slotId) +
          stepperHTML(s.id, 'missed', 'Absent' + dayLabelSuffix, displayMissed, 'var(--danger)', slotId) +
          '</div>' +
          '<div class="minrow">' +
          '<span class="lbl">Min required</span>' +
          '<div class="mininput-wrap">' +
          '<input class="mininput" type="number" min="0" max="100" value="' + s.min + '" onchange="AT.setMin(\'' + s.id + '\', this.value)"/>' +
          '<span class="pct-sign">%</span>' +
          '</div>' +
          '</div>' +
          '<div class="message" style="color:' + color + ';">' + message + '</div>' +
          '</div>'
        );
      }

      function stepperHTML(id, field, label, value, tint, slotId) {
        var slotParam = slotId ? ", '" + slotId + "'" : "";
        return (
          '<div class="stepper">' +
          '<span class="label">' + label + '</span>' +
          '<div class="controls">' +
          '<button class="stepbtn" onclick="AT.step(\'' + id + '\',\'' + field + '\',-1' + slotParam + ')" aria-label="decrease ' + label + '">&#8722;</button>' +
          '<span class="stepval bump" style="color:' + tint + ';">' + value + '</span>' +
          '<button class="stepbtn" onclick="AT.step(\'' + id + '\',\'' + field + '\',1' + slotParam + ')" aria-label="increase ' + label + '">&#43;</button>' +
          '</div>' +
          '</div>'
        );
      }

      window.AT = {
        promptRemoveClassSlot: function (slotId, subjectId) {
          var s = subjects.find(function (x) { return x.id === subjectId; });
          if (!s) return;
          var slot = schedule.find(function (x) { return x.id === slotId; });
          var subSlots = slotsForSubject(subjectId);
          var mount = document.getElementById('deleteModalMount');
          if (!mount) return;

          var dayName = slot ? DAY_FULL_NAMES[slot.day_of_week] : DAY_FULL_NAMES[activeDayTab];
          var safeName = s.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

          var isMultipleDays = subSlots.length > 1;
          var otherSlotsText = '';
          if (isMultipleDays) {
            var otherSlots = subSlots.filter(function (x) { return !slot || x.id !== slot.id; });
            otherSlotsText = '<div style="font-size:11.5px; color:var(--text-dim); margin-top:8px; line-height:1.4; background:var(--panel-2); padding:8px 10px; border:1px solid var(--line);">' +
              '<span style="color:var(--text); font-weight:500;">Other scheduled days for this subject:</span><br/>' +
              otherSlots.map(slotLabel).join(', ') +
              '</div>';
          }

          mount.innerHTML =
            '<div class="modal-overlay" onclick="if(event.target===this) AT.closeDeleteModal()">' +
            '<div class="modal-card" style="max-width:440px;">' +
            '<div class="panel-form-head"><span style="color:var(--pink);">Remove Class</span><button onclick="AT.closeDeleteModal()">&#10005;</button></div>' +
            '<div style="margin-top:8px; font-size:13px; color:var(--text); line-height:1.45;">' +
            (isMultipleDays
              ? 'How would you like to remove <b>' + safeName + '</b>?'
              : 'Are you sure you want to remove <b>' + safeName + '</b> from ' + dayName + '?') +
            '</div>' +
            otherSlotsText +
            '<div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">' +
            (slotId
              ? '<button class="submit-btn" style="margin-top:0; padding:10px;" onclick="AT.removeClassSlot(\'' + slotId + '\')">' +
                (isMultipleDays ? 'Remove from ' + dayName + ' Only' : 'Remove Class from ' + dayName) +
                '</button>'
              : '') +
            '<button class="ghost-btn danger" style="padding:10px; font-weight:500;" onclick="AT.removeSubject(\'' + subjectId + '\')">' +
            (isMultipleDays ? 'Delete Subject Completely (All Days)' : 'Delete Subject & History') +
            '</button>' +
            '<button class="ghost-btn" style="padding:8px;" onclick="AT.closeDeleteModal()">Cancel</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        },

        closeDeleteModal: function () {
          var mount = document.getElementById('deleteModalMount');
          if (mount) mount.innerHTML = '';
        },

        removeClassSlot: async function (slotId) {
          AT.closeDeleteModal();
          try {
            var res = await supabase.from('class_schedule').delete().eq('id', slotId);
            if (res.error) throw res.error;
            if (slotCounts[slotId]) {
              delete slotCounts[slotId];
              saveSlotCounts();
            }
            showStatus('Class removed from ' + DAY_FULL_NAMES[activeDayTab] + '.', false);
            await loadSchedule();
            initializeSlotCountsForSubjects();
          } catch (e) {
            showStatus("Couldn't remove class slot: " + e.message, true);
          }
        },

        setType: function (t) { addFormType = t; renderAddForm(); },
        closeAdd: function () { showAdd = false; render(); },

        toggleNotifForSubject: function (subjectId) {
          var idx = mutedSubjectIds.indexOf(subjectId);
          if (idx >= 0) {
            mutedSubjectIds.splice(idx, 1);
            showStatus('Notifications enabled for subject.', false);
          } else {
            mutedSubjectIds.push(subjectId);
            showStatus('Notifications muted for subject.', false);
          }
          localStorage.setItem('attendily_muted_subjects', JSON.stringify(mutedSubjectIds));
          render();
        },

        toggleNotifForDay: function (dayIndex) {
          var daySlots = validScheduleForDay(dayIndex);
          var daySubjectIds = daySlots.map(function (s) { return s.subject_id; });

          var allMuted = daySubjectIds.length > 0 && daySubjectIds.every(function (id) { return mutedSubjectIds.includes(id); });

          if (allMuted) {
            mutedSubjectIds = mutedSubjectIds.filter(function (id) { return !daySubjectIds.includes(id); });
            showStatus('Notifications enabled for all ' + DAY_FULL_NAMES[dayIndex] + ' classes.', false);
          } else {
            daySubjectIds.forEach(function (id) {
              if (!mutedSubjectIds.includes(id)) mutedSubjectIds.push(id);
            });
            showStatus('Notifications muted for all ' + DAY_FULL_NAMES[dayIndex] + ' classes.', false);
          }
          localStorage.setItem('attendily_muted_subjects', JSON.stringify(mutedSubjectIds));
          render();
        },

        submitAdd: async function () {
          var nameInput = document.getElementById('newSubjectName');
          var minInput = document.getElementById('newSubjectMin');
          var name = nameInput ? nameInput.value.trim() : '';
          if (!name) { if (nameInput) nameInput.focus(); return; }

          var min = clamp(parseInt((minInput ? minInput.value : '75') || '0', 10), 0, 100);

          var smEl = document.getElementById('startMinInput');
          var emEl = document.getElementById('endMinInput');
          if (smEl) startMin = parseInt(smEl.value, 10) || 0;
          if (emEl) endMin = parseInt(emEl.value, 10) || 0;

          if (startMin >= 60 || endMin >= 60 || startMin < 0 || endMin < 0) {
            showStatus('Invalid Minute: Minute values must be between 0 and 59.', true);
            return;
          }

          var start24 = format24Time(startHour12, startMin, startAmpm);
          var end24 = format24Time(endHour12, endMin, endAmpm);

          // Calculate time bounds in minutes from midnight for conflict check
          var startHour24 = parseInt(start24.split(':')[0], 10);
          var startMinuteVal = parseInt(start24.split(':')[1], 10);
          var endHour24 = parseInt(end24.split(':')[0], 10);
          var endMinuteVal = parseInt(end24.split(':')[1], 10);

          var newStartMin = startHour24 * 60 + startMinuteVal;
          var newEndMin = endHour24 * 60 + endMinuteVal;

          if (newEndMin <= newStartMin) {
            showStatus('Time Conflict Exception: Class end time must be later than start time.', true);
            return;
          }

          var enableNotifCheckbox = document.getElementById('newSubjectEnableNotif');
          var enableNotif = enableNotifCheckbox ? enableNotifCheckbox.checked : true;

          // Determine target days based on Add Form Mode (Global vs Day-Specific)
          var targetDays = [];
          if (addFormMode === 'global') {
            var checkedDayEls = document.querySelectorAll('.day-checkbox:checked');
            targetDays = Array.from(checkedDayEls).map(function (cb) { return parseInt(cb.value, 10); });
            if (targetDays.length === 0) {
              showStatus('Select at least one day to schedule this subject.', true);
              return;
            }
          } else {
            targetDays = [addPresetDay || activeDayTab];
          }

          // Raise Time Conflict Exception if two classes on the same day overlap in time
          for (var i = 0; i < targetDays.length; i++) {
            var d = targetDays[i];
            var dayName = DAY_FULL_NAMES[d];
            var existingSlots = validScheduleForDay(d);

            for (var j = 0; j < existingSlots.length; j++) {
              var slot = existingSlots[j];
              var slotStartParts = slot.start_time.split(':');
              var slotEndParts = slot.end_time.split(':');
              var slotStartMin = parseInt(slotStartParts[0], 10) * 60 + parseInt(slotStartParts[1], 10);
              var slotEndMin = parseInt(slotEndParts[0], 10) * 60 + parseInt(slotEndParts[1], 10);

              // Overlap condition: (newStart < existingEnd) && (newEnd > existingStart)
              if (newStartMin < slotEndMin && newEndMin > slotStartMin) {
                var confSub = subjects.find(function (x) { return x.id === slot.subject_id; });
                var confName = confSub ? confSub.name : 'A class';
                showStatus('Time Conflict Exception: "' + confName + '" is already scheduled on ' + dayName + ' (' + slot.start_time.slice(0, 5) + '–' + slot.end_time.slice(0, 5) + '). Two different classes cannot occur at the same time on the same day.', true);
                return;
              }
            }
          }

          try {
            var res = await supabase.from('subjects')
              .insert([{ name: name, type: addFormType, min_attendance: min, attended: 0, missed: 0 }])
              .select();
            if (res.error) throw res.error;

            var newSubject = res.data[0];
            subjects.push(rowToLocal(newSubject));

            var pushWarning = null;
            if (!enableNotif) {
              mutedSubjectIds.push(newSubject.id);
              localStorage.setItem('attendily_muted_subjects', JSON.stringify(mutedSubjectIds));
            } else {
              var pushOk = await PUSH.enable();
              if (!pushOk) {
                pushWarning = PUSH.lastError || "Subject added, but notifications couldn't be enabled.";
              }
            }

            var schedRows = targetDays.map(function (d) {
              return { subject_id: newSubject.id, day_of_week: d, start_time: start24, end_time: end24 };
            });
            var schedRes = await supabase.from('class_schedule').insert(schedRows);
            if (schedRes.error) throw schedRes.error;

            if (pushWarning) {
              showStatus(pushWarning, true);
            } else {
              showStatus(null);
            }
          } catch (e) {
            showStatus("Couldn't add subject: " + e.message, true);
          }

          addFormType = 'theory';
          showAdd = false;
          await loadSchedule();
          render();
        },

        removeSubject: async function (id) {
          AT.closeDeleteModal();
          var sSlots = slotsForSubject(id);
          sSlots.forEach(function (slot) {
            if (slotCounts[slot.id]) delete slotCounts[slot.id];
          });
          saveSlotCounts();
          var prev = subjects;
          subjects = subjects.filter(function (s) { return s.id !== id; });
          render();
          try {
            var res = await supabase.from('subjects').delete().eq('id', id);
            if (res.error) throw res.error;
            showStatus(null);
          } catch (e) {
            subjects = prev;
            showStatus("Couldn't delete: " + e.message, true);
            render();
          }
        },

        step: async function (id, field, delta, slotId) {
          var s = subjects.find(function (x) { return x.id === id; });
          if (!s) return;
          var prevSubjectVal = s[field];
          var prevSlotVal = 0;
          var slotObj = null;

          if (slotId) {
            slotObj = schedule.find(function (x) { return x.id === slotId; });
            var counts = getSlotCounts(slotId);
            prevSlotVal = counts[field] || 0;
            var newVal = Math.max(0, prevSlotVal + delta);
            counts[field] = newVal;
            if (slotObj) slotObj[field] = newVal;
            saveSlotCounts();
            syncSubjectAttendanceFromSlots(id);
          } else {
            s[field] = Math.max(0, s[field] + delta);
          }

          render();

          try {
            if (slotId && slotObj) {
              var schedUpdate = await supabase.from('class_schedule')
                .update({ attended: slotObj.attended, missed: slotObj.missed })
                .eq('id', slotId);
              if (schedUpdate.error) throw schedUpdate.error;
            }

            var subUpdate = await supabase.from('subjects')
              .update({ attended: s.attended, missed: s.missed })
              .eq('id', id);
            if (subUpdate.error) throw subUpdate.error;

            showStatus(null);
          } catch (e) {
            if (slotId) {
              var c = getSlotCounts(slotId);
              c[field] = prevSlotVal;
              if (slotObj) slotObj[field] = prevSlotVal;
              saveSlotCounts();
              syncSubjectAttendanceFromSlots(id);
            } else {
              s[field] = prevSubjectVal;
            }
            showStatus("Couldn't save change: " + e.message, true);
            render();
          }
        },

        setMin: async function (id, val) {
          var s = subjects.find(function (x) { return x.id === id; });
          if (!s) return;
          var prevMin = s.min;
          s.min = clamp(parseInt(val || '0', 10), 0, 100);
          render();
          try {
            var res = await supabase.from('subjects').update({ min_attendance: s.min }).eq('id', id);
            if (res.error) throw res.error;
            showStatus(null);
          } catch (e) {
            s.min = prevMin;
            showStatus("Couldn't save change: " + e.message, true);
            render();
          }
        },

        openEditModal: function (slotId, subjectId) {
          var s = subjects.find(function (x) { return x.id === subjectId; });
          var slot = schedule.find(function (x) { return x.id === slotId; });
          if (!s) return;
          if (!slot) {
            slot = schedule.find(function (x) { return x.subject_id === subjectId; });
          }
          if (!slot) return;

          editSlotId = slot.id;
          editSubjectId = subjectId;
          editFormType = s.type;

          var startParts = parse24To12(slot.start_time);
          var endParts = parse24To12(slot.end_time);

          editStartHour12 = startParts.hour12;
          editStartMin = startParts.min;
          editStartAmpm = startParts.ampm;

          editEndHour12 = endParts.hour12;
          editEndMin = endParts.min;
          editEndAmpm = endParts.ampm;

          showEditModal = true;
          renderEditModal();
        },

        closeEditModal: function () {
          showEditModal = false;
          renderEditModal();
        },

        submitEditClass: async function () {
          var nameInput = document.getElementById('editSubjectName');
          var minInput = document.getElementById('editSubjectMin');
          var daySelect = document.getElementById('editClassDay');
          var name = nameInput ? nameInput.value.trim() : '';
          if (!name) { if (nameInput) nameInput.focus(); return; }

          var min = clamp(parseInt((minInput ? minInput.value : '75') || '0', 10), 0, 100);
          var targetDay = daySelect ? parseInt(daySelect.value, 10) : activeDayTab;

          var shEl = document.getElementById('editStartHourSelect');
          var smEl = document.getElementById('editStartMinInput');
          var ehEl = document.getElementById('editEndHourSelect');
          var emEl = document.getElementById('editEndMinInput');

          var sh12 = shEl ? parseInt(shEl.value, 10) : editStartHour12;
          var sm = smEl ? (parseInt(smEl.value, 10) || 0) : editStartMin;
          var eh12 = ehEl ? parseInt(ehEl.value, 10) : editEndHour12;
          var em = emEl ? (parseInt(emEl.value, 10) || 0) : editEndMin;

          if (sm >= 60 || em >= 60 || sm < 0 || em < 0) {
            showStatus('Invalid Minute: Minute values must be between 0 and 59.', true);
            return;
          }

          var start24 = format24Time(sh12, sm, editStartAmpm);
          var end24 = format24Time(eh12, em, editEndAmpm);

          var startHour24 = parseInt(start24.split(':')[0], 10);
          var startMinuteVal = parseInt(start24.split(':')[1], 10);
          var endHour24 = parseInt(end24.split(':')[0], 10);
          var endMinuteVal = parseInt(end24.split(':')[1], 10);

          var newStartMin = startHour24 * 60 + startMinuteVal;
          var newEndMin = endHour24 * 60 + endMinuteVal;

          if (newEndMin <= newStartMin) {
            showStatus('Time Conflict Exception: Class end time must be later than start time.', true);
            return;
          }

          // Conflict Check on targetDay (excluding current slot being edited)
          var existingSlots = validScheduleForDay(targetDay);
          for (var i = 0; i < existingSlots.length; i++) {
            var slot = existingSlots[i];
            if (slot.id === editSlotId) continue;

            var slotStartParts = slot.start_time.split(':');
            var slotEndParts = slot.end_time.split(':');
            var slotStartMin = parseInt(slotStartParts[0], 10) * 60 + parseInt(slotStartParts[1], 10);
            var slotEndMin = parseInt(slotEndParts[0], 10) * 60 + parseInt(slotEndParts[1], 10);

            if (newStartMin < slotEndMin && newEndMin > slotStartMin) {
              var confSub = subjects.find(function (x) { return x.id === slot.subject_id; });
              var confName = confSub ? confSub.name : 'A class';
              showStatus('Time Conflict Exception: "' + confName + '" is already scheduled on ' + DAY_FULL_NAMES[targetDay] + ' (' + slot.start_time.slice(0, 5) + '–' + slot.end_time.slice(0, 5) + '). Two different classes cannot occur at the same time on the same day.', true);
              return;
            }
          }

          var notifCb = document.getElementById('editSubjectEnableNotif');
          var enableNotif = notifCb ? notifCb.checked : true;

          try {
            var subRes = await supabase.from('subjects')
              .update({ name: name, type: editFormType, min_attendance: min })
              .eq('id', editSubjectId);
            if (subRes.error) throw subRes.error;

            var schedRes = await supabase.from('class_schedule')
              .update({ day_of_week: targetDay, start_time: start24, end_time: end24 })
              .eq('id', editSlotId);
            if (schedRes.error) throw schedRes.error;

            var subObj = subjects.find(function (x) { return x.id === editSubjectId; });
            if (subObj) {
              subObj.name = name;
              subObj.type = editFormType;
              subObj.min = min;
            }

            if (!enableNotif) {
              if (!mutedSubjectIds.includes(editSubjectId)) mutedSubjectIds.push(editSubjectId);
            } else {
              mutedSubjectIds = mutedSubjectIds.filter(function (id) { return id !== editSubjectId; });
            }
            localStorage.setItem('attendily_muted_subjects', JSON.stringify(mutedSubjectIds));

            showEditModal = false;
            renderEditModal();
            showStatus('Class details updated successfully!', false);
            activeDayTab = targetDay;
            await loadSchedule();
          } catch (e) {
            showStatus("Couldn't update class: " + e.message, true);
          }
        }
      };

      var showSchedule = false;
      var importDraft = null;
      var pushEnabled = false;

      function toggleSchedule() {
        showSchedule = !showSchedule;
        var btn = document.getElementById('scheduleToggleBtn');
        if (btn) btn.classList.toggle('active', showSchedule);
        if (showSchedule) { refreshPushState().then(loadSchedule); } else { document.getElementById('scheduleMount').innerHTML = ''; }
      }
      window.toggleSchedule = toggleSchedule;

      async function refreshPushState() {
        try {
          var res = await supabase.from('push_tokens').select('id').limit(1);
          if (res.error) throw res.error;
          pushEnabled = res.data.length > 0;
        } catch (e) {
          pushEnabled = false;
        }
      }

      async function loadSchedule() {
        try {
          var res = await supabase.from('class_schedule').select('*, subjects(name,type)').order('day_of_week').order('start_time');
          if (res.error) throw res.error;
          schedule = res.data;
        } catch (e) {
          showStatus("Couldn't load schedule: " + e.message, true);
          schedule = [];
        }
        initializeSlotCountsForSubjects();
        renderSchedule();
        render();
      }

      // Upload Schedule Fixed Rectangular Modal Popup Box
      function renderSchedule() {
        var mount = document.getElementById('scheduleMount');
        if (!showSchedule) { mount.innerHTML = ''; return; }

        mount.innerHTML =
          '<div class="modal-overlay" onclick="if(event.target===this) toggleSchedule()">' +
          '<div class="modal-card">' +
          '<div class="panel-form-head"><span>Upload Schedule</span><button onclick="toggleSchedule()">&#10005;</button></div>' +
          '<div style="font-size:12px; color:var(--text-dim); margin-top:6px; line-height:1.4; font-weight:300;">Upload a clear photo of your college timetable to automatically parse your classes into their correct day tabs.</div>' +
          '<label class="upload-zone">' +
          '<div style="font-size:13px; font-weight:500; color:var(--text);">Drop timetable photo here or click to browse</div>' +
          '<div style="font-size:11px; color:var(--text-faint); margin-top:4px;">Supports PNG, JPG, WEBP</div>' +
          '<input type="file" id="timetableFile" accept="image/*" style="display:none;" onchange="SCHEDULE.uploadTimetable(this.files[0])"/>' +
          '</label>' +
          '<div id="importDraftMount"></div>' +
          '</div>' +
          '</div>';
      }

      function renderImportDraft() {
        var mount = document.getElementById('importDraftMount');
        if (!importDraft || !importDraft.length) {
          mount.innerHTML = '<div style="margin-top:12px; background:var(--panel-2); border:1px solid var(--line); padding:14px; text-align:center; color:var(--text-dim); font-size:12px;">' +
            'No classes remaining in list. Drop another photo above or click browse.' +
            '</div>';
          return;
        }

        // Aggregate unique subjects for quick removal
        var subjectMap = {};
        importDraft.forEach(function (r) {
          var name = (r.subject_name || '').trim();
          if (!name) return;
          subjectMap[name] = (subjectMap[name] || 0) + 1;
        });
        var uniqueNames = Object.keys(subjectMap);

        var subjectPillsHtml = '';
        if (uniqueNames.length > 0) {
          var pills = uniqueNames.map(function (name) {
            var count = subjectMap[name];
            var encodedName = encodeURIComponent(name);
            return '<span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; background:var(--panel-2); border:1px solid var(--line); padding:3px 8px; border-radius:12px; color:var(--text);">' +
              '<span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + name + '</span>' +
              '<span style="font-size:10px; color:var(--text-faint);">(' + count + ')</span>' +
              '<button type="button" onclick="SCHEDULE.removeDraftSubject(decodeURIComponent(\'' + encodedName + '\'))" title="Remove all ' + name.replace(/'/g, "\'") + ' classes" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:12px; padding:0 2px; line-height:1; display:inline-flex; align-items:center;" onmouseover="this.style.color=\'var(--pink)\'" onmouseout="this.style.color=\'var(--text-dim)\'">&#10005;</button>' +
              '</span>';
          }).join(' ');

          subjectPillsHtml =
            '<div style="margin-bottom:10px; background:var(--panel); border:1px solid var(--line); padding:8px 10px; border-radius:6px;">' +
            '<div style="font-size:11px; font-weight:600; color:var(--text-dim); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>Detected Subjects (' + uniqueNames.length + ') &mdash; Tap &#10005; to exclude</span>' +
            '</div>' +
            '<div style="display:flex; flex-wrap:wrap; gap:5px; max-height:75px; overflow-y:auto;">' + pills + '</div>' +
            '</div>';
        }

        var rows = importDraft.map(function (r, idx) {
          return '<div style="font-size:12px; color:var(--text); padding:6px 10px; background:var(--panel-2); border:1px solid var(--line); margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
            '<span style="white-space:nowrap; color:var(--text-dim); font-size:11.5px;">' + DAY_NAMES[r.day_of_week] + ' ' + r.start_time + '\u2013' + r.end_time + '</span>' +
            '<div style="display:flex; align-items:center; gap:8px; overflow:hidden; justify-content:flex-end;">' +
            '<span style="font-weight:500; color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right;">' + r.subject_name + ' <span style="font-size:10.5px; opacity:0.8;">(' + r.type + ')</span></span>' +
            '<button type="button" onclick="SCHEDULE.removeDraftItem(' + idx + ')" title="Remove this slot" style="background:transparent; border:none; color:var(--text-faint); cursor:pointer; font-size:12px; padding:2px 6px; border-radius:4px; line-height:1; flex-shrink:0; transition:all 0.15s ease;" onmouseover="this.style.color=\'var(--pink)\';this.style.background=\'rgba(255,100,100,0.15)\'" onmouseout="this.style.color=\'var(--text-faint)\';this.style.background=\'transparent\'"><span style="font-size:11px;">&#10005;</span></button>' +
            '</div>' +
            '</div>';
        }).join('');

        mount.innerHTML = '<div style="margin-top:14px;">' +
          subjectPillsHtml +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
          '<div style="font-size:12px; font-weight:500; color:var(--text-dim);">Detected Classes (' + importDraft.length + '):</div>' +
          '<button type="button" onclick="SCHEDULE.clearDraft()" style="background:none; border:none; color:var(--pink); font-size:11px; cursor:pointer; padding:0;" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">Clear All</button>' +
          '</div>' +
          '<div style="max-height:36vh; overflow-y:auto;">' + rows + '</div>' +
          '<button class="submit-btn" style="margin-top:10px; width:100%; position:sticky; bottom:-22px; box-shadow:0 -12px 16px -4px #111114;" onclick="SCHEDULE.confirmImport()">Confirm & Add ' + importDraft.length + ' Class' + (importDraft.length === 1 ? '' : 'es') + ' To Day Tabs</button>' +
          '</div>';
      }

      window.SCHEDULE = {
        removeDraftItem: function (idx) {
          if (!importDraft || typeof idx !== 'number') return;
          importDraft.splice(idx, 1);
          renderImportDraft();
        },
        removeDraftSubject: function (subjectName) {
          if (!importDraft || !subjectName) return;
          var target = subjectName.toLowerCase().trim();
          importDraft = importDraft.filter(function (r) {
            return (r.subject_name || '').toLowerCase().trim() !== target;
          });
          renderImportDraft();
        },
        clearDraft: function () {
          importDraft = [];
          renderImportDraft();
        },
        addClass: async function () {
          var subjectId = document.getElementById('newClassSubject').value;
          var day = parseInt(document.getElementById('newClassDay').value, 10);
          var start = document.getElementById('newClassStart').value;
          var end = document.getElementById('newClassEnd').value;
          if (!subjectId || !start || !end) { showStatus('Fill in subject, start and end time.', true); return; }
          try {
            var res = await supabase.from('class_schedule').insert([{ subject_id: subjectId, day_of_week: day, start_time: start, end_time: end }]);
            if (res.error) throw res.error;
            await loadSchedule();
          } catch (e) {
            showStatus("Couldn't add class: " + e.message, true);
          }
        },
        removeClass: async function (id) {
          try {
            var res = await supabase.from('class_schedule').delete().eq('id', id);
            if (res.error) throw res.error;
            await loadSchedule();
          } catch (e) {
            showStatus("Couldn't remove class: " + e.message, true);
          }
        },
        cancelNext: async function (scheduleId) {
          var cls = schedule.find(function (c) { return c.id === scheduleId; });
          if (!cls) return;
          var today = new Date();
          var diff = (cls.day_of_week - today.getDay() + 7) % 7;
          var target = new Date(today);
          target.setDate(today.getDate() + diff);
          var dateStr = formatLocalDate(target);
          try {
            var res = await supabase.from('class_log').upsert({
              schedule_id: cls.id, subject_id: cls.subject_id, class_date: dateStr,
              status: 'cancelled', resolved_at: new Date().toISOString()
            }, { onConflict: 'schedule_id,class_date' });
            if (res.error) throw res.error;
            showStatus('Marked ' + dateStr + ' as cancelled.', false);
          } catch (e) {
            showStatus("Couldn't mark cancelled: " + e.message, true);
          }
        },
        uploadTimetable: async function (file, customKey) {
          if (!file) return;
          var mount = document.getElementById('importDraftMount');
          mount.innerHTML = '<div style="padding:14px; text-align:center;"><span class="spinner"></span> Parsing timetable...</div>';
          var reader = new FileReader();
          reader.onload = async function () {
            var base64 = reader.result.split(',')[1];
            var geminiKey = customKey || localStorage.getItem('attendily_gemini_key') || window.GEMINI_API_KEY;

            try {
              var data = null;

              // Try Supabase Edge Function first if no custom key provided
              if (!customKey && supabase && supabase.functions && typeof supabase.functions.invoke === 'function') {
                var invokeRes = await supabase.functions.invoke('parse-timetable', {
                  body: { image_base64: base64, mime_type: file.type }
                });

                if (invokeRes.error) {
                  console.error('Supabase Edge Function response error:', invokeRes.error);
                  var errDetail = invokeRes.error.message || 'Edge function error';
                  if (invokeRes.data && invokeRes.data.error) errDetail = invokeRes.data.error;
                  if (invokeRes.error.status === 404 || errDetail.indexOf('Failed to send') !== -1) {
                    data = null;
                  } else {
                    throw new Error('Supabase Edge Function: ' + errDetail);
                  }
                } else if (invokeRes.data && invokeRes.data.error) {
                  throw new Error(invokeRes.data.error);
                } else if (invokeRes.data && invokeRes.data.classes) {
                  data = invokeRes.data;
                }
              }

              // Fallback to direct Gemini API call if stored key exists
              if (!data && geminiKey) {
                var PROMPT = 'You are reading a college timetable image. Extract every class slot you can see. Return ONLY a JSON array, no prose, no markdown fences. Each item must look like: {"subject_name": "string", "type": "theory" or "lab", "day_of_week": 0-6 (0=Sunday), "start_time": "HH:MM" in 24hr, "end_time": "HH:MM" in 24hr}';
                var models = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
                var gRes = null;

                for (var m = 0; m < models.length; m++) {
                  gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent?key=' + geminiKey, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: file.type, data: base64 } }] }]
                    })
                  });

                  if (gRes && gRes.ok) break;
                }

                if (!gRes || !gRes.ok) {
                  var errText = gRes ? await gRes.text() : 'No response';
                  var cleanMsg = 'Gemini API Error';
                  try {
                    var parsedErr = JSON.parse(errText);
                    if (parsedErr.error && parsedErr.error.message) {
                      cleanMsg = parsedErr.error.message;
                    }
                  } catch (_) { cleanMsg = errText; }

                  if (gRes && gRes.status === 429) {
                    throw new Error('Gemini API Quota Exceeded (HTTP 429): Google free-tier rate limit reached. Please wait ~40 seconds before retrying, or update your API key below.');
                  }
                  throw new Error(cleanMsg);
                }

                var gData = await gRes.json();
                var rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
                var cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
                var parsed = JSON.parse(cleaned);
                data = { classes: parsed };
              }

              // If no edge function deployed and no key provided, prompt user for key
              if (!data || !data.classes) {
                window._pendingTimetableFile = file;
                mount.innerHTML =
                  '<div style="margin-top:12px; background:var(--panel-2); border:1px solid var(--line); padding:14px; display:flex; flex-direction:column; gap:10px; text-align:left;">' +
                  '<div style="font-size:12.5px; font-weight:600; color:var(--orange);">Edge Function Not Reachable</div>' +
                  '<div style="font-size:11.5px; color:var(--text-dim); line-height:1.4;">' +
                  'The function <code>parse-timetable</code> could not be reached on your Supabase backend.<br/><br/>' +
                  '<b>Step 1:</b> Deploy via Supabase CLI:<br/><code style="color:var(--pink);">npx supabase functions deploy parse-timetable --no-verify-jwt</code><br/><br/>' +
                  '<b>Step 2:</b> Or enter your Gemini API Key below to parse directly:' +
                  '</div>' +
                  '<input type="password" id="geminiApiKeyInput" placeholder="Paste Gemini API Key (AIzaSy...)" style="background:var(--panel); border:1px solid var(--line); color:var(--text); padding:8px 10px; font-size:12px; width:100%;"/>' +
                  '<button class="submit-btn" style="padding:8px 0;" onclick="SCHEDULE.saveGeminiKeyAndRetry()">Save Key & Parse Timetable</button>' +
                  '</div>';
                return;
              }

              importDraft = data.classes;
              renderImportDraft();
            } catch (e) {
              window._pendingTimetableFile = file;
              var isQuotaErr = e.message && e.message.indexOf('429') !== -1;
              mount.innerHTML =
                '<div class="auth-msg error" style="margin-top:12px; font-size:12px; line-height:1.45;">' +
                '<strong>' + (isQuotaErr ? '⚠️ Rate Limit Exceeded (HTTP 429)' : 'Error Parsing Timetable') + '</strong><br/>' +
                (e.message || 'Failed to fetch timetable.') +
                '<div style="margin-top:10px; display:flex; gap:8px;">' +
                '<button type="button" class="ghost-btn" onclick="SCHEDULE.clearGeminiKey()">Change API Key</button>' +
                '</div>' +
                '</div>';
            }
          };
          reader.readAsDataURL(file);
        },

        clearGeminiKey: function () {
          localStorage.removeItem('attendily_gemini_key');
          var mount = document.getElementById('importDraftMount');
          mount.innerHTML =
            '<div style="margin-top:12px; background:var(--panel-2); border:1px solid var(--line); padding:14px; display:flex; flex-direction:column; gap:10px; text-align:left;">' +
            '<div style="font-size:12.5px; font-weight:600; color:var(--pink);">Update Gemini API Key</div>' +
            '<input type="password" id="geminiApiKeyInput" placeholder="Paste New Gemini API Key (AIzaSy...)" style="background:var(--panel); border:1px solid var(--line); color:var(--text); padding:8px 10px; font-size:12px; width:100%;"/>' +
            '<button class="submit-btn" style="padding:8px 0;" onclick="SCHEDULE.saveGeminiKeyAndRetry()">Save New Key & Retry</button>' +
            '</div>';
        },

        saveGeminiKeyAndRetry: function () {
          var input = document.getElementById('geminiApiKeyInput');
          var key = input ? input.value.trim() : '';
          if (!key) { if (input) input.focus(); return; }
          localStorage.setItem('attendily_gemini_key', key);
          if (window._pendingTimetableFile) {
            SCHEDULE.uploadTimetable(window._pendingTimetableFile, key);
          }
        },
        confirmImport: async function () {
          if (!importDraft || !importDraft.length) return;

          // Helper to convert HH:MM to minutes
          function timeStrMin(t) {
            var parts = (t || '').split(':').map(Number);
            return (parts[0] || 0) * 60 + (parts[1] || 0);
          }

          var validDraft = [];
          var conflictsFound = [];
          var skippedSunday = 0;
          var skippedInvalid = 0;

          // 1. Strict Schema & Overlap Validation on AI Output (BUG-002 & BUG-006 & Bug 4)
          importDraft.forEach(function (row, idx) {
            var rawName = (row.subject_name || '').trim();
            if (!rawName) { skippedInvalid++; return; }

            var dayNum = typeof row.day_of_week === 'number' ? row.day_of_week : parseInt(row.day_of_week, 10);
            if (dayNum === 0) { skippedSunday++; return; } // Sunday not supported in Mon-Sat college schedule
            if (isNaN(dayNum) || dayNum < 1 || dayNum > 6) { skippedInvalid++; return; }

            var sMin = timeStrMin(row.start_time);
            var eMin = timeStrMin(row.end_time);
            if (eMin <= sMin || isNaN(sMin) || isNaN(eMin)) { skippedInvalid++; return; }

            // Check overlap with existing schedule in database
            var existingOnDay = validScheduleForDay(dayNum);
            var hasDbConflict = existingOnDay.some(function (slot) {
              var existS = timeStrMin(slot.start_time);
              var existE = timeStrMin(slot.end_time);
              return (sMin < existE && eMin > existS);
            });

            // Check overlap with other slots in this current batch
            var hasBatchConflict = validDraft.some(function (slot) {
              if (slot.day_of_week !== dayNum) return false;
              var bS = timeStrMin(slot.start_time);
              var bE = timeStrMin(slot.end_time);
              return (sMin < bE && eMin > bS);
            });

            if (hasDbConflict || hasBatchConflict) {
              conflictsFound.push(rawName + ' (' + DAY_NAMES[dayNum] + ' ' + row.start_time + '–' + row.end_time + ')');
            } else {
              validDraft.push({
                subject_name: rawName,
                type: row.type === 'lab' ? 'lab' : 'theory',
                day_of_week: dayNum,
                start_time: row.start_time,
                end_time: row.end_time
              });
            }
          });

          if (validDraft.length === 0) {
            var failMsg = 'Import Cancelled: All detected classes had invalid timings or collided with existing classes.';
            if (skippedSunday > 0) failMsg += ' (' + skippedSunday + ' Sunday class slots are not supported)';
            showStatus(failMsg, true);
            return;
          }

          var nameToId = {};
          subjects.forEach(function (s) { nameToId[s.name.toLowerCase().trim()] = s.id; });

          var newSubjects = [];
          var seenNew = new Set();

          validDraft.forEach(function (row) {
            var rawName = row.subject_name;
            var key = rawName.toLowerCase();
            if (!nameToId[key] && !seenNew.has(key)) {
              seenNew.add(key);
              newSubjects.push({
                name: rawName,
                type: row.type === 'lab' ? 'lab' : 'theory',
                min_attendance: 75,
                attended: 0,
                missed: 0
              });
            }
          });

          try {
            if (newSubjects.length > 0) {
              var insertRes = await supabase.from('subjects').insert(newSubjects).select();
              if (insertRes.error) throw insertRes.error;
              insertRes.data.forEach(function (s) {
                nameToId[s.name.toLowerCase().trim()] = s.id;
                subjects.push(rowToLocal(s));
              });
            }

            var toInsert = [];
            validDraft.forEach(function (row) {
              var subjectId = nameToId[row.subject_name.toLowerCase()];
              if (subjectId) {
                toInsert.push({
                  subject_id: subjectId,
                  day_of_week: row.day_of_week,
                  start_time: row.start_time,
                  end_time: row.end_time,
                  attended: 0,
                  missed: 0
                });
              }
            });

            if (toInsert.length > 0) {
              var res = await supabase.from('class_schedule').insert(toInsert);
              if (res.error) throw res.error;
            }

            importDraft = null;
            showSchedule = false;
            document.getElementById('scheduleMount').innerHTML = '';

            var successMsg = 'Imported ' + toInsert.length + ' class' + (toInsert.length === 1 ? '' : 'es') + ' successfully!';
            var skipNotes = [];
            if (conflictsFound.length > 0) skipNotes.push(conflictsFound.length + ' overlapping');
            if (skippedSunday > 0) skipNotes.push(skippedSunday + ' Sunday');
            if (skippedInvalid > 0) skipNotes.push(skippedInvalid + ' invalid');
            if (skipNotes.length > 0) {
              successMsg += ' (Skipped: ' + skipNotes.join(', ') + ')';
            }
            showStatus(successMsg, false);
            await loadSchedule();
            render();
          } catch (e) {
            showStatus("Couldn't import timetable: " + e.message, true);
          }
        }
      };

      function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) { outputArray[i] = rawData.charCodeAt(i); }
        return outputArray;
      }

      window.PUSH = {
        toggle: async function (checked) {
          var input = document.getElementById('pushToggle');
          if (checked) {
            var ok = await PUSH.enable();
            if (!ok && input) { input.checked = false; }
          } else {
            await PUSH.disable();
          }
          pushEnabled = checked && await PUSH.isActuallyEnabled();
          renderSchedule();
        },

        isActuallyEnabled: async function () {
          if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
              var reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                var sub = await reg.pushManager.getSubscription();
                return !!sub;
              }
            } catch (e) { }
          }
          await refreshPushState();
          return pushEnabled;
        },

        enable: async function () {
          PUSH.lastError = null;
          var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

          if (isIOS && !isStandalone) {
            PUSH.lastError = 'On iPhone, notifications only work once this is added to your Home Screen. Tap Share → Add to Home Screen, then open Attendily from that icon and try again.';
            showStatus(PUSH.lastError, true);
            var input0 = document.getElementById('pushToggle');
            if (input0) input0.checked = false;
            return false;
          }

          if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            PUSH.lastError = 'Push notifications are not supported on this browser or device.';
            showStatus(PUSH.lastError, true);
            return false;
          }
          try {
            var permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              PUSH.lastError = 'Notification permission was not granted. Check your device/browser notification settings for this site.';
              showStatus(PUSH.lastError, true);
              return false;
            }
            var reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
            var vapidKey = window.VAPID_PUBLIC_KEY || '';
            if (!vapidKey) { PUSH.lastError = 'Notifications are not configured yet.'; showStatus(PUSH.lastError, true); return false; }
            var sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });
            var json = sub.toJSON();
            var res = await supabase.from('push_tokens').upsert({
              endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth
            }, { onConflict: 'user_id,endpoint' });
            if (res.error) throw res.error;
            showStatus('Push notifications enabled.', false);
            return true;
          } catch (e) {
            PUSH.lastError = "Couldn't enable notifications: " + e.message;
            showStatus(PUSH.lastError, true);
            return false;
          }
        },

        disable: async function () {
          try {
            if ('serviceWorker' in navigator) {
              var reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                var sub = await reg.pushManager.getSubscription();
                if (sub) {
                  var endpoint = sub.endpoint;
                  await sub.unsubscribe();
                  await supabase.from('push_tokens').delete().eq('endpoint', endpoint);
                }
              }
            }
            showStatus('Push notifications turned off for this device.', false);
          } catch (e) {
            showStatus("Couldn't fully disable notifications: " + e.message, true);
          }
        }
      };

      var _pendingConfirmLog = null;

      async function checkConfirmParam() {
        var params = new URLSearchParams(window.location.search);
        var logId = params.get('confirm');
        if (!logId) return;
        try {
          var res = await supabase.from('class_log').select('*, subjects(name)').eq('id', logId).maybeSingle();
          if (res.error || !res.data) return;
          _pendingConfirmLog = res.data;
          renderConfirmOverlay(res.data);
        } catch (e) { }
      }

      function renderConfirmOverlay(log) {
        _pendingConfirmLog = log;
        var mount = document.getElementById('confirmOverlayMount');
        var rawName = log.subjects ? log.subjects.name : 'Class';
        var name = escapeHtml(rawName);
        mount.innerHTML =
          '<div class="panel-form" style="max-width:340px;">' +
          '<div class="panel-form-head"><span>' + name + '</span><button onclick="CONFIRM.dismiss()">&#10005;</button></div>' +
          '<div style="font-size:12.5px; color:var(--text-dim);">Did this class happen?</div>' +
          '<div style="display:flex; gap:8px;">' +
          '<button class="submit-btn" style="background:var(--safe); color:#090d16; flex:1;" onclick="CONFIRM.resolve(\'' + log.id + '\',\'' + log.subject_id + '\',\'present\')">Present</button>' +
          '<button class="submit-btn" style="background:var(--danger); color:#ffffff; flex:1;" onclick="CONFIRM.resolve(\'' + log.id + '\',\'' + log.subject_id + '\',\'absent\')">Absent</button>' +
          '</div>' +
          '<button class="ghost-btn" onclick="CONFIRM.resolve(\'' + log.id + '\',\'' + log.subject_id + '\',\'cancelled\')">Class was officially cancelled</button>' +
          '</div>';
      }

      window.CONFIRM = {
        dismiss: function () {
          _pendingConfirmLog = null;
          document.getElementById('confirmOverlayMount').innerHTML = '';
          var url = new URL(window.location.href);
          if (url.searchParams.has('confirm')) {
            url.searchParams.delete('confirm');
            window.history.replaceState({}, '', url.toString());
          }
        },
        resolve: async function (logId, subjectId, status) {
          try {
            var res = await supabase.from('class_log').update({ status: status, resolved_at: new Date().toISOString() }).eq('id', logId);
            if (res.error) throw res.error;

            if (status === 'present' || status === 'absent') {
              var field = status === 'present' ? 'attended' : 'missed';
              var schedId = _pendingConfirmLog ? _pendingConfirmLog.schedule_id : null;

              if (schedId) {
                var slotObj = schedule.find(function (x) { return x.id === schedId; });
                var curSlotAtt = slotObj ? (slotObj.attended || 0) : 0;
                var curSlotMiss = slotObj ? (slotObj.missed || 0) : 0;

                if (field === 'attended') curSlotAtt += 1;
                else curSlotMiss += 1;

                if (slotObj) {
                  slotObj.attended = curSlotAtt;
                  slotObj.missed = curSlotMiss;
                }
                slotCounts[schedId] = { attended: curSlotAtt, missed: curSlotMiss };
                saveSlotCounts();

                // Persist slot counts to Supabase class_schedule table
                var schedUp = await supabase.from('class_schedule')
                  .update({ attended: curSlotAtt, missed: curSlotMiss })
                  .eq('id', schedId);
                if (schedUp.error) console.error('Error updating class_schedule slot:', schedUp.error);

                syncSubjectAttendanceFromSlots(subjectId);
              } else {
                var s = subjects.find(function (x) { return x.id === subjectId; });
                if (s) s[field] = (s[field] || 0) + 1;
              }

              // Persist subject total counts to Supabase subjects table
              var sub = subjects.find(function (x) { return x.id === subjectId; });
              if (sub) {
                var updateRes = await supabase.from('subjects').update({ attended: sub.attended, missed: sub.missed }).eq('id', subjectId);
                if (updateRes.error) throw updateRes.error;
                render();
              }
            }

            CONFIRM.dismiss();
            showStatus('Marked as ' + status + '.', false);
            var url = new URL(window.location.href);
            url.searchParams.delete('confirm');
            window.history.replaceState({}, '', url.toString());
          } catch (e) {
            showStatus("Couldn't save: " + e.message, true);
          }
        }
      };

      window.addEventListener('resize', function () { updatePillNavIndicator(); });
      var topbarEl = document.getElementById('topbar');
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (!ticking) {
          window.requestAnimationFrame(function () {
            if (window.scrollY > 8) topbarEl.classList.add('scrolled');
            else topbarEl.classList.remove('scrolled');
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });

      if (configured) {
        supabase.auth.onAuthStateChange(function (event, session) {
          if (event === 'PASSWORD_RECOVERY') {
            authMode = 'reset';
            document.getElementById('appShell').classList.add('hidden');
            document.getElementById('authShell').classList.remove('hidden');
            renderAuth();
          }
        });
      }

      checkExistingSession();
    })();
