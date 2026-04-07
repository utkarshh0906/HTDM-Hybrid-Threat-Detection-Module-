// ── background.js ─────────────────────────────────────────────────────────
// Service worker: creates the right-click context menu item and relays
// messages between the content script and the FastAPI backend.

const API_URL = "http://127.0.0.1:8000/analyze";

// ── Create context-menu entry on install ──────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       "htd-analyze",
    title:    "🛡️ Analyze with Threat Detector",
    contexts: ["selection"]
  });
});

// ── Context-menu click → send text to the active tab's content script ─────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "htd-analyze" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: "HTD_ANALYZE",
      text: info.selectionText.trim()
    });
  }
});

// ── Handle API fetch requests from content script ─────────────────────────
// Content scripts can't always reach localhost due to CORS in some Chrome
// versions, so we proxy through the service worker which has direct access.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "HTD_FETCH") {
    fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text: msg.text })
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true,  data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true; // keep channel open for async response
  }

  if (msg.type === "HTD_PING") {
    fetch("http://127.0.0.1:8000/health")
      .then(r => r.json())
      .then(d => sendResponse({ ok: true,  data: d }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
