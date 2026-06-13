(() => {
  'use strict';

  let BOTX_ACTIVE = true;
  let autoReplyMessage = '';
  let autoReplyEnabled = false;
  let claimCount = 0;
  let logEntries = [];
  let channelPatterns = [];
  let claimKeywords = [];

  let btx_processed = new Set();
  let currentGuildId = null;
  let processing = false;
  let polling = false;
  let btx_ready = false;
  let isStaff = false;

  const basker_v5 = 'atc-msg-v5';

  const DEFAULT_CHANNEL_PATTERNS = [
    'consulta-', 'consulta_', 'denuncia-', 'denuncia_',
    'ticket-', 'ticket_', 'support-', 'support_',
    'help-', 'help_', 'soporte-', 'soporte_',
    'mod-', 'modmail-', 'report-', 'report_'
  ];

  const DEFAULT_CLAIM_KEYWORDS = [
    'claim', 'reclamar', 'tomar', 'take', 'accept',
    'aceptar', 'grab', 'assign to me', 'asignar',
    'claim ticket', 'take ticket'
  ];

  function loadSettings() {
    if (!chrome?.storage?.sync) {
      channelPatterns = [...DEFAULT_CHANNEL_PATTERNS];
      claimKeywords = [...DEFAULT_CLAIM_KEYWORDS];
      return;
    }
    chrome.storage.sync.get({
      enabled: true, claimCount: 0, logEntries: [],
      autoReplyMessage: '', autoReplyEnabled: false,
      customChannelPatterns: [], customClaimKeywords: [],
      useDefaultPatterns: true, useDefaultKeywords: true,
      minDelay: 0.5, maxDelay: 2.0, soundEnabled: true,
      serverWhitelist: [], autoModalEnabled: true, autoModalMessage: 'Claiming ticket',
      webhookUrl: '', claimsByServer: {}
    }, (d) => {
      BOTX_ACTIVE = d.enabled;
      claimCount = d.claimCount;
      logEntries = d.logEntries || [];
      autoReplyMessage = d.autoReplyMessage;
      autoReplyEnabled = d.autoReplyEnabled;
      channelPatterns = d.useDefaultPatterns
        ? [...DEFAULT_CHANNEL_PATTERNS, ...d.customChannelPatterns]
        : (d.customChannelPatterns.length ? d.customChannelPatterns : [...DEFAULT_CHANNEL_PATTERNS]);
      claimKeywords = d.useDefaultKeywords
        ? [...DEFAULT_CLAIM_KEYWORDS, ...d.customClaimKeywords]
        : (d.customClaimKeywords.length ? d.customClaimKeywords : [...DEFAULT_CLAIM_KEYWORDS]);

      window.atcSettings = {
        minDelay: d.minDelay,
        maxDelay: d.maxDelay,
        soundEnabled: d.soundEnabled,
        webhookUrl: d.webhookUrl,
        serverWhitelist: d.serverWhitelist,
        autoModalEnabled: d.autoModalEnabled,
        autoModalMessage: d.autoModalMessage
      };

      updateOverlay();
    });
  }

  if (chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(() => loadSettings());

  function log(msg, link = null) {
    const timeStr = new Date().toLocaleTimeString();
    const entry = {
      text: `[${timeStr}] ${msg}`,
      link: link,
      timestamp: Date.now()
    };

    console.log(`%c[Hunter Ticket] [${timeStr}] ${msg}`, 'color:#00ff88;font-weight:bold');

    logEntries.unshift(entry);
    if (logEntries.length > 50) logEntries.pop();
    if (chrome?.storage?.sync) chrome.storage.sync.set({ logEntries });
    addOverlayLog(entry);
  }

  function isTicketChannel(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return channelPatterns.some(p => n.includes(p.toLowerCase()));
  }

  function getGuildId() {
    const m = window.location.pathname.match(/\/channels\/(\d+)/);
    return m ? m[1] : null;
  }

  function send(action, payload) {
    window.postMessage({ type: basker_v5, action, payload }, '*');
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type !== basker_v5) return;
    const { action, payload } = e.data;

    switch (action) {
      case 'token-ready':
        if (!btx_ready) {
          btx_ready = true;
          log('🔑 Hunter AUTH LISTO');
          updateOverlay();
        }
        break;

      case 'channels-result':
        polling = false;
        handleChannels(payload.channels);
        break;

      case 'claim-result':
        handleClaimResult(payload);
        break;

      case 'reply-result':
        if (payload.success) log('✅ Respuesta enviada con éxito');
        break;

      case 'staff-result':
        if (payload.guildId === currentGuildId) {
          isStaff = payload.isStaff;
          if (isStaff) log('🛡️ Hunter STAFF VERIFICADO');
          else log('⚠️ SIN ACCESO DE STAFF DETECTADO');
          updateOverlay();
        }
        break;
    }
  });

  function pollChannels() {
    if (!BOTX_ACTIVE || !btx_ready) return;

    const guildId = getGuildId();
    if (!guildId) return;

    if (guildId !== currentGuildId) {
      currentGuildId = guildId;
      btx_processed.clear();
      isStaff = false;
      log(`📡 ESCANEANDO SERVIDOR: ${guildId}`);
      updateOverlay();
      send('check-staff', { guildId });
    }

    if (!isStaff) return;

    const whitelist = window.atcSettings?.serverWhitelist || [];
    if (whitelist.length > 0 && !whitelist.includes(guildId)) {
      if (btx_processed.size === 0) log('🚫 SERVIDOR NO EN LISTA BLANCA');
      btx_processed.add('not-whitelisted');
      return;
    }

    if (polling) return;
    polling = true;
    send('fetch-channels', { guildId });
  }

  function handleChannels(channels) {
    if (!channels || !Array.isArray(channels)) return;

    let foundAny = false;

    for (const ch of channels) {
      if (ch.type !== 0) continue;
      if (!isTicketChannel(ch.name)) continue;

      if (!btx_processed.has(ch.id)) {
        foundAny = true;
        nocha_claim(ch.id, currentGuildId, ch.name);
      }
    }

    if (!foundAny && btx_processed.size === 0) {
      log('🔎 SERVIDOR LIMPIO. SIN TICKETS.');
      btx_processed.add('initialized');
    }
  }

  function nocha_claim(channelId, guildId, name) {
    if (processing === channelId) return;

    const minVal = window.atcSettings?.minDelay;
    const maxVal = window.atcSettings?.maxDelay;
    const min = (minVal !== undefined && minVal !== null ? minVal : 0.5) * 1000;
    const max = (maxVal !== undefined && maxVal !== null ? maxVal : 2.0) * 1000;
    const delay = Math.floor(Math.random() * (max - min + 1) + min);

    const ticketLink = `https://discord.com/channels/${currentGuildId}/${channelId}`;
    log(`⏳ RECLAMANDO #${name} EN ${(delay / 1000).toFixed(1)}s...`, ticketLink);

    setTimeout(() => {
      send('claim-ticket', {
        channelId,
        guildId,
        claimKeywords,
        channelName: name,
        autoModalEnabled: window.atcSettings?.autoModalEnabled,
        autoModalMessage: window.atcSettings?.autoModalMessage,
        webhookUrl: window.atcSettings?.webhookUrl
      });
    }, delay);
  }

  function playClaimSound() {
    if (!window.atcSettings?.soundEnabled) return;
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.4;
      audio.play();
    } catch (e) { }
  }

  function handleClaimResult(payload) {
    const { success, channelId, buttonLabel, error, channelName } = payload;

    if (success) {
      btx_processed.add(channelId);
      claimCount++;

      chrome.storage.sync.get({ claimsByServer: {} }, (data) => {
        const stats = data.claimsByServer;
        stats[currentGuildId] = (stats[currentGuildId] || 0) + 1;
        chrome.storage.sync.set({ claimCount, claimsByServer: stats });
      });

      updateOverlay();
      flashOverlay();
      playClaimSound();

      const ticketLink = `https://discord.com/channels/${currentGuildId}/${channelId}`;
      log(`✅ RECLAMADO: #${channelName} (${buttonLabel})`, ticketLink);

      const webhookUrl = window.atcSettings?.webhookUrl;
      if (webhookUrl) {
        chrome.runtime.sendMessage({
          action: 'send-webhook',
          url: webhookUrl,
          payload: {
            content: `🎯 **Hunter Ticket: Ticket Reclaimed in #${channelName}**`,
            embeds: [{
              title: "🎫 Reclamo Exitoso - Hunter Ticket",
              color: 0x00ff88,
              fields: [
                { name: "Grid ID", value: `\`${currentGuildId}\``, inline: true },
                { name: "Sector", value: `#${channelName}`, inline: true },
                { name: "Tag", value: buttonLabel, inline: true }
              ],
              footer: { text: "Hunter Ticket v5 | by BTX DEVS" },
              timestamp: new Date().toISOString()
            }]
          }
        });
      }

      if (autoReplyEnabled && autoReplyMessage.trim()) {
        setTimeout(() => {
          log(`💬 ENVIANDO RESPUESTA: #${channelName}...`, ticketLink);
          send('send-reply', { channelId, message: autoReplyMessage.trim() });
        }, 2000);
      }
    } else {
      if (payload.error === 'btn_not_found') { }
      else {
        btx_processed.add(channelId);
        let errorMsg = payload.error;
        if (errorMsg === 'already_claimed') errorMsg = 'TAKEN';
        log(`⚠️ #${channelName}: ${errorMsg}`);
      }
    }
  }

  let overlayEl = null, overlayLogEl = null;

  function createOverlay() {
    if (document.getElementById('ticketsniper-overlay')) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'ticketsniper-overlay';
    overlayEl.innerHTML = `
      <div class="ts-header">
        <div class="ts-logo">
          <span class="ts-icon">🎯</span>
          <span class="ts-title">Hunter Ticket</span>
        </div>
        <div class="ts-controls">
          <span id="ts-status" class="ts-status ts-active">ON</span>
          <button id="ts-toggle-btn" class="ts-btn" title="Activar/Pausar">⚡</button>
          <button id="ts-minimize-btn" class="ts-btn" title="Minimizar">─</button>
          <button id="ts-close-btn" class="ts-btn ts-btn-close" title="Ocultar overlay">✕</button>
        </div>
      </div>
      <div id="ts-body" class="ts-body">
        <div class="ts-stats">
          <div class="ts-stat">
            <span class="ts-stat-num" id="ts-claim-count">0</span>
            <span class="ts-stat-label">RECLAIMED</span>
          </div>
          <div class="ts-stat">
            <span class="ts-stat-num" id="ts-token-status">⏳</span>
            <span class="ts-stat-label">AUTH</span>
          </div>
          <div class="ts-stat">
            <span class="ts-stat-num" id="ts-staff-status">⏳</span>
            <span class="ts-stat-label">STAFF</span>
          </div>
        </div>
        <div id="ts-staff-warning" class="ts-warning" style="display:none;">
          ⚠️ SIN ACCESO STAFF. Hunter PAUSADO.
        </div>
        <div class="ts-log-container">
          <div class="ts-log-title">📋 REGISTRO</div>
          <div id="ts-log" class="ts-log"></div>
        </div>
      </div>`;

    document.body.appendChild(overlayEl);
    overlayLogEl = document.getElementById('ts-log');

    // Create floating mini-button to reopen overlay
    const miniBtn = document.createElement('div');
    miniBtn.id = 'ts-mini-btn';
    miniBtn.innerHTML = '🎯';
    miniBtn.title = 'Mostrar Hunter Ticket';
    miniBtn.style.display = 'none';
    document.body.appendChild(miniBtn);

    miniBtn.addEventListener('click', () => {
      overlayEl.style.display = '';
      miniBtn.style.display = 'none';
      if (chrome?.storage?.sync) chrome.storage.sync.set({ overlayVisible: true });
    });

    document.getElementById('ts-toggle-btn').addEventListener('click', () => {
      BOTX_ACTIVE = !BOTX_ACTIVE;
      if (chrome?.storage?.sync) chrome.storage.sync.set({ enabled: BOTX_ACTIVE });
      updateOverlay();
      log(BOTX_ACTIVE ? '✅ Hunter ACTIVO' : '⏸️ Hunter PAUSADO');
    });

    document.getElementById('ts-minimize-btn').addEventListener('click', () => {
      const b = document.getElementById('ts-body');
      b.classList.toggle('ts-collapsed');
      document.getElementById('ts-minimize-btn').textContent = b.classList.contains('ts-collapsed') ? '□' : '─';
    });

    document.getElementById('ts-close-btn').addEventListener('click', () => {
      overlayEl.style.display = 'none';
      miniBtn.style.display = 'flex';
      if (chrome?.storage?.sync) chrome.storage.sync.set({ overlayVisible: false });
    });

    // Restore visibility state
    if (chrome?.storage?.sync) {
      chrome.storage.sync.get({ overlayVisible: true }, (data) => {
        if (!data.overlayVisible) {
          overlayEl.style.display = 'none';
          miniBtn.style.display = 'flex';
        }
      });
    }

    makeDraggable(overlayEl);
  }

  function updateOverlay() {
    const s = document.getElementById('ts-status');
    if (s) {
      s.textContent = BOTX_ACTIVE ? 'ON' : 'OFF';
      s.className = `ts-status ${BOTX_ACTIVE ? 'ts-active' : 'ts-paused'}`;
    }
    const c = document.getElementById('ts-claim-count');
    if (c) c.textContent = claimCount;

    const t = document.getElementById('ts-token-status');
    if (t) {
      t.textContent = btx_ready ? '✅' : '⏳';
      t.style.color = btx_ready ? '#00ff88' : '#ffaa00';
    }

    const st = document.getElementById('ts-staff-status');
    const sw = document.getElementById('ts-staff-warning');
    if (st) {
      st.textContent = isStaff ? '🛡️' : (currentGuildId ? '❌' : '⏳');
      st.style.color = isStaff ? '#00ff88' : '#ff4444';
    }
    if (sw) {
      sw.style.display = (currentGuildId && !isStaff) ? 'block' : 'none';
    }
  }

  function addOverlayLog(entry) {
    if (!overlayLogEl) return;
    const d = document.createElement('div');
    d.className = 'ts-log-entry';

    const text = typeof entry === 'string' ? entry : entry.text;
    const link = typeof entry === 'object' ? entry.link : null;

    d.textContent = text;

    if (link) {
      d.classList.add('ts-log-link');
      d.title = 'NAVEGAR AL CANAL';
      d.addEventListener('click', (e) => {
        e.preventDefault();
        send('navigate', { link });
      });
    }

    overlayLogEl.prepend(d);
    while (overlayLogEl.children.length > 15) overlayLogEl.removeChild(overlayLogEl.lastChild);
  }

  function flashOverlay() {
    if (overlayEl) {
      overlayEl.classList.add('ts-flash');
      setTimeout(() => overlayEl.classList.remove('ts-flash'), 600);
    }
  }

  function makeDraggable(el) {
    let d = false, ox, oy;
    const header = el.querySelector('.ts-header');
    header.addEventListener('mousedown', (e) => {
      d = true;
      ox = e.clientX - el.getBoundingClientRect().left;
      oy = e.clientY - el.getBoundingClientRect().top;
      el.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!d) return;
      el.style.left = (e.clientX - ox) + 'px';
      el.style.top = (e.clientY - oy) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      d = false;
      el.style.transition = '';
    });
  }

  function isDiscordApp() {
    const path = window.location.pathname;
    const isAppPath = path.startsWith('/channels') ||
      path.startsWith('/app') ||
      path.startsWith('/login') ||
      path.includes('/@me');
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    const isLandingPage = path === '/' || path === '/download' || path === '/nitro' || path === '/jobs';
    return (isAppPath || isPWA) && !isLandingPage;
  }

  function init() {
    if (!isDiscordApp()) return;

    loadSettings();
    createOverlay();
    log('🚀 HUNTER TICKET CARGADO');

    setInterval(pollChannels, 3000);

    const checkT = setInterval(() => {
      if (btx_ready) { clearInterval(checkT); return; }
      send('check-token');
    }, 1000);

    setTimeout(() => clearInterval(checkT), 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
