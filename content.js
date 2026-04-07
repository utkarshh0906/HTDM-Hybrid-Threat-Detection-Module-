// ── content.js ────────────────────────────────────────────────────────────
// Injected into every page. Responsibilities:
//  1. Watch for text selection → show floating tooltip
//  2. On tooltip click (or context-menu message) → show frosted-glass panel
//  3. Fetch analysis from background.js (which proxies to app.py)
//  4. Render results with animated bars + verdict
//  5. Draggable panel, pinning, auto-dismiss

(function () {
  "use strict";

  // ── Guard: only run once even if injected multiple times ────────────────
  if (window.__htdInjected) return;
  window.__htdInjected = true;

  // ── State ─────────────────────────────────────────────────────────────
  let panel       = null;
  let tooltip     = null;
  let pinned      = false;
  let lastText    = "";
  let selTimeout  = null;

  // ── Build the floating tooltip (mini pill shown after selection) ───────
  function buildTooltip() {
    if (tooltip) return;
    tooltip = document.createElement("div");
    tooltip.id = "htd-tooltip";
    tooltip.classList.add("htd-hidden");
    tooltip.innerHTML = `<span>🛡️</span><span>Analyze threat</span>`;
    tooltip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTooltip();
      showPanel(lastText);
    });
    document.body.appendChild(tooltip);
  }

  function showTooltip(x, y) {
    if (!tooltip) buildTooltip();
    // Position just above the selection end
    const top  = Math.max(y - 42, 6);
    const left = Math.min(x, window.innerWidth - 180);
    tooltip.style.top  = top  + "px";
    tooltip.style.left = left + "px";
    tooltip.classList.remove("htd-hidden");
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.add("htd-hidden");
  }

  // ── Build the main frosted-glass panel (once, then reuse) ─────────────
  function buildPanel() {
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "htd-panel";
    panel.classList.add("htd-hidden");
    panel.innerHTML = `
      <!-- Header (drag handle) -->
      <div class="htd-header" id="htd-drag-handle">
        <div class="htd-title">
          <div class="htd-shield">🛡️</div>
          <span>Threat Detection</span>
        </div>
        <button class="htd-close" id="htd-close-btn" title="Close">✕</button>
      </div>

      <!-- Body -->
      <div class="htd-body" id="htd-body">
        <!-- Initial / scanning state -->
        <div class="htd-scanning" id="htd-scanning">
          <div class="htd-scan-ring"></div>
          <p>Analyzing content…</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="htd-footer">
        <span class="htd-footer-tag">HYBRID THREAT DETECTOR</span>
        <button class="htd-pin-btn" id="htd-pin-btn">📌 Pin</button>
      </div>
    `;

    document.body.appendChild(panel);

    // ── Close button ──────────────────────────────────────────────────
    document.getElementById("htd-close-btn").addEventListener("click", () => {
      hidePanel();
    });

    // ── Pin button ────────────────────────────────────────────────────
    document.getElementById("htd-pin-btn").addEventListener("click", () => {
      pinned = !pinned;
      const btn = document.getElementById("htd-pin-btn");
      btn.textContent = pinned ? "📌 Pinned" : "📌 Pin";
      btn.style.color = pinned ? "#8c2bee" : "";
    });

    // ── Make draggable ────────────────────────────────────────────────
    makeDraggable(panel, document.getElementById("htd-drag-handle"));
  }

  // ── Drag logic ─────────────────────────────────────────────────────────
  function makeDraggable(el, handle) {
    let startX, startY, startLeft, startTop;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.id === "htd-close-btn") return;
      e.preventDefault();
      startX    = e.clientX;
      startY    = e.clientY;
      startLeft = parseInt(el.style.left) || 0;
      startTop  = parseInt(el.style.top)  || 0;

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startLeft + dx));
        const newTop  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop  + dy));
        el.style.left = newLeft + "px";
        el.style.top  = newTop  + "px";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    });
  }

  // ── Position panel near the selection, within viewport ─────────────────
  function positionPanel(x, y) {
    const W = 310, H = 380;
    let left = x + 12;
    let top  = y + 16;
    if (left + W > window.innerWidth  - 12) left = x - W - 12;
    if (top  + H > window.innerHeight - 12) top  = y - H - 12;
    left = Math.max(8, left);
    top  = Math.max(8, top);
    panel.style.left = left + "px";
    panel.style.top  = top  + "px";
  }

  // ── Show panel ─────────────────────────────────────────────────────────
  function showPanel(text, anchorX, anchorY) {
    if (!panel) buildPanel();

    lastText = text;

    // Reset body to scanning state
    const body = document.getElementById("htd-body");
    body.innerHTML = `
      <div class="htd-preview">${escHtml(text.slice(0, 180))}${text.length > 180 ? "…" : ""}</div>
      <div class="htd-scanning" id="htd-scanning">
        <div class="htd-scan-ring"></div>
        <p>Analyzing content…</p>
      </div>
    `;

    // Position & reveal
    if (anchorX !== undefined) positionPanel(anchorX, anchorY);
    panel.classList.remove("htd-hidden");
    pinned = false;
    const pinBtn = document.getElementById("htd-pin-btn");
    if (pinBtn) { pinBtn.textContent = "📌 Pin"; pinBtn.style.color = ""; }

    // Fetch from background.js → app.py
    chrome.runtime.sendMessage({ type: "HTD_FETCH", text }, (response) => {
      if (chrome.runtime.lastError) {
        showError("Extension error: " + chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.ok) {
        showError(response ? response.error : "No response from background");
        return;
      }
      renderResults(response.data);
    });
  }

  // ── Render results ─────────────────────────────────────────────────────
  function renderResults(data) {
    const { fakeScore = 0, bullyScore = 0, deepfakeScore = 0, aiTextScore = 0 } = data;
    const maxScore = Math.max(fakeScore, bullyScore, deepfakeScore, aiTextScore);

    const verdict      = maxScore >= 70 ? "high" : maxScore >= 35 ? "moderate" : "safe";
    const verdictLabel = verdict === "high"     ? "High Threat Detected"
                       : verdict === "moderate" ? "Moderate Risk Found"
                       :                          "Content Appears Safe";
    const verdictSub   = verdict === "high"     ? "Strong indicators of harmful content."
                       : verdict === "moderate" ? "Some suspicious signals — verify before sharing."
                       :                          "No significant threat signals detected.";
    const verdictIcon  = verdict === "high" ? "🚨" : verdict === "moderate" ? "⚠️" : "✅";

    const metrics = [
      { key: "fake",     label: "Fake News",     icon: "📰", fill: "fake",     score: fakeScore     },
      { key: "bully",    label: "Cyberbullying",  icon: "😤", fill: "bully",    score: bullyScore    },
      { key: "deepfake", label: "Deepfake Risk",  icon: "🎭", fill: "deepfake", score: deepfakeScore },
      { key: "ai",       label: "AI-Generated",   icon: "🤖", fill: "ai",       score: aiTextScore   },
    ];

    const body = document.getElementById("htd-body");
    body.innerHTML = `
      <div class="htd-preview">${escHtml(lastText.slice(0, 180))}${lastText.length > 180 ? "…" : ""}</div>

      <div class="htd-scores" id="htd-scores">
        ${metrics.map(m => `
          <div class="htd-row">
            <div class="htd-row-top">
              <div class="htd-label"><span>${m.icon}</span>${m.label}</div>
              <div style="display:flex;align-items:center;gap:5px;">
                <span class="htd-badge ${riskClass(m.score)}">${riskLabel(m.score)}</span>
                <span class="htd-pct" id="htd-pct-${m.key}">${m.score}%</span>
              </div>
            </div>
            <div class="htd-track">
              <div class="htd-fill ${m.fill}" id="htd-fill-${m.key}"></div>
            </div>
          </div>
        `).join("")}
      </div>

      <hr class="htd-divider"/>

      <div class="htd-verdict ${verdict}">
        <span class="htd-verdict-icon">${verdictIcon}</span>
        <div class="htd-verdict-text">
          <p>${verdictLabel}</p>
          <p class="htd-v-sub">${verdictSub}</p>
        </div>
      </div>
    `;

    // Animate bars after a tick (so CSS transition fires)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        metrics.forEach(m => {
          const fill = document.getElementById(`htd-fill-${m.key}`);
          if (fill) fill.style.width = m.score + "%";
        });
      });
    });
  }

  // ── Error state ────────────────────────────────────────────────────────
  function showError(msg) {
    const isOffline = msg.toLowerCase().includes("fetch") ||
                      msg.toLowerCase().includes("failed") ||
                      msg.toLowerCase().includes("network") ||
                      msg.toLowerCase().includes("connect");
    const body = document.getElementById("htd-body");
    if (!body) return;
    body.innerHTML = `
      <div class="htd-error">
        <span style="font-size:24px">⚠️</span>
        <p>${isOffline ? "Cannot reach backend" : "Analysis failed"}</p>
        <small>${isOffline
          ? 'Make sure the backend is running:<br><code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:4px;">uvicorn app:app --reload</code>'
          : escHtml(msg)
        }</small>
      </div>
    `;
  }

  // ── Hide panel ─────────────────────────────────────────────────────────
  function hidePanel() {
    if (panel) panel.classList.add("htd-hidden");
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function riskLabel(score) {
    return score >= 70 ? "HIGH" : score >= 35 ? "MODERATE" : "LOW";
  }

  function riskClass(score) {
    return score >= 70 ? "high" : score >= 35 ? "moderate" : "low";
  }

  // ── Text selection listener ────────────────────────────────────────────
  document.addEventListener("mouseup", (e) => {
    // Don't trigger inside our own panel
    if (panel && panel.contains(e.target)) return;
    if (tooltip && tooltip.contains(e.target)) return;

    clearTimeout(selTimeout);
    selTimeout = setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel ? sel.toString().trim() : "";

      if (text.length >= 10) {
        lastText = text;
        // Get bounding rect of selection end
        let x = e.clientX, y = e.clientY;
        try {
          const range = sel.getRangeAt(0);
          const rect  = range.getBoundingClientRect();
          x = rect.right;
          y = rect.bottom;
        } catch (_) {}

        showTooltip(x + window.scrollX, y + window.scrollY);
      } else {
        hideTooltip();
        if (!pinned) hidePanel();
      }
    }, 120);
  });

  // ── Hide on click outside ─────────────────────────────────────────────
  document.addEventListener("mousedown", (e) => {
    if (tooltip && !tooltip.contains(e.target)) hideTooltip();
    if (panel && !panel.contains(e.target) && !pinned) {
      // Small delay so tooltip click can fire first
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length < 10) hidePanel();
      }, 180);
    }
  });

  // ── Context-menu message from background.js ───────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "HTD_ANALYZE" && msg.text) {
      hideTooltip();
      // Position in center of viewport for context-menu trigger
      showPanel(msg.text, window.innerWidth / 2 - 155, 80);
    }
  });

  // ── Keyboard shortcut: Escape to close ────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hidePanel(); hideTooltip(); }
  });

})();
