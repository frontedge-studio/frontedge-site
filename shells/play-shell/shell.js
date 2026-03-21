/*
  Shared Shell v1.0 (web-first, no build tools)

  Contract between shell and game:

  - window.GAME_CFG must exist (from cfg.js)
  - window.GAME_MODULE must exist (from game.js)
    and must provide:
      init(api) -> void
      resetRun() -> void
      startRun() -> void
      update(dtSec) -> void
      draw(ctx, view) -> void
      onPointerDown(x, y) -> void  (optional)
      onKeyDown(e) -> void         (optional)
      onPauseChanged(isPaused) -> void (optional)

  Shell provides `api` with:
    api.getState() -> {state, score, level, best, difficultyKey, canContinue, continuesUsedThisRun}
    api.setScore(n), api.addScore(delta)
    api.setLevel(n)
    api.setPlayerLane(0|1), api.getPlayerLane()
    api.setCanContinue(bool)
    api.consumeContinue() // sets canContinue false, continuesUsedThisRun=1
    api.playHit(), api.playLevelUp(), api.playDeath()
    api.haptic(ms)
    api.getView() -> {w,h,playerY, laneX:[left,right], bottomUIReservePx}
    api.isPlayableSize() -> boolean
    api.requestGameOver()  // triggers game over
    api.clearHazards()     // tells game to clear notes/orbs/etc
*/
(() => {
  const CFG = window.GAME_CFG;
  const GM = window.GAME_MODULE;

  if (!CFG || !GM) {
    alert("Missing GAME_CFG or GAME_MODULE. Check cfg.js and game.js include order.");
    return;
  }

  const flow = CFG.flow || {};
  const HAS_READY = flow.hasReadyScreen !== false;

  // ---------- DOM ----------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const uiScore = document.getElementById("score");
  const uiBest = document.getElementById("best");
  const uiLvl  = document.getElementById("lvl");

  const pauseDock = document.getElementById("pauseDock");
  const pauseBtn  = document.getElementById("pauseBtnDock");
  const soundBtn  = document.getElementById("soundBtnDock");
  const pauseHint = document.getElementById("pauseHint");

  const overlay = document.getElementById("overlay");
  const ovTitle = document.getElementById("ovTitle");
  const ovSub   = document.getElementById("ovSub");
  const ovFoot  = document.getElementById("ovFoot");

  const countdownWrap  = document.getElementById("countdownWrap");
  const countdownNum   = document.getElementById("countdownNum");
  const countdownLabel = document.getElementById("countdownLabel");

  const diffWrap   = document.getElementById("diffWrap");
  const diffExplain= document.getElementById("diffExplain");
  const diffBtns   = Array.from(document.querySelectorAll(".diffBtn"));

  const continueBtn = document.getElementById("continueBtn");
  const primaryBtn  = document.getElementById("primaryBtn");

  const devPanel = document.getElementById("devPanel");

  const fmt = new Intl.NumberFormat();

  // ---------- Shell State ----------
  let state = "ready"; // ready | playing | paused | dead | ad_countdown | ad_ready
  let score = 0;
  let level = 1;

  const BEST_KEY = (CFG.storage?.bestKey) || "best_v1";
  const RUNS_KEY = (CFG.storage?.runsKey) || "runs_v1";

  const SOUND_KEY = (CFG.storage?.soundKey) || "sound_v1";
  let soundEnabled = (localStorage.getItem(SOUND_KEY) ?? "1") === "1";
  let audioCtx = null;

  function getBest(){ return Number(localStorage.getItem(BEST_KEY) || "0"); }
  function setBest(v){ localStorage.setItem(BEST_KEY, String(v)); }
  function getRuns(){ return Number(localStorage.getItem(RUNS_KEY) || "0"); }
  function incRuns(){ const n = getRuns() + 1; localStorage.setItem(RUNS_KEY, String(n)); return n; }

  let difficultyKey = CFG.difficulty?.defaultKey || "easy";
  let canContinue = true;
  let continuesUsedThisRun = 0;

  let playerLane = 0;

  // ---------- Metrics (local only) ----------
  const Metrics = {
    key: (CFG.storage?.metricsKey) || "metrics_v1",
    data: null,
    load(){
      this.data = JSON.parse(localStorage.getItem(this.key) || "{}");
      for (const k of ["continue_offered","continue_clicked","continue_completed","continue_granted"]) {
        if (typeof this.data[k] !== "number") this.data[k] = 0;
      }
      localStorage.setItem(this.key, JSON.stringify(this.data));
    },
    reset(){
      this.data = { continue_offered:0, continue_clicked:0, continue_completed:0, continue_granted:0 };
      localStorage.setItem(this.key, JSON.stringify(this.data));
    },
    inc(name){
      this.data[name] = (this.data[name] || 0) + 1;
      localStorage.setItem(this.key, JSON.stringify(this.data));
    },
    pct(n, den){ return den ? ((n/den)*100).toFixed(1) + "%" : "0%"; },
    summary(){
      const d = this.data;
      return {
        offered: d.continue_offered,
        clicked: d.continue_clicked,
        completed: d.continue_completed,
        granted: d.continue_granted,
        offerClick: this.pct(d.continue_clicked, d.continue_offered),
        clickComplete: this.pct(d.continue_completed, d.continue_clicked),
        offerComplete: this.pct(d.continue_completed, d.continue_offered),
      };
    }
  };
  Metrics.load();

  // ---------- Dev Panel ----------
  function allowDevPanel(){
    const qs = new URLSearchParams(location.search);
    const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    return isLocalhost || qs.get("dev") === "1";
  }
  function refreshDevPanel(){
    const s = Metrics.summary();
    document.getElementById("mBest").textContent = String(getBest());
    document.getElementById("mRuns").textContent = String(getRuns());
    document.getElementById("mContinuesRun").textContent = String(continuesUsedThisRun);
    document.getElementById("mContinuesLife").textContent = String(s.granted);

    document.getElementById("mOffered").textContent = String(s.offered);
    document.getElementById("mClicked").textContent = String(s.clicked);
    document.getElementById("mCompleted").textContent = String(s.completed);
    document.getElementById("mGranted").textContent = String(s.granted);
    document.getElementById("mOfferClick").textContent = s.offerClick;
    document.getElementById("mClickComplete").textContent = s.clickComplete;
    document.getElementById("mOfferComplete").textContent = s.offerComplete;
  }
  function toggleDevPanel(){
    if (!allowDevPanel()) return;
    refreshDevPanel();
    devPanel.style.display = (devPanel.style.display === "block") ? "none" : "block";
    console.table(Metrics.summary());
  }

  // ---------- Audio ----------
  function ensureAudio(){
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function setSoundEnabled(on){
    soundEnabled = !!on;
    localStorage.setItem(SOUND_KEY, soundEnabled ? "1" : "0");
    soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
    soundBtn.classList.toggle("muted", !soundEnabled);
  }
  function playTone(type, freq0, freq1, dur, gainPeak){
    if (!audioCtx || !soundEnabled) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1 !== null && freq1 !== undefined) {
      try { osc.frequency.exponentialRampToValueAtTime(freq1, t + dur * 0.7); } catch {}
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function playHit(){
    // small random 3-variant hit
    if (!audioCtx || !soundEnabled) return;
    const v = Math.floor(Math.random() * 3);
    if (v === 0) playTone("sine", 520, null, 0.10, 0.10);
    if (v === 1) playTone("triangle", 660, null, 0.10, 0.10);
    if (v === 2) playTone("square", 780, null, 0.10, 0.08);
  }
  function playLevelUp(){
    playTone("sine", 520, 880, 0.20, 0.12);
  }
  function playDeath(){
    playTone("sawtooth", 240, 70, 0.28, 0.14);
  }

  function haptic(ms=15){
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  // ---------- Sizing ----------
  function resizeCanvas(){
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width  = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function isPlayableSize(){
    const minW = CFG.orientation?.minPlayfieldW ?? 280;
    const minH = CFG.orientation?.minPlayfieldH ?? 420;
    if (window.innerWidth < minW || window.innerHeight < minH) return false;
    if ((CFG.orientation?.mode === "portraitOnly") && window.innerWidth > window.innerHeight) return false;
    return true;
  }
  function getBottomUIReservePx(){
    const showPause = (state === "playing" || state === "paused");
    if (!showPause) return 0;
    const rect = pauseDock.getBoundingClientRect();
    const dockH = rect && rect.height ? rect.height : 0;
    return dockH + 12;
  }
  function getView(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    const reserve = getBottomUIReservePx();
    const laneX = [
      w * (CFG.playfield?.laneXLeft ?? 0.25),
      w * (CFG.playfield?.laneXRight ?? 0.75),
    ];
    const playerY = h - (CFG.playfield?.playerBottomMargin ?? 64) - reserve;
    return { w, h, laneX, playerY, bottomUIReservePx: reserve };
  }

  // ---------- Overlay helpers ----------
  function showOverlay(){ overlay.classList.add("show"); }
  function hideOverlay(){ overlay.classList.remove("show"); }

  function syncHud(){
    uiScore.textContent = fmt.format(score);
    uiLvl.textContent   = fmt.format(level);
    uiBest.textContent  = fmt.format(getBest());

    const showPause = (state === "playing" || state === "paused");
    pauseDock.style.display = showPause ? "flex" : "none";
    pauseDock.classList.toggle("paused", state === "paused");

    pauseHint.textContent = CFG.ui?.pauseHintText || "Pause: Space or ⏸";
  }

  // ---------- Difficulty UI ----------
  function applyDifficulty(key){
    difficultyKey = key;
    for (const b of diffBtns) b.classList.toggle("selected", b.dataset.k === key);
    const copy = CFG.difficulty?.copy?.[key];
    if (diffExplain) diffExplain.textContent = copy || "";
    if (GM.setDifficulty) GM.setDifficulty(key);
  }

  diffBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (state !== "ready") return;
      ensureAudio();
      applyDifficulty(btn.dataset.k);
    });
  });

  // ---------- Shell Screens ----------
  function showReady(extraMsg=""){
    state = "ready";
    if (!HAS_READY) { hideOverlay(); return; }
    ovTitle.textContent = CFG.ui?.titleText || "Game";
    ovSub.textContent   = CFG.ui?.titleSubtext || "";
    ovFoot.textContent  = extraMsg || (CFG.ui?.readyFoot || "Press Start.");

    countdownWrap.style.display = "none";
    diffWrap.style.display = (CFG.difficulty?.enabled ? "block" : "none");

    continueBtn.style.display = "none"; // discovery by default
    primaryBtn.style.display  = "inline-block";
    primaryBtn.textContent = "Start";

    showOverlay();
    syncHud();
  }

  function showPaused(reasonText=""){
    state = "paused";
    ovTitle.textContent = "PAUSED";
    ovSub.textContent   = reasonText || "Press Space or click Resume.";
    ovFoot.textContent  = "";

    countdownWrap.style.display = "none";
    diffWrap.style.display = "none";
    continueBtn.style.display = "none";

    primaryBtn.style.display = "inline-block";
    primaryBtn.textContent = "Resume";

    showOverlay();
    syncHud();
    if (GM.onPauseChanged) GM.onPauseChanged(true);
  }

  function showDead(){
    state = "dead";
    ovTitle.textContent = "Game Over";
    const canOffer = !!(CFG.rewarded?.enabled && canContinue);
    ovSub.textContent = canOffer ? (CFG.rewarded?.deadCopy || "One save per run is available.") : (CFG.ui?.deadCopy || "You lost.");
    ovFoot.textContent = "";

    countdownWrap.style.display = "none";
    diffWrap.style.display = "none";

    if (canOffer) {
      continueBtn.style.display = "inline-block";
      continueBtn.textContent = CFG.rewarded?.buttonText || "Watch Ad to Continue";
      continueBtn.disabled = false;
      Metrics.inc("continue_offered");
    } else {
      continueBtn.style.display = "none";
    }

    primaryBtn.style.display = "inline-block";
    primaryBtn.textContent = "Restart";

    showOverlay();
    syncHud();
    refreshDevPanel();
    if (GM.onPauseChanged) GM.onPauseChanged(true);
  }

  function showAdCountdown(secondsLeft){
    state = "ad_countdown";
    ovTitle.textContent = "";
    ovSub.textContent   = "";
    ovFoot.textContent  = "";

    diffWrap.style.display = "none";
    continueBtn.style.display = "none";
    primaryBtn.style.display  = "none";

    countdownWrap.style.display = "block";
    countdownLabel.textContent = "Watching Ad…";
    countdownNum.textContent   = String(secondsLeft);

    showOverlay();
    syncHud();
  }

  function showAdReady(){
    state = "ad_ready";
    ovTitle.textContent = "";
    ovSub.textContent   = "";
    ovFoot.textContent  = "";

    diffWrap.style.display = "none";
    countdownWrap.style.display = "block";
    countdownLabel.textContent = "Ad finished";
    countdownNum.textContent = "✓";

    continueBtn.style.display = "none";
    primaryBtn.style.display  = "inline-block";
    primaryBtn.textContent = "Continue";

    showOverlay();
    syncHud();
  }

  // ---------- Run control ----------
  function resetRun(){
    score = 0;
    level = 1;
    canContinue = true;
    continuesUsedThisRun = 0;
    playerLane = 0;
    GM.resetRun();
    showReady();
  }

  function startRun(){
    incRuns();
    state = "playing";
    score = 0;
    level = 1;
    canContinue = true;
    continuesUsedThisRun = 0;
    hideOverlay();
    syncHud();
    refreshDevPanel();
    GM.startRun();
    if (GM.onPauseChanged) GM.onPauseChanged(false);
  }

  function requestGameOver(){
    if (state !== "playing") return;
    playDeath();
    haptic(30);
    if (score > getBest()) setBest(score);
    showDead();
  }

  function setPaused(shouldPause, reasonText=""){
    if (shouldPause){
      if (state !== "playing") return;
      haptic(20);
      showPaused(reasonText);
    } else {
      if (state !== "paused") return;
      state = "playing";
      haptic(15);
      hideOverlay();
      syncHud();
      if (GM.onPauseChanged) GM.onPauseChanged(false);
    }
  }

  function togglePause(){
    if (state === "playing") setPaused(true);
    else if (state === "paused") setPaused(false);
  }

  // ---------- Safe gesture protections ----------
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

  // ---------- Input ----------
  function setLaneFromX(clientX){
    const mid = window.innerWidth / 2;
    playerLane = clientX < mid ? 0 : 1;
    if (GM.setLane) GM.setLane(playerLane);
  }

  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();

    if (!isPlayableSize()){
      if (state === "playing") setPaused(true, CFG.orientation?.message || "Rotate to portrait.");
      return;
    }

    if (state === "ready"){
      setLaneFromX(e.clientX);
      startRun();
      return;
    }

    if (state !== "playing") return;
    setLaneFromX(e.clientX);
    if (GM.onPointerDown) GM.onPointerDown(e.clientX, e.clientY);
  });

  pauseBtn.addEventListener("click", () => {
    ensureAudio();
    if (state === "playing" || state === "paused") togglePause();
  });

  soundBtn.addEventListener("click", () => setSoundEnabled(!soundEnabled));

  primaryBtn.addEventListener("click", () => {
    ensureAudio();
    if (!isPlayableSize()){ showPaused(CFG.orientation?.message || "Rotate to portrait."); return; }

    if (state === "ready"){ startRun(); return; }
    if (state === "paused"){ setPaused(false); return; }

    if (state === "ad_ready"){
      state = "playing";
      hideOverlay();
      syncHud();
      if (GM.clearHazards) GM.clearHazards();
      if (GM.startStream) GM.startStream();
      if (GM.onPauseChanged) GM.onPauseChanged(false);
      return;
    }

    resetRun();
  });

  window.addEventListener("keydown", (e) => {
    // Dev: M toggles, Shift+M resets (if allowed)
    if ((e.key === "m" || e.key === "M") && e.shiftKey){
      if (!allowDevPanel()) return;
      Metrics.reset();
      Metrics.load();
      refreshDevPanel();
      console.table(Metrics.summary());
      return;
    }
    if (e.key === "m" || e.key === "M"){ toggleDevPanel(); return; }

    if (e.code === "Space"){
      e.preventDefault();
      ensureAudio();
      if (state === "playing" || state === "paused") togglePause();
      return;
    }

    if (state !== "playing") return;
    if (e.key === "ArrowLeft"){ playerLane = 0; if (GM.setLane) GM.setLane(0); return; }
    if (e.key === "ArrowRight"){ playerLane = 1; if (GM.setLane) GM.setLane(1); return; }

    if (GM.onKeyDown) GM.onKeyDown(e);
  });

  // Continue button
  async function runAdCountdown(){
    const seconds = CFG.rewarded?.countdownSeconds ?? 5;
    for (let i = seconds; i >= 1; i--){
      showAdCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    Metrics.inc("continue_completed");
    Metrics.inc("continue_granted");
    showAdReady();
    refreshDevPanel();
  }

  continueBtn.addEventListener("click", () => {
    if (!CFG.rewarded?.enabled) return;
    if (!canContinue || state !== "dead") return;

    ensureAudio();
    Metrics.inc("continue_clicked");

    canContinue = false;
    continuesUsedThisRun = 1;
    refreshDevPanel();
    runAdCountdown();
  });

  // Auto pause on blur / hidden
  window.addEventListener("blur", () => { if (state === "playing") setPaused(true, "App paused."); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") setPaused(true, "App paused.");
  });

  function handleResize(){
    resizeCanvas();
    if (state === "playing") setPaused(true, "Paused (resized).");

    if (!isPlayableSize()){
      if (state === "playing") setPaused(true, CFG.orientation?.message || "Rotate to portrait.");
      if (state === "ready") showReady(CFG.orientation?.message || "Rotate to portrait.");
    } else {
      if (state === "ready") showReady();
    }
  }
  window.addEventListener("resize", handleResize, { passive: true });

  // ---------- Game API ----------
  const api = {
    getState(){ return { state, score, level, best: getBest(), difficultyKey, canContinue, continuesUsedThisRun, playerLane }; },
    setScore(n){ score = Math.max(0, n|0); syncHud(); },
    addScore(d){ score = Math.max(0, score + (d|0)); syncHud(); },
    setLevel(n){ level = Math.max(1, n|0); syncHud(); },
    setPlayerLane(l){ playerLane = (l === 1 ? 1 : 0); },
    getPlayerLane(){ return playerLane; },
    setCanContinue(v){ canContinue = !!v; },
    consumeContinue(){ canContinue = false; continuesUsedThisRun = 1; },
    playHit(){ playHit(); },
    playLevelUp(){ playLevelUp(); },
    playDeath(){ playDeath(); },
    haptic(ms){ haptic(ms); },
    getView(){ return getView(); },
    isPlayableSize(){ return isPlayableSize(); },
    requestGameOver(){ requestGameOver(); },
    clearHazards(){ if (GM.clearHazards) GM.clearHazards(); },
    metrics: Metrics,
  };

  // ---------- Boot ----------
  document.title = CFG.ui?.titleText || "Game";
  pauseHint.textContent = CFG.ui?.pauseHintText || "Pause: Space or ⏸";

  // Place pause dock preset
  const preset = (CFG.ui?.pauseDockPreset || "bottomLeft");
  pauseDock.classList.toggle("right", preset === "bottomRight");
  pauseDock.classList.toggle("topRight", preset === "topRight");

  // theme vars
  if (CFG.themeVars){
    for (const [k,v] of Object.entries(CFG.themeVars)){
      document.documentElement.style.setProperty(k, v);
    }
  }

  resizeCanvas();
  setSoundEnabled(soundEnabled);

  // difficulty
  if (!CFG.difficulty?.enabled){
    diffWrap.style.display = "none";
  } else {
    applyDifficulty(difficultyKey);
  }

  // show dev only when allowed; but keep hidden by default
  if (!allowDevPanel()) devPanel.style.display = "none";

  // init game module
  GM.init(api);

  resetRun();
  syncHud();

  let lastTs = 0;
  function frame(ts){
    const t = ts || 0;
    let dt = (t - lastTs) / 1000 || 0;
    lastTs = t;
    dt = Math.min(0.033, Math.max(0, dt));

    if (state === "playing") {
      GM.update(dt);
    }
    GM.draw(ctx, getView());

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // initial size guard
  if (!isPlayableSize()) showReady(CFG.orientation?.message || "Rotate to portrait.");

})();
