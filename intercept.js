(function () {
  'use strict';

  let BOTX_AUTH = null;
  let btx_session = null;
  const basker_v5 = 'atc-msg-v5';

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

    if (action === 'check-token' && BOTX_AUTH) btx_ready_notify();
    if (action === 'fetch-channels') {
      const res = await nocha_api('GET', `/guilds/${payload.guildId}/channels`);
      window.postMessage({ type: basker_v5, action: 'channels-result', payload: { channels: res.data || [] } }, '*');
    }
    if (action === 'claim-ticket') await btx_claim_handler(payload);
    if (action === 'send-reply') await nocha_api('POST', `/channels/${payload.channelId}/messages`, { content: payload.message });

    if (action === 'check-staff') {
      let res = await nocha_api('GET', `/users/@me/guilds/${payload.guildId}/member`);
      if (!res.ok) {
        res = await nocha_api('GET', `/guilds/${payload.guildId}/member`);
      }

      const data = res.data;
      if (data && data.permissions) {
        const perms = BigInt(data.permissions);
        const staffMask = BigInt(0x8 | 0x20 | 0x10 | 0x2000 | 0x2 | 0x4);
        const isStaff = (perms & staffMask) !== 0n || data.owner === true;
        window.postMessage({ type: basker_v5, action: 'staff-result', payload: { isStaff, guildId: payload.guildId } }, '*');
      } else {
        window.postMessage({ type: basker_v5, action: 'staff-result', payload: { isStaff: false, guildId: payload.guildId, error: 'no_data' } }, '*');
      }
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

  function btx_ready_notify() {
    window.postMessage({ type: basker_v5, action: 'token-ready' }, '*');
  }

  async function btx_claim_handler(payload) {
    const { channelId, guildId, claimKeywords, channelName } = payload;
    let result = { success: false, channelId, channelName, error: 'unknown' };

    try {
      const res = await nocha_api('GET', `/channels/${channelId}/messages?limit=5`);
      if (!res.ok || !res.data?.length) {
        result.error = 'no_messages';
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
                const msgErr = intRes.data?.message || `Error ${intRes.status}`;
                result.error = `API: ${msgErr}`;
              }
              window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
              return;
            }
          }
        }
      }
      result.error = 'btn_not_found';
    } catch (err) { result.error = err.message; }
    window.postMessage({ type: basker_v5, action: 'claim-result', payload: result }, '*');
  }

  console.log('%c[Hunter Ticket] Interceptor Activo', 'color:#00ff88;font-weight:bold');
})();


