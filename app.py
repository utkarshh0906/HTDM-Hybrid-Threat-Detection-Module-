"""
╔══════════════════════════════════════════════════════════════════╗
║   Hybrid Threat Detection — FastAPI Backend  (app.py)           ║
╚══════════════════════════════════════════════════════════════════╝

HOW TO RUN:
    1. Place this file + frontend.html + all 3 .pkl files in the same folder
    2. pip install fastapi uvicorn joblib scikit-learn scipy nltk numpy
    3. uvicorn app:app --reload
    4. Open  http://127.0.0.1:8000  in your browser  ← NOT the .html file directly

WHY THIS WORKS:
    The original frontend.html has no fetch() call — it uses a local
    analyzeContent() heuristic. This app serves the HTML and injects
    a small <script> at the bottom that overrides scanContent() +
    analyzeContent() to call the real /analyze endpoint.
    The original .html file is NEVER modified on disk.
"""

import os, re, hashlib, random, logging
from pathlib import Path

import numpy as np
import joblib
import nltk

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from scipy.sparse import hstack, csr_matrix

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("hybrid-threat")

# ── NLTK stopwords ────────────────────────────────────────────────────────────
nltk.download("stopwords", quiet=True)
from nltk.corpus import stopwords
STOP: set = set(stopwords.words("english"))

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE = Path(__file__).parent
FRONTEND_FILE = BASE / "frontend.html"
PATHS = {
    "fake":    BASE / "fake_news_model.pkl",
    "bully":   BASE / "cyberbullying_model.pkl",
    "ai_text": BASE / "ai_text_model.pkl",
}


# ─────────────────────────────────────────────────────────────────────────────
# Text helpers  (must match notebook exactly)
# ─────────────────────────────────────────────────────────────────────────────
def clean(text: str) -> str:
    if not isinstance(text, str): return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\.\S+", " ", text)
    text = re.sub(r"@\w+|#\w+",        " ", text)
    text = re.sub(r"[^a-z\s]",         " ", text)
    text = re.sub(r"\s+",              " ", text).strip()
    return " ".join(w for w in text.split() if w not in STOP and len(w) > 2)


def linguistic_features(text: str) -> list:
    if not isinstance(text, str) or not text:
        return [0.0] * 8
    words = text.split()
    sents = [s.strip() for s in re.split(r"[.!?]", text) if s.strip()]
    nw, ns = max(len(words), 1), max(len(sents), 1)
    avg_sent   = nw / ns
    ttr        = len(set(words)) / nw
    avg_wlen   = float(np.mean([len(w) for w in words]))
    wlen_std   = float(np.std([len(w) for w in words]))
    punct_r    = sum(1 for c in text if c in ".,;:()[]") / len(text)
    comma_r    = text.count(",") / nw
    slens      = [len(s.split()) for s in sents]
    burstiness = np.std(slens) / (np.mean(slens) + 1e-9)
    caps_r     = sum(1 for c in text if c.isupper()) / len(text)
    return [avg_sent, ttr, avg_wlen, wlen_std, punct_r, comma_r, burstiness, caps_r]


# ─────────────────────────────────────────────────────────────────────────────
# Deepfake heuristic scorer
# ─────────────────────────────────────────────────────────────────────────────
class DeepfakeScorer:
    TIERS = {
        "high":   ["deepfake","deep fake","face swap","faceswap","synthetic face",
                   "ai generated image","fake video","manipulated video","gan",
                   "stable diffusion","midjourney","dalle","diffusion model",
                   "neural face","synthetic media"],
        "medium": ["photoshop","edited photo","altered image","manipulated image",
                   "cloned","morphed","retouched","cgi","rendered",
                   "generated","fabricated","doctored"],
        "low":    ["image","photo","video","face","portrait",
                   "picture","screenshot","clip","footage"],
    }
    W = {"high": 0.65, "medium": 0.25, "low": 0.05}

    def score(self, text: str) -> int:
        tl = (text or "").lower()
        s = 0.05
        for tier, words in self.TIERS.items():
            hits = sum(1 for w in words if w in tl)
            s   += self.W[tier] * min(hits, 3) / 3
        seed  = int(hashlib.md5(tl.encode()).hexdigest()[:8], 16)
        noise = random.Random(seed).uniform(-0.04, 0.04)
        return int(round(min(max(s + noise, 0.0), 0.99) * 100))


# ─────────────────────────────────────────────────────────────────────────────
# Model registry
# ─────────────────────────────────────────────────────────────────────────────
class Registry:
    def __init__(self):
        self.fake  = None
        self.bully = None
        self.ai    = None
        self.df    = DeepfakeScorer()

    def load(self):
        for key, attr in [("fake","fake"),("bully","bully"),("ai_text","ai")]:
            p = PATHS[key]
            if p.exists():
                setattr(self, attr, joblib.load(p))
                log.info(f"✅  {p.name} loaded")
            else:
                log.warning(f"⚠️   {p.name} NOT FOUND — {attr} score will return 0")

    def _prob(self, model, text_clean: str) -> int:
        try:
            return int(round(float(model.predict_proba([text_clean])[0][1]) * 100))
        except Exception as e:
            log.error(e); return 0

    def fake_score(self, c: str)  -> int: return self._prob(self.fake,  c) if self.fake  else 0
    def bully_score(self, c: str) -> int: return self._prob(self.bully, c) if self.bully else 0

    def ai_score(self, c: str) -> int:
        if self.ai is None: return 0
        try:
            tf  = self.ai["tfidf"].transform([c])
            ft  = self.ai["scaler"].transform([linguistic_features(c)])
            X   = hstack([tf, csr_matrix(ft)])
            return int(round(float(self.ai["clf"].predict_proba(X)[0][1]) * 100))
        except Exception as e:
            log.error(e); return 0


reg = Registry()


# ─────────────────────────────────────────────────────────────────────────────
# The JS bridge injected into the served HTML
#
# This replaces the local analyzeContent() and scanContent() with versions
# that call POST /analyze.  The original .html file is never modified.
# ─────────────────────────────────────────────────────────────────────────────
JS_BRIDGE = """
<script id="api-bridge">
/* ── API Bridge injected by app.py ─────────────────────────────────
   Overrides the local analyzeContent() heuristic so that scanContent()
   calls the real FastAPI /analyze endpoint instead.
   The original frontend.html file is untouched on disk.
──────────────────────────────────────────────────────────────────── */

// Override scanContent to be async so we can await the API
window.scanContent = async function () {
  const text = document.getElementById("contentInput").value.trim();
  if (!text) {
    const ta = document.getElementById("contentInput");
    ta.style.border = "1px solid #ef4444";
    setTimeout(() => { ta.style.border = ""; }, 1500);
    return;
  }

  // Show scanning animation
  document.getElementById("defaultHint").classList.add("hidden");
  document.getElementById("resultCards").classList.add("hidden");
  const anim = document.getElementById("scanningAnim");
  anim.classList.remove("hidden");
  anim.classList.add("flex");

  const btn = document.getElementById("scanBtn");
  btn.disabled = true;
  btn.classList.add("opacity-60", "cursor-not-allowed");

  try {
    // ── Call the FastAPI backend ──────────────────────────────────
    const res = await fetch("/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Server error " + res.status);
    }

    const scores = await res.json();
    // scores = { fakeScore, bullyScore, deepfakeScore, aiTextScore }

    // Mimic the original 2.2 s "scanning" feel before showing results
    setTimeout(() => {
      showResults(scores);
      const mx      = Math.max(scores.fakeScore, scores.bullyScore, scores.deepfakeScore);
      const verdict = mx >= 70 ? "high" : mx >= 35 ? "moderate" : "safe";
      appState.scans.unshift({
        text: text.length > 80 ? text.slice(0, 80) + "…" : text,
        timestamp: new Date(),
        ...scores,
        verdict
      });
      btn.disabled = false;
      btn.classList.remove("opacity-60", "cursor-not-allowed");
    }, 2200);

  } catch (err) {
    // Hide animation and show inline error
    anim.classList.add("hidden");
    anim.classList.remove("flex");
    btn.disabled = false;
    btn.classList.remove("opacity-60", "cursor-not-allowed");

    // Show error inside the results section so the user sees it
    document.getElementById("defaultHint").classList.remove("hidden");
    document.getElementById("defaultHint").innerHTML =
      `<span class="material-symbols-outlined text-3xl text-red-400">wifi_off</span>
       <p class="text-sm text-center text-red-500 font-semibold mt-1">Backend error: ${err.message}</p>
       <p class="text-xs text-center text-slate-500 dark:text-slate-400 mt-1">
         Make sure <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">uvicorn app:app --reload</code> is running
         and you opened <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">http://127.0.0.1:8000</code>
       </p>`;
    console.error("[API Bridge]", err);
  }
};
/* ── End API Bridge ─────────────────────────────────────────────── */
</script>
"""


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Hybrid Threat Detection API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    log.info("Loading models...")
    reg.load()
    log.info("Backend ready →  http://127.0.0.1:8000")
    if not FRONTEND_FILE.exists():
        log.warning(f"⚠️  frontend.html not found at {FRONTEND_FILE}  — GET / will return 404")


# ─────────────────────────────────────────────────────────────────────────────
# Serve the frontend  (injects the JS bridge)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """
    Serves frontend.html with the API bridge script injected just before </body>.
    Open  http://127.0.0.1:8000  in your browser — NOT the .html file directly.
    """
    if not FRONTEND_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail=f"frontend.html not found. Place it next to app.py ({BASE})"
        )

    html = FRONTEND_FILE.read_text(encoding="utf-8")

    # Inject the bridge just before </body> so it runs after the page JS loads
    if "</body>" in html:
        html = html.replace("</body>", JS_BRIDGE + "\n</body>", 1)
    else:
        html += JS_BRIDGE   # fallback: append to end

    return HTMLResponse(content=html, status_code=200)


# ─────────────────────────────────────────────────────────────────────────────
# Analyze endpoint
# ─────────────────────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    text: str


class AnalyzeResponse(BaseModel):
    fakeScore:     int   # 0-99  ← frontend reads this
    bullyScore:    int   # 0-99  ← frontend reads this
    deepfakeScore: int   # 0-99  ← frontend reads this
    aiTextScore:   int   # 0-99  (bonus debug field)


@app.get("/health")
async def health():
    return {
        "fake_loaded":  reg.fake  is not None,
        "bully_loaded": reg.bully is not None,
        "ai_loaded":    reg.ai    is not None,
        "frontend":     FRONTEND_FILE.exists(),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    raw = req.text.strip()
    if not raw:
        raise HTTPException(status_code=422, detail="text must not be empty")

    c  = clean(raw)
    fs = reg.fake_score(c)
    bs = reg.bully_score(c)
    ai = reg.ai_score(c)
    ds = reg.df.score(raw)

    log.info(f"fake={fs} bully={bs} deepfake={ds} ai={ai}  [{len(raw)}ch]")

    return AnalyzeResponse(
        fakeScore=fs,
        bullyScore=bs,
        deepfakeScore=ds,
        aiTextScore=ai,
    )


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

#-------------wrapper class for extention
class ExtensionResponse(BaseModel):
    fake_score: float
    bullying: bool
    ai_generated: bool
    deepfake_score: int


@app.post("/extension/analyze", response_model=ExtensionResponse)
async def extension_analyze(req: AnalyzeRequest):
    """
    Wrapper for Chrome Extension
    Converts your existing response format → extension-friendly format
    """

    # Call your existing logic (same as /analyze)
    raw = req.text.strip()
    if not raw:
        raise HTTPException(status_code=422, detail="text must not be empty")

    c  = clean(raw)
    fs = reg.fake_score(c)
    bs = reg.bully_score(c)
    ai = reg.ai_score(c)
    ds = reg.df.score(raw)

    return ExtensionResponse(
        fake_score=fs / 100,          # convert to 0–1
        bullying=bs > 50,             # threshold
        ai_generated=ai > 50,         # threshold
        deepfake_score=ds             # keep raw
    )