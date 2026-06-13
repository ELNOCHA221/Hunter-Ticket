console.log('[Hunter Ticket] Servicio en segundo plano activo');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'send-webhook') {
    const { url, payload } = message;

    if (!url) {
      sendResponse({ success: false, error: 'No URL provided' });
      return false;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async res => {
        if (res.ok) {
          sendResponse({ success: true });
        } else {
          const text = await res.text();
          console.error('[Hunter] Error de Webhook:', text);
          sendResponse({ success: false, error: text });
        }
      })
      .catch(err => {
        console.error('[Hunter] Error de conexión:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }
});
