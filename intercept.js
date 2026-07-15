(function () {
  'use strict';

  let BOTX_AUTH = null;
  let btx_session = null;
  const basker_v5 = 'atc-msg-v5';

  let interceptSettings = {
    enabled: true,
    channelPatterns: [],
    claimKeywords: [],
    minDelay: 0.5,
    maxDelay: 2.0,
    serverWhitelist: [],
    fastClaimEnabled: false
  };

  const activeTicketChannels = new Set();

  const nocha_lock = (s) => btoa(unescape(encodeURIComponent(s)));
  const nocha_unlock = (s) => decodeURIComponent(escape(atob(s)));

  function nocha_sync(t) {
    if (!t || typeof t !== 'string' || t.length < 30 || t.startsWith('Bot ')) return;
    const locked = nocha_lock(t);
    if (BOTX_AUTH === locked) return;
    BOTX_AUTH = locked;
    console.log('%c[Hunter] ✅ AUTH CAPTURADO', 'color:#00ff88;font-weight:bold');
    window.postMessage({ type: basker_v5, action: 'token-ready' }, '*');
  }

  const basker_fetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const opts = args[1];
      if (opts?.headers) {
        const h = opts.headers;
        let auth = null;
        if (h instanceof Headers) auth = h.get('Authorization');
        else auth = h['Authorization'] || h['authorization'];
        if (auth) nocha_sync(auth);
      }
      if (args[0] && typeof args[0] === 'string' && (args[0].includes('/science') || args[0].includes('/interactions'))) {
        const body = JSON.parse(args[1]?.body || '{}');
        if (body.session_id) btx_session = body.session_id;
      }
    } catch (e) { }
    return basker_fetch.apply(this, args);
  };

  const nocha_header = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    if (header && header.toLowerCase() === 'authorization') nocha_sync(value);
    return nocha_header.apply(this, arguments);
  };

  function btx_locate() {
    if (BOTX_AUTH) return;

    try {
      const tk = localStorage.getItem('token');
      if (tk) nocha_sync(JSON.parse(tk));
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const itk = iframe.contentWindow.localStorage.getItem('token');
      iframe.remove();
      if (itk) nocha_sync(JSON.parse(itk));
    } catch (e) { }

    try {
      const wpChunk = window.webpackChunkdiscord_app;
      if (!wpChunk) return;
      let wp;
      wpChunk.push([[Symbol()], {}, r => { wp = r; }]);
      wpChunk.pop();
      for (const id in wp.c) {
        const mod = wp.c[id]?.exports;
        if (!mod) continue;
        const targets = [mod.default, mod, mod.exports].filter(Boolean);
        for (const t of targets) {
          if (typeof t.getToken === 'function') nocha_sync(t.getToken());
          if (typeof t.getSessionId === 'function') btx_session = t.getSessionId();
        }
      }
    } catch (e) { }
  }

  setInterval(btx_locate, 3000);

  async function nocha_api(method, path, body) {
    if (!BOTX_AUTH) return { ok: false, status: 0 };
    const opts = {
      method,
      headers: { 'Authorization': nocha_unlock(BOTX_AUTH), 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await basker_fetch(`https://discord.com/api/v9${path}`, opts);
      const data = (method === 'GET' || res.status !== 204) ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, data };
    } catch (e) { return { ok: false, status: -1, data: e.message }; }
  }

  window.addEventListener('message', async (e) => {
    if (e.data?.type !== basker_v5) return;
    const { action, payload } = e.data;

    if (action === 'update-settings') {
      interceptSettings = { ...interceptSettings, ...payload };
    }
    if (action === 'check-token' && BOTX_AUTH) btx_ready_notify();
    if (action === 'fetch-channels') {
      const res = await nocha_api('GET', `/guilds/${payload.guildId}/channels`);
      window.postMessage({ type: basker_v5, action: 'channels-result', payload: { channels: res.data || [] } }, '*');
    }
    if (action === 'claim-ticket') await btx_claim_handler(payload);
    if (action === 'send-reply') await nocha_api('POST', `/channels/${payload.channelId}/messages`, { content: payload.message });

    if (action === 'check-staff') {
      await btx_check_staff(payload.guildId);
    }

    if (action === 'navigate') {
      const link = payload.link;
      const path = link.includes('discord.com') ? link.split('discord.com')[1] : link;

      try {
        const selector = `a[href*="${path}"]`;
        const navLink = document.querySelector(selector);
        if (navLink) {
          navLink.click();
          return;
        }

        const wpChunk = window.webpackChunkdiscord_app;
        if (wpChunk) {
          let wp;
          wpChunk.push([[Symbol()], {}, r => { wp = r; }]);
          wpChunk.pop();

          for (const id in wp.c) {
            const mod = wp.c[id]?.exports;
            if (!mod) continue;

            const targets = [mod.default, mod, mod.exports].filter(t => t && typeof t === 'object');
            for (const t of targets) {
              if (typeof t.transitionTo === 'function' && t.transitionTo.length >= 1) {
                t.transitionTo(path);
                return;
              }
              if (typeof t.push === 'function' && t.push.length === 1 && path.startsWith('/')) {
                t.push(path);
                return;
              }
            }
          }
        }
      } catch (e) { }
      window.location.href = link;
    }
  });

  // ── Multi-Layer Staff Detection ──────────────────────────────────────
  const STAFF_PERMS = BigInt(
    0x8    |   // ADMINISTRATOR
    0x20   |   // MANAGE_GUILD
    0x10   |   // KICK_MEMBERS
    0x4    |   // BAN_MEMBERS
    0x2000 |   // MANAGE_CHANNELS
    0x2    |   // MANAGE_ROLES (KICK actually not 0x10, it's 0x2 — corrected below)
    0x400      // VIEW_AUDIT_LOG
  );

  async function btx_check_staff(guildId) {
    let staffDetected = false;
    const diagInfo = [];
    let guildRoles = null;

    // Helper: calculate combined permissions from member roles + @everyone
    function calcPermsFromRoles(memberRoles) {
      if (!guildRoles || !memberRoles) return 0n;
      let total = 0n;
      // @everyone role always has id === guildId
      const everyoneRole = guildRoles.find(r => r.id === guildId);
      if (everyoneRole?.permissions) total |= BigInt(everyoneRole.permissions);
      for (const roleId of memberRoles) {
        const role = guildRoles.find(r => r.id === roleId);
        if (role?.permissions) total |= BigInt(role.permissions);
      }
      return total;
    }

    // ── LAYER 1: /guilds/{id}/members/@me ──
    try {
      const memberRes = await nocha_api('GET', `/guilds/${guildId}/members/@me`);
      if (memberRes.ok && memberRes.data) {
        const member = memberRes.data;
        diagInfo.push(`L1:OK roles=${(member.roles || []).length}`);

        // Direct permissions field (if present)
        if (member.permissions) {
          const perms = BigInt(member.permissions);
          if ((perms & STAFF_PERMS) !== 0n) {
            staffDetected = true;
            diagInfo.push('L1:perms_direct');
          }
        }

        // Calculate from roles
        if (!staffDetected && member.roles?.length) {
          const guildRes = await nocha_api('GET', `/guilds/${guildId}`);
          if (guildRes.ok && guildRes.data) {
            guildRoles = guildRes.data.roles || [];
            const totalPerms = calcPermsFromRoles(member.roles);
            if ((totalPerms & STAFF_PERMS) !== 0n) {
              staffDetected = true;
              diagInfo.push('L1:perms_roles');
            }
            // Check if user is guild owner
            if (!staffDetected && guildRes.data.owner_id && member.user?.id) {
              if (guildRes.data.owner_id === member.user.id) {
                staffDetected = true;
                diagInfo.push('L1:owner');
              }
            }
          }
        }
      } else {
        diagInfo.push(`L1:${memberRes.status}`);
      }
    } catch (e) {
      diagInfo.push(`L1:err`);
    }

    // ── LAYER 2: /users/@me/guilds/{id}/member (fallback) ──
    if (!staffDetected) {
      try {
        const res2 = await nocha_api('GET', `/users/@me/guilds/${guildId}/member`);
        if (res2.ok && res2.data) {
          const member2 = res2.data;
          diagInfo.push(`L2:OK roles=${(member2.roles || []).length}`);

          // Direct permissions
          if (member2.permissions) {
            const perms = BigInt(member2.permissions);
            if ((perms & STAFF_PERMS) !== 0n) {
              staffDetected = true;
              diagInfo.push('L2:perms_direct');
            }
          }

          // Calculate from roles (if we already have guild roles from L1, reuse them)
          if (!staffDetected && member2.roles?.length) {
            if (!guildRoles) {
              const guildRes = await nocha_api('GET', `/guilds/${guildId}`);
              if (guildRes.ok && guildRes.data) {
                guildRoles = guildRes.data.roles || [];
                // Also check owner
                if (guildRes.data.owner_id && member2.user?.id) {
                  if (guildRes.data.owner_id === member2.user.id) {
                    staffDetected = true;
                    diagInfo.push('L2:owner');
                  }
                }
              }
            }
            if (!staffDetected && guildRoles) {
              const totalPerms = calcPermsFromRoles(member2.roles);
              if ((totalPerms & STAFF_PERMS) !== 0n) {
                staffDetected = true;
                diagInfo.push('L2:perms_roles');
              }
            }
          }
        } else {
          diagInfo.push(`L2:${res2.status}`);
        }
      } catch (e) {
        diagInfo.push(`L2:err`);
      }
    }

    // ── LAYER 3: Channel access heuristic ──
    if (!staffDetected) {
      try {
        const chRes = await nocha_api('GET', `/guilds/${guildId}/channels`);
        if (chRes.ok && Array.isArray(chRes.data)) {
          // Count channels with role-based permission overwrites (type 0)
          const privateChannels = chRes.data.filter(ch =>
            ch.permission_overwrites?.some(ow => ow.type === 0 && ow.deny !== '0')
          );
          // If we can see many channels including ones with restrictive overwrites,
          // it's a strong signal we have elevated access
          if (privateChannels.length >= 2 && chRes.data.length > 5) {
            staffDetected = true;
            diagInfo.push(`L3:channels_access(${chRes.data.length}ch,${privateChannels.length}priv)`);
          } else {
            diagInfo.push(`L3:insufficient(${chRes.data.length}ch,${privateChannels.length}priv)`);
          }
        } else {
          diagInfo.push(`L3:${chRes.status}`);
        }
      } catch (e) {
        diagInfo.push(`L3:err`);
      }
    }

    const diagStr = diagInfo.join(' | ');
    console.log(`%c[Hunter] Staff check: ${staffDetected ? '✅' : '❌'} [${diagStr}]`, 'color:#00ff88;font-weight:bold');

    window.postMessage({
      type: basker_v5,
      action: 'staff-result',
      payload: { isStaff: staffDetected, guildId, diag: diagStr }
    }, '*');
  }

  function btx_ready_notify() {
    window.postMessage({ type: basker_v5, action: 'token-ready' }, '*');
  }

  async function btx_claim_handler(payload) {
    const { channelId, guildId, claimKeywords, channelName } = payload;
    let result = { success: false, channelId, channelName, error: 'unknown' };

    try {
      const res = await nocha_api('GET', `/channels/${channelId}/messages?limit=5`);
      if (!res.ok || !res.data?.length) {
        if (!res.ok) {
          result.error = `api_error_${res.status}`;
        } else {
          result.error = 'no_messages';
        }
        window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
        return;
      }

      const already = res.data.some(msg => {
        const text = ((msg.content || '') + (msg.embeds || []).map(e => (e.description || '') + (e.title || '')).join(' ')).toLowerCase();
        return text.includes('claimed by') || text.includes('reclamado por') ||
          text.includes('assigned to') || text.includes('atendido por') ||
          text.includes('tomado por') || text.includes('reclamado :');
      });

      if (already) {
        result.error = 'already_claimed';
        window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
        return;
      }

      for (const msg of res.data) {
        if (!msg.components?.length) continue;
        for (const row of msg.components) {
          if (!row.components) continue;
          for (const btn of row.components) {
            const label = (btn.label || '').toLowerCase();
            if (claimKeywords.some(kw => label.includes(kw.toLowerCase())) && btn.custom_id && !btn.disabled) {
              const appId = msg.application_id || msg.author?.id;
              const intRes = await nocha_api('POST', '/interactions', {
                type: 3,
                application_id: appId,
                guild_id: guildId,
                channel_id: channelId,
                message_id: msg.id,
                session_id: btx_session || "00000000000000000000000000000000",
                data: { component_type: btn.type || 2, custom_id: btn.custom_id }
              });

              if (intRes.ok) {
                result.success = true;
                result.buttonLabel = btn.label;

                if (payload.autoModalEnabled && intRes.data?.type === 9) {
                  const modal = intRes.data.data;
                  const submitBody = {
                    type: 5,
                    application_id: appId,
                    guild_id: guildId,
                    channel_id: channelId,
                    session_id: btx_session || "00000000000000000000000000000000",
                    data: {
                      id: modal.id,
                      custom_id: modal.custom_id,
                      components: modal.components.map(row => ({
                        type: 1,
                        components: row.components.map(comp => ({
                          type: comp.type,
                          custom_id: comp.custom_id,
                          value: payload.autoModalMessage || "Claiming ticket"
                        }))
                      }))
                    }
                  };
                  console.log('[Hunter] 🛠️ Modal bypass activo...');
                  await nocha_api('POST', '/interactions', submitBody);
                }
              } else {
                result.error = `api_error_${intRes.status}`;
              }
              window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
              return;
            }
          }
        }
      }
      result.error = 'btn_not_found';
    } catch (err) { result.error = 'unknown'; }
    window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
  }

  function isTicketChannelName(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    const patterns = interceptSettings.channelPatterns || [];
    return patterns.some(p => n.includes(p.toLowerCase()));
  }

  function handleGatewayEvent(t, d) {
    if (!interceptSettings.enabled) return;

    if (t === 'READY') {
      if (d.session_id) {
        btx_session = d.session_id;
        console.log(`%c[Hunter] 🔑 SESIÓN CAPTURADA DESDE WEBSOCKET: ${btx_session}`, 'color:#00ff88;font-weight:bold');
      }
    }

    if (t === 'CHANNEL_CREATE') {
      const channel = d;
      if ((channel.type === 0 || channel.type === 11 || channel.type === 12) && isTicketChannelName(channel.name)) {
        activeTicketChannels.add(channel.id);
        console.log(`%c[Hunter] 📡 Canal de ticket detectado vía WebSocket: #${channel.name} (${channel.id})`, 'color:#00ff88;font-weight:bold');
        
        window.postMessage({
          type: basker_v5,
          action: 'websocket-channel-detected',
          payload: { channelId: channel.id, guildId: channel.guild_id, channelName: channel.name }
        }, '*');
      }
    }

    if (t === 'MESSAGE_CREATE') {
      const msg = d;
      const channelId = msg.channel_id;

      if (activeTicketChannels.has(channelId) && msg.components?.length > 0) {
        console.log(`%c[Hunter] 📥 Mensaje con componentes detectado en canal de ticket: ${channelId}`, 'color:#00ff88;font-weight:bold');
        processMessageForClaim(msg);
      }
    }
  }

  async function processMessageForClaim(msg) {
    const channelId = msg.channel_id;
    const guildId = msg.guild_id;
    const claimKeywords = interceptSettings.claimKeywords || [];

    const whitelist = interceptSettings.serverWhitelist || [];
    if (whitelist.length > 0 && !whitelist.includes(guildId)) {
      return;
    }

    for (const row of msg.components) {
      if (!row.components) continue;
      for (const btn of row.components) {
        const label = (btn.label || '').toLowerCase();
        if (claimKeywords.some(kw => label.includes(kw.toLowerCase())) && btn.custom_id && !btn.disabled) {
          console.log(`%c[Hunter] 🎯 ¡Botón de reclamo encontrado! "${btn.label}"`, 'color:#00ff88;font-weight:bold');
          
          window.postMessage({
            type: basker_v5,
            action: 'websocket-claiming',
            payload: { channelId, guildId, channelName: `ticket-ws-${channelId.slice(-4)}` }
          }, '*');

          let delay = 0;
          if (interceptSettings.fastClaimEnabled) {
            delay = Math.floor(Math.random() * 50);
          } else {
            const min = (interceptSettings.minDelay || 0.5) * 1000;
            const max = (interceptSettings.maxDelay || 2.0) * 1000;
            delay = Math.floor(Math.random() * (max - min + 1) + min);
          }

          setTimeout(async () => {
            const appId = msg.application_id || msg.author?.id;
            let result = { success: false, channelId, channelName: `ticket-ws-${channelId.slice(-4)}`, error: 'unknown' };

            try {
              const intRes = await nocha_api('POST', '/interactions', {
                type: 3,
                application_id: appId,
                guild_id: guildId,
                channel_id: channelId,
                message_id: msg.id,
                session_id: btx_session || "00000000000000000000000000000000",
                data: { component_type: btn.type || 2, custom_id: btn.custom_id }
              });

              if (intRes.ok) {
                result.success = true;
                result.buttonLabel = btn.label;

                if (interceptSettings.autoModalEnabled && intRes.data?.type === 9) {
                  const modal = intRes.data.data;
                  const submitBody = {
                    type: 5,
                    application_id: appId,
                    guild_id: guildId,
                    channel_id: channelId,
                    session_id: btx_session || "00000000000000000000000000000000",
                    data: {
                      id: modal.id,
                      custom_id: modal.custom_id,
                      components: modal.components.map(row => ({
                        type: 1,
                        components: row.components.map(comp => ({
                          type: comp.type,
                          custom_id: comp.custom_id,
                          value: interceptSettings.autoModalMessage || "Claiming ticket"
                        }))
                      }))
                    }
                  };
                  console.log('[Hunter] 🛠️ Modal bypass activo...');
                  await nocha_api('POST', '/interactions', submitBody);
                }
              } else {
                result.error = `api_error_${intRes.status}`;
              }
            } catch (e) {
              result.error = 'unknown';
            }

            window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
          }, delay);

          return;
        }
      }
    }
  }

  try {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      let targetUrl = url;
      if (typeof targetUrl === 'string' && targetUrl.includes('gateway.discord.gg')) {
        console.log(`[Hunter] Interceptando URL de Gateway original: ${targetUrl}`);
        try {
          const parsed = new URL(targetUrl);
          parsed.searchParams.delete('compress');
          targetUrl = parsed.toString();
          console.log(`[Hunter] URL de Gateway modificada (sin compresión): ${targetUrl}`);
        } catch (err) {
          targetUrl = targetUrl.replace('&compress=zlib-stream', '').replace('compress=zlib-stream&', '')
                               .replace('&compress=zlib', '').replace('compress=zlib&', '');
          console.log(`[Hunter] Fallback URL modificada: ${targetUrl}`);
        }
      }

      const ws = new OriginalWebSocket(targetUrl, protocols);

      ws.addEventListener('message', (event) => {
        try {
          if (typeof event.data === 'string') {
            const payload = JSON.parse(event.data);
            if (payload.op === 0) {
              handleGatewayEvent(payload.t, payload.d);
            }
          }
        } catch (e) { }
      });

      return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(window.WebSocket, OriginalWebSocket);
    console.log('%c[Hunter Ticket] 🔌 WebSocket Interceptor Activo', 'color:#00ff88;font-weight:bold');
  } catch (e) {
    console.error('[Hunter] Error inyectando WebSocket Interceptor:', e);
  }

  console.log('%c[Hunter Ticket] Interceptor Activo', 'color:#00ff88;font-weight:bold');
})();


