(() => {
  'use strict';

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

  const el = {
    enabledToggle: document.getElementById('enabledToggle'),
    statusBanner: document.getElementById('statusBanner'),
    statusText: document.getElementById('statusText'),
    claimCountStat: document.getElementById('claimCountStat'),
    autoReplyEnabled: document.getElementById('autoReplyEnabled'),
    autoReplyMessage: document.getElementById('autoReplyMessage'),
    useDefaultPatterns: document.getElementById('useDefaultPatterns'),
    customPatterns: document.getElementById('customPatterns'),
    useDefaultKeywords: document.getElementById('useDefaultKeywords'),
    customKeywords: document.getElementById('customKeywords'),
    patternTags: document.getElementById('patternTags'),
    keywordTags: document.getElementById('keywordTags'),
    logContainer: document.getElementById('logContainer'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    minDelay: document.getElementById('minDelay'),
    maxDelay: document.getElementById('maxDelay'),
    soundEnabled: document.getElementById('soundEnabled'),
    webhookUrl: document.getElementById('webhookUrl'),
    serverWhitelist: document.getElementById('serverWhitelist'),
    autoModalEnabled: document.getElementById('autoModalEnabled'),
    autoModalMessage: document.getElementById('autoModalMessage'),
    bypassStaffCheck: document.getElementById('bypassStaffCheck'),
    fastClaimEnabled: document.getElementById('fastClaimEnabled')
  };

  function loadSettings() {
    chrome.storage.sync.get({
      enabled: true,
      claimCount: 0,
      logEntries: [],
      autoReplyMessage: '',
      autoReplyEnabled: false,
      customChannelPatterns: [],
      customClaimKeywords: [],
      useDefaultPatterns: true,
      useDefaultKeywords: true,
      minDelay: 0.5,
      maxDelay: 2.0,
      soundEnabled: true,
      webhookUrl: '',
      serverWhitelist: [],
      autoModalEnabled: true,
      autoModalMessage: 'Claiming ticket',
      bypassStaffCheck: false,
      fastClaimEnabled: false
    }, (data) => {
      el.enabledToggle.checked = data.enabled;
      el.claimCountStat.textContent = data.claimCount;
      el.autoReplyEnabled.checked = data.autoReplyEnabled;
      el.autoReplyMessage.value = data.autoReplyMessage;
      el.useDefaultPatterns.checked = data.useDefaultPatterns;
      el.useDefaultKeywords.checked = data.useDefaultKeywords;
      el.customPatterns.value = data.customChannelPatterns.join('\n');
      el.customKeywords.value = data.customClaimKeywords.join('\n');
      el.minDelay.value = data.minDelay;
      el.maxDelay.value = data.maxDelay;
      el.soundEnabled.checked = data.soundEnabled;
      el.webhookUrl.value = data.webhookUrl;
      el.serverWhitelist.value = data.serverWhitelist.join('\n');
      el.autoModalEnabled.checked = data.autoModalEnabled;
      el.autoModalMessage.value = data.autoModalMessage;
      el.bypassStaffCheck.checked = data.bypassStaffCheck;
      el.fastClaimEnabled.checked = data.fastClaimEnabled;

      updateStatus(data.enabled);
      renderTags();
      renderLog(data.logEntries);
      toggleDefaults();
    });
  }

  function updateStatus(enabled) {
    if (enabled) {
      el.statusBanner.classList.remove('disabled');
      el.statusText.textContent = 'Hunter Ticket: Scanning...';
    } else {
      el.statusBanner.classList.add('disabled');
      el.statusText.textContent = 'PAUSED';
    }
  }

  function renderTags() {
    el.patternTags.innerHTML = '';
    DEFAULT_CHANNEL_PATTERNS.forEach(p => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p;
      el.patternTags.appendChild(tag);
    });

    el.keywordTags.innerHTML = '';
    DEFAULT_CLAIM_KEYWORDS.forEach(k => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = k;
      el.keywordTags.appendChild(tag);
    });
  }

  function renderLog(entries) {
    if (!entries || entries.length === 0) {
      el.logContainer.innerHTML = '<div class="log-empty">Sin actividad detectada en la red...</div>';
      return;
    }
    el.logContainer.innerHTML = '';
    entries.slice(0, 25).forEach(entry => {
      const div = document.createElement('div');
      div.className = 'log-entry';

      const text = typeof entry === 'string' ? entry : entry.text;
      const link = typeof entry === 'object' ? entry.link : null;

      if (link) {
        const a = document.createElement('a');
        a.href = link;
        a.textContent = text;
        a.className = 'log-link';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.update(tabs[0].id, { url: link });
          });
        });
        div.appendChild(a);
      } else {
        div.textContent = text;
      }

      el.logContainer.appendChild(div);
    });
  }

  function toggleDefaults() {
    document.getElementById('defaultPatternsList').style.display =
      el.useDefaultPatterns.checked ? 'block' : 'none';
    document.getElementById('defaultKeywordsList').style.display =
      el.useDefaultKeywords.checked ? 'block' : 'none';
  }

  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  el.enabledToggle.addEventListener('change', () => {
    const v = el.enabledToggle.checked;
    chrome.storage.sync.set({ enabled: v });
    updateStatus(v);
    showToast(v ? '✅ Hunter ACTIVO' : '⏸️ PAUSADO');
  });

  el.saveBtn.addEventListener('click', () => {
    const customChannelPatterns = el.customPatterns.value
      .split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);

    const customClaimKeywords = el.customKeywords.value
      .split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);

    const serverWhitelist = el.serverWhitelist.value
      .split('\n').map(s => s.trim()).filter(Boolean);

    chrome.storage.sync.set({
      enabled: el.enabledToggle.checked,
      autoReplyEnabled: el.autoReplyEnabled.checked,
      autoReplyMessage: el.autoReplyMessage.value,
      useDefaultPatterns: el.useDefaultPatterns.checked,
      useDefaultKeywords: el.useDefaultKeywords.checked,
      customChannelPatterns,
      customClaimKeywords,
      minDelay: parseFloat(el.minDelay.value) || 0.5,
      maxDelay: parseFloat(el.maxDelay.value) || 2.0,
      soundEnabled: el.soundEnabled.checked,
      webhookUrl: el.webhookUrl.value.trim(),
      serverWhitelist,
      autoModalEnabled: el.autoModalEnabled.checked,
      autoModalMessage: el.autoModalMessage.value,
      bypassStaffCheck: el.bypassStaffCheck.checked,
      fastClaimEnabled: el.fastClaimEnabled.checked
    }, () => {
      showToast('💾 Hunter CONFIG SINCRONIZADA!');
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.includes('discord.com') || tab.url.includes('discordapp.com'))) {
            chrome.tabs.sendMessage(tab.id, { action: 'settings-updated' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      });
    });
  });

  el.clearLogBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ logEntries: [] }, () => {
      renderLog([]);
      showToast('🗑️ REGISTRO LIMPIADO');
    });
  });

  el.resetBtn.addEventListener('click', () => {
    if (!confirm('¿Resetear toda la configuración?')) return;
    chrome.storage.sync.set({
      enabled: true, claimCount: 0, logEntries: [],
      autoReplyMessage: '', autoReplyEnabled: false,
      customChannelPatterns: [], customClaimKeywords: [],
      useDefaultPatterns: true, useDefaultKeywords: true,
      minDelay: 0.5, maxDelay: 2.0, soundEnabled: true,
      webhookUrl: '', serverWhitelist: [],
      autoModalEnabled: true, autoModalMessage: 'Claiming ticket',
      claimsByServer: {},
      bypassStaffCheck: false,
      fastClaimEnabled: false
    }, () => {
      loadSettings();
      showToast('🔄 Hunter REINICIADO');
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.includes('discord.com') || tab.url.includes('discordapp.com'))) {
            chrome.tabs.sendMessage(tab.id, { action: 'settings-updated' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      });
    });
  });

  document.getElementById('testWebhookBtn').addEventListener('click', () => {
    const url = el.webhookUrl.value.trim();
    if (!url) return showToast('⚠️ Ingresa una URL de webhook');

    showToast('⏳ Probando...');
    chrome.runtime.sendMessage({
      action: 'send-webhook',
      url,
      payload: {
        embeds: [{
          title: "🎯 Hunter Ticket: Webhook Test Success!",
          description: "If you see this, the grid connection is solid.",
          color: 0x00ff88,
          timestamp: new Date().toISOString()
        }]
      }
    }, (res) => {
      if (res?.success) showToast('✅ Webhook enviado!');
      else showToast('❌ Error de conexión');
    });
  });

  document.getElementById('sendReportBtn').addEventListener('click', () => {
    const url = el.webhookUrl.value.trim();
    if (!url) return showToast('⚠️ Ingresa una URL de webhook');

    chrome.storage.sync.get({ claimsByServer: {}, claimCount: 0 }, (data) => {
      const stats = data.claimsByServer;
      const total = data.claimCount;

      let description = `**Hunter Ticket - Grid Report**\n\n**Total Reclaimed:** ${total}\n\n`;
      if (Object.keys(stats).length === 0) {
        description += "_No grid data yet._";
      } else {
        description += "**Sector Breakdown (ID):**\n";
        for (const [id, count] of Object.entries(stats)) {
          description += `• \`${id}\`: ${count} tickets\n`;
        }
      }

      showToast('⏳ Enviando reporte...');
      chrome.runtime.sendMessage({
        action: 'send-webhook',
        url,
        payload: {
          embeds: [{
            title: "📊 Hunter Ticket: Detailed Activity Report",
            description,
            color: 0x00ff88,
            footer: { text: "Accumulated grid stats" },
            timestamp: new Date().toISOString()
          }]
        }
      }, (res) => {
        if (res?.success) showToast('✅ Reporte enviado!');
        else showToast('❌ Error al enviar');
      });
    });
  });

  el.useDefaultPatterns.addEventListener('change', toggleDefaults);
  el.useDefaultKeywords.addEventListener('change', toggleDefaults);

  setInterval(() => {
    chrome.storage.sync.get(['logEntries', 'claimCount'], (data) => {
      if (data.logEntries) renderLog(data.logEntries);
      if (data.claimCount !== undefined) el.claimCountStat.textContent = data.claimCount;
    });
  }, 3000);

  loadSettings();
})();

