// ── popup.js ──────────────────────────────────────────────────────────────

function checkHealth() {
  const mainDot   = document.getElementById("main-dot");
  const mainStat  = document.getElementById("main-status");
  const mainBadge = document.getElementById("main-badge");
  const modelsDiv = document.getElementById("models-section");

  // Reset to checking state
  mainDot.style.background = "#9ca3af";
  mainStat.textContent     = "Checking…";
  mainBadge.textContent    = "—";
  mainBadge.className      = "badge checking";
  modelsDiv.style.display  = "none";

  chrome.runtime.sendMessage({ type: "HTD_PING" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      mainDot.style.background = "#ef4444";
      mainStat.textContent     = "Backend offline";
      mainBadge.textContent    = "OFFLINE";
      mainBadge.className      = "badge offline";
      return;
    }

    const d = res.data;
    mainDot.style.background = "#10b981";
    mainStat.textContent     = "Backend online";
    mainBadge.textContent    = "ONLINE";
    mainBadge.className      = "badge online";
    modelsDiv.style.display  = "flex";

    // Per-model dots
    setModel("fake",  d.fake_loaded);
    setModel("bully", d.bully_loaded);
    setModel("ai",    d.ai_loaded);
  });
}

function setModel(key, loaded) {
  const dot = document.getElementById(`dot-${key}`);
  const lbl = document.getElementById(`lbl-${key}`);
  if (!dot || !lbl) return;
  if (loaded) {
    dot.className        = "dot-sm ok";
    lbl.textContent      = "Loaded ✓";
    lbl.style.color      = "#10b981";
  } else {
    dot.className        = "dot-sm off";
    lbl.textContent      = "Not found";
    lbl.style.color      = "#ef4444";
  }
}

document.getElementById("refresh-btn").addEventListener("click", checkHealth);

// Auto-check on popup open
checkHealth();
