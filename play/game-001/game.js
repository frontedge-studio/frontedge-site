// Game-001 mechanic (Lane Change)
// Only mechanics live here; overlays/inputs/pause/continue are handled by the shared shell.
window.GAME_MODULE = (() => {
  let api = null;

  // -------------------------
  // Mechanic config
  // -------------------------
  const CFG = {
    orbRadius: 20,
    playerRadius: 26,
    missGrace: 10,
    laneHighlightMs: 120,
    minCrossLaneArrivalGapMs: 260, // will be overwritten per difficulty
  };

  // Strong difficulty separation (same as your v1)
  const DIFFICULTY = {
    easy: {
      hitsPerLevel: 20,
      baseInterval: 980, intervalStep: 16, jitter: 420,
      speedMin: 90, speedMax: 240, speedMinStep: 8, speedMaxStep: 14,
      altBiasBase: 0.03, altBiasStep: 0.015, altBiasCap: 0.60,
      gapMs: 420,
      speedCapMin: 800, speedCapMax: 1600,
      maxSameLane: 8,
      maxPerfectAlt: 10,
    },
    normal: {
      hitsPerLevel: 14,
      baseInterval: 650, intervalStep: 26, jitter: 320,
      speedMin: 160, speedMax: 380, speedMinStep: 16, speedMaxStep: 24,
      altBiasBase: 0.14, altBiasStep: 0.04, altBiasCap: 0.84,
      gapMs: 290,
      speedCapMin: 1400, speedCapMax: 2400,
      maxSameLane: 6,
      maxPerfectAlt: 8,
    },
    hard: {
      hitsPerLevel: 12,
      baseInterval: 520, intervalStep: 34, jitter: 260,
      speedMin: 220, speedMax: 520, speedMinStep: 22, speedMaxStep: 36,
      altBiasBase: 0.26, altBiasStep: 0.06, altBiasCap: 0.92,
      gapMs: 235,
      speedCapMin: 1800, speedCapMax: 3200,
      maxSameLane: 5,
      maxPerfectAlt: 7,
    },
  };

  let difficultyKey = "easy";
  let D = DIFFICULTY[difficultyKey];

  // -------------------------
  // Run state
  // -------------------------
  let orbs = [];
  let spawnTimerMs = 0;
  let nextSpawnInMs = 0;
  let lastSpawnLane = 0;

  let hits = 0;
  let level = 1;

  // lane FX
  let laneFlash = 0; // 0 none, 1 left, 2 right
  let laneFlashT = 0;

  // pattern shaping history
  const laneHistory = [];

  // lane (from shell)
  let playerLane = 0;

  function rand(a,b){ return a + Math.random()*(b-a); }

  function cryptoRandomId(){
    if (window.crypto?.getRandomValues){
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0].toString(16);
    }
    return Math.floor(Math.random()*1e9).toString(16);
  }

  function countSameLaneRunAtEnd(hist){
    if (hist.length === 0) return 0;
    const last = hist[hist.length-1];
    let run = 1;
    for (let i = hist.length-2; i>=0; i--){
      if (hist[i] === last) run++;
      else break;
    }
    return run;
  }
  function countPerfectAlternationAtEnd(hist){
    if (hist.length < 2) return 0;
    let run = 1;
    for (let i = hist.length-1; i>=1; i--){
      if (hist[i] === hist[i-1]) break;
      run++;
    }
    return run;
  }

  function chooseLane(){
    const altBias = Math.min(D.altBiasBase + (level - 1) * D.altBiasStep, D.altBiasCap);
    let lane;
    if (Math.random() < altBias) lane = lastSpawnLane === 0 ? 1 : 0;
    else lane = Math.random() < 0.5 ? 0 : 1;

    const sameRun = countSameLaneRunAtEnd(laneHistory);
    const altRun = countPerfectAlternationAtEnd(laneHistory);

    if (sameRun >= D.maxSameLane) lane = laneHistory[laneHistory.length - 1] === 0 ? 1 : 0;
    if (altRun >= D.maxPerfectAlt) lane = laneHistory[laneHistory.length - 1];

    return lane;
  }

  function currentSpawnInterval(){
    const base = D.baseInterval - (level - 1) * D.intervalStep;
    return Math.max(140, base) + Math.random() * D.jitter;
  }
  function currentSpeedRange(){
    const min = D.speedMin + (level - 1) * D.speedMinStep;
    const max = D.speedMax + (level - 1) * D.speedMaxStep;
    return { min: Math.min(min, D.speedCapMin), max: Math.min(max, D.speedCapMax) };
  }
  function pickNextSpawn(){ return currentSpawnInterval(); }

  function setDifficulty(key){
    difficultyKey = (key in DIFFICULTY) ? key : "easy";
    D = DIFFICULTY[difficultyKey];
    CFG.minCrossLaneArrivalGapMs = D.gapMs;
  }

  function setLane(lane){
    playerLane = (lane === 1 ? 1 : 0);
    laneFlash = playerLane === 0 ? 1 : 2;
    laneFlashT = CFG.laneHighlightMs;
  }

  function clearHazards(){
    orbs = [];
  }
  function startStream(){
    // on continue: clear and restart spawn cadence fairly
    orbs = [];
    spawnTimerMs = 0;
    nextSpawnInMs = pickNextSpawn();
  }

  function resetRun(){
    orbs = [];
    spawnTimerMs = 0;
    nextSpawnInMs = pickNextSpawn();
    lastSpawnLane = 0;

    hits = 0;
    level = 1;
    api.setLevel(1);
    api.setScore(0);

    laneHistory.length = 0;
    laneFlash = 0;
    laneFlashT = 0;
    playerLane = 0;
  }

  function startRun(){
    resetRun();
    startStream();
  }

  function spawnOrb(){
    const view = api.getView();
    const playerY = view.playerY;

    const r = currentSpeedRange();
    const speed = rand(r.min, r.max);

    // speed-based color
    const t = (speed - r.min) / (r.max - r.min + 0.0001);
    const hue = 200 - Math.round(t * 160); // blue -> red
    const color = `hsla(${hue}, 90%, 60%, 0.95)`;

    const spawnY = -CFG.orbRadius - 2;

    const travelPx = (playerY - spawnY);
    const etaMs = (travelPx / speed) * 1000;

    let lane = chooseLane();

    // fairness: avoid impossible cross-lane near-simultaneous arrivals
    for (let tries = 0; tries < 6; tries++){
      const conflicts = orbs.some(o => {
        if (o.lane === lane) return false;
        const nTravelPx = (playerY - o.y);
        const nEtaMs = (nTravelPx / o.speed) * 1000;
        return Math.abs(nEtaMs - etaMs) < CFG.minCrossLaneArrivalGapMs;
      });
      if (!conflicts) break;
      lane = lane === 0 ? 1 : 0;
    }

    orbs.push({ lane, y: spawnY, speed, r: CFG.orbRadius, color, id: cryptoRandomId() });

    lastSpawnLane = lane;
    laneHistory.push(lane);
    if (laneHistory.length > 30) laneHistory.shift();
  }

  function update(dt){
    spawnTimerMs += dt * 1000;
    if (spawnTimerMs >= nextSpawnInMs){
      spawnTimerMs = 0;
      nextSpawnInMs = pickNextSpawn();
      spawnOrb();
    }

    for (const o of orbs) o.y += o.speed * dt;

    if (laneFlashT > 0) laneFlashT -= dt * 1000;
    if (laneFlashT <= 0) laneFlash = 0;

    const view = api.getView();
    const playerY = view.playerY;
    const laneX = view.laneX;

    const pr = CFG.playerRadius;

    for (let i = orbs.length - 1; i >= 0; i--){
      const o = orbs[i];

      const orbX = o.lane === 0 ? laneX[0] : laneX[1];

      if (o.lane === playerLane){
        const playerX = playerLane === 0 ? laneX[0] : laneX[1];
        const dx = orbX - playerX;
        const dy = o.y - playerY;
        const dist2 = dx*dx + dy*dy;
        const rad = o.r + pr;
        if (dist2 <= rad*rad){
          orbs.splice(i, 1);
          api.addScore(1);
          hits += 1;
          api.haptic(10);

          const newLevel = 1 + Math.floor(hits / D.hitsPerLevel);
          if (newLevel !== level){
            level = newLevel;
            api.setLevel(level);
            nextSpawnInMs = pickNextSpawn();
            api.playLevelUp();
          }

          api.playHit();
          continue;
        }
      }

      if (o.y - o.r > playerY + pr + CFG.missGrace){
        api.requestGameOver();
        return;
      }
    }
  }

  function drawCircle(ctx, x, y, r, fill){
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
  }

  function draw(ctx, view){
    const w = view.w;
    const h = view.h;
    const laneX = view.laneX;
    const playerY = view.playerY;

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#0b0f14";
    ctx.fillRect(0,0,w,h);

    // split zones
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--lane-left") || "rgba(255,255,255,0.04)";
    ctx.fillRect(0,0,w/2,h);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--lane-right") || "rgba(255,255,255,0.02)";
    ctx.fillRect(w/2,0,w/2,h);

    if (laneFlash !== 0){
      ctx.fillStyle = laneFlash === 1 ? "rgba(80, 220, 150, 0.08)" : "rgba(255, 210, 80, 0.07)";
      if (laneFlash === 1) ctx.fillRect(0,0,w/2,h);
      else ctx.fillRect(w/2,0,w/2,h);
    }

    // divider
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--divider") || "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/2,0);
    ctx.lineTo(w/2,h);
    ctx.stroke();

    // orbs
    for (const o of orbs){
      const x = o.lane === 0 ? laneX[0] : laneX[1];
      drawCircle(ctx, x, o.y, o.r, o.color || "rgba(120,200,255,0.92)");
      drawCircle(ctx, x, o.y, o.r - 7, "rgba(10,16,22,0.55)");
    }

    // player
    const px = playerLane === 0 ? laneX[0] : laneX[1];
    drawCircle(ctx, px, playerY, CFG.playerRadius, "rgba(255, 235, 120, 0.95)");
    drawCircle(ctx, px, playerY, CFG.playerRadius - 8, "rgba(10, 16, 22, 0.65)");

    // danger line
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--danger") || "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, playerY);
    ctx.lineTo(w, playerY);
    ctx.stroke();
  }

  return {
    init(_api){ api = _api; setDifficulty(api.getState().difficultyKey || "easy"); },
    setDifficulty,
    setLane,
    resetRun,
    startRun,
    update,
    draw,
    clearHazards,
    startStream,
  };
})();
