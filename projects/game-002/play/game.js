// Game-002 mechanic (Shard Shield) — mechanics only.
// Continuous collision between expanding wavefront and moving shards.
window.GAME_MODULE = (() => {
  "use strict";

  let api;

  // Difficulty (shield size identical across difficulties)
  const DIFFICULTY = {
    easy:   { startRate: 0.95, rateRamp: 0.018, speed: 185, speedRamp: 0.55, cooldown: 0.26, shieldMs: 0.30, shardSize: 0.95, shieldRange: 92 },
    normal: { startRate: 1.25, rateRamp: 0.025, speed: 205, speedRamp: 0.70, cooldown: 0.29, shieldMs: 0.24, shardSize: 1.00, shieldRange: 92 },
    hard:   { startRate: 1.70, rateRamp: 0.035, speed: 230, speedRamp: 0.90, cooldown: 0.32, shieldMs: 0.20, shardSize: 1.05, shieldRange: 92 },
  };

  let D = DIFFICULTY.easy;
  function setDifficulty(key) { D = DIFFICULTY[key] || DIFFICULTY.easy; }

  function getPF(view) {
    if (view && view.pf && Number.isFinite(view.pf.w) && Number.isFinite(view.pf.h)) return view.pf;
    return { x: 0, y: 0, w: view?.w ?? 0, h: view?.h ?? 0 };
  }

  // State
  const player = { x: 0, y: 0, r: 18, wob: 0 };

  let shards = [];
  let spawnAcc = 0;

  let timeAlive = 0;
  let intensity = 1;

  // Shield
  let shieldT = 0;
  let cooldownT = 0;
  let pendingPulse = false;

  // Continue grace
  let invulnT = 0;

  // Burst tracking
  let burstDur = 0.2;
  let burstMaxR = 0;
  let burstElapsed = 0;   // seconds elapsed since burst start
  let lastContinuesUsedThisRun = 0;

  function reset() {
    shards = [];
    spawnAcc = 0;
    timeAlive = 0;
    intensity = 1;

    shieldT = 0;
    cooldownT = 0;
    pendingPulse = false;

    invulnT = 0;

    burstDur = D.shieldMs;
    burstMaxR = player.r + D.shieldRange;
    burstElapsed = 0;

    lastContinuesUsedThisRun = 0;
  }

  function start() {
    reset();
    const v = api.getView();
    const pf = getPF(v);
    player.x = pf.x + pf.w / 2;
    player.y = pf.y + pf.h / 2;
  }

  function clearHazards() { shards = []; }

  function onContinueConsumed() {
    clearHazards();
    invulnT = 0.9;

    cooldownT = Math.min(cooldownT, 0.10);
    shieldT = 0;
    pendingPulse = false;

    burstElapsed = 0;
  }

  function spawnShard() {
    const v = api.getView();
    const pf = getPF(v);

    const edge = (Math.random() * 4) | 0;
    let x = 0, y = 0;

    if (edge === 0) { x = pf.x + Math.random() * pf.w; y = pf.y - 20; }
    else if (edge === 1) { x = pf.x + pf.w + 20; y = pf.y + Math.random() * pf.h; }
    else if (edge === 2) { x = pf.x + Math.random() * pf.w; y = pf.y + pf.h + 20; }
    else { x = pf.x - 20; y = pf.y + Math.random() * pf.h; }

    const sizeBase = 6 + Math.random() * 10;
    const r = sizeBase * D.shardSize;

    const stylePick = Math.random();
    const shape = stylePick < 0.33 ? "dot" : stylePick < 0.66 ? "diamond" : "tri";
    const hue = 340 + Math.random() * 60;
    const sat = 85 + Math.random() * 10;
    const lum = 55 + Math.random() * 10;
    const color = `hsl(${hue} ${sat}% ${lum}%)`;

    const dx = player.x - x;
    const dy = player.y - y;
    const dist = Math.max(0.001, Math.hypot(dx, dy));
    const dirx = dx / dist;
    const diry = dy / dist;

    const speed = D.speed + intensity * D.speedRamp;

    shards.push({
      x, y, r,
      vx: dirx * speed,
      vy: diry * speed,
      shape,
      color,
      spin: (Math.random() * 2 - 1) * 2.0,
      ang: Math.random() * Math.PI * 2,
    });
  }

  // Wave radius at time t (seconds into burst)
  function waveRadiusAt(t) {
    // wave starts at player.r and expands to burstMaxR over burstDur
    const u = Math.max(0, Math.min(1, t / Math.max(0.001, burstDur)));
    return player.r + (burstMaxR - player.r) * u;
  }

  // Continuous wave/shard hit test over this frame.
  // Solve: |(d0 + v t)|^2 = (R0 + k t + sr)^2, t in [0, dt]
  function waveHitsShardThisFrame(s, dt, r0, r1) {
    // If wave isn't expanding (dt tiny), do nothing
    if (!(dt > 0)) return false;

    // If already inside/behind the wave at frame start, break immediately.
    // This avoids "ring passed but shard lives" when a dt spike happens.
    const d0x0 = s.x - player.x;
    const d0y0 = s.y - player.y;
    const dist0 = Math.hypot(d0x0, d0y0);
    if (dist0 <= r0 + s.r) return true;

    const k = (r1 - r0) / dt; // px per sec (>=0 during burst)
    if (k <= 0) return false;

    const d0x = s.x - player.x;
    const d0y = s.y - player.y;
    const vx = s.vx;
    const vy = s.vy;

    // We solve for: (d0+v t)^2 - (r0 + k t + sr)^2 = 0
    const sr = s.r;

    // Left: (d0x+vx t)^2 + (d0y+vy t)^2 = A t^2 + B t + C
    const A1 = vx * vx + vy * vy;
    const B1 = 2 * (d0x * vx + d0y * vy);
    const C1 = d0x * d0x + d0y * d0y;

    // Right: (r0 + sr + k t)^2 = (rA + k t)^2 = (k^2)t^2 + 2 rA k t + rA^2
    const rA = r0 + sr;
    const A2 = k * k;
    const B2 = 2 * rA * k;
    const C2 = rA * rA;

    // Bring to one side: (A1-A2)t^2 + (B1-B2)t + (C1-C2) = 0
    const A = A1 - A2;
    const B = B1 - B2;
    const C = C1 - C2;

    const EPS = 1e-6;

    // Linear fallback if A ~ 0
    if (Math.abs(A) < EPS) {
      if (Math.abs(B) < EPS) return false;
      const t = -C / B;
      return t >= 0 && t <= dt;
    }

    const disc = B * B - 4 * A * C;
    if (disc < 0) return false;

    const sqrtD = Math.sqrt(disc);

    // We want the earliest hit time in [0,dt]
    const t1 = (-B - sqrtD) / (2 * A);
    const t2 = (-B + sqrtD) / (2 * A);

    const tHit = (t1 >= 0 && t1 <= dt) ? t1 : ((t2 >= 0 && t2 <= dt) ? t2 : null);
    return tHit !== null;
  }

  function firePulseNow() {
    shieldT = D.shieldMs;
    cooldownT = D.cooldown;
    pendingPulse = false;

    burstDur = D.shieldMs;
    burstMaxR = player.r + (D.shieldRange || 50);
    burstElapsed = 0;

    api.playHit(); // pulse cue
  }

  function requestPulse() {
    if (api.getState().state !== "playing") return;
    pendingPulse = true;
    if (cooldownT <= 0) firePulseNow();
  }

  function onPointerDown() {
    if (api.getState().state !== "playing") return;
    requestPulse();
  }

  function onKeyDown(e) {
    if (e.code === "Enter") {
      e.preventDefault();
      requestPulse();
    }
  }

  function update(dt) {
    const st = api.getState();
    if (st.state !== "playing") return;

    if (st.difficultyKey) setDifficulty(st.difficultyKey);

    // continue detection
    const curCont = st.continuesUsedThisRun || 0;
    if (curCont !== lastContinuesUsedThisRun) {
      lastContinuesUsedThisRun = curCont;
      if (curCont > 0) onContinueConsumed();
    }

    timeAlive += dt;
    intensity = Math.min(40, 1 + Math.floor(timeAlive / 3.0));

    if (cooldownT > 0) cooldownT = Math.max(0, cooldownT - dt);
    if (shieldT > 0) shieldT = Math.max(0, shieldT - dt);
    if (invulnT > 0) invulnT = Math.max(0, invulnT - dt);

    // buffered input
    if (cooldownT === 0 && pendingPulse) firePulseNow();

    // burst time progression
    const wasBursting = shieldT > 0;
    if (wasBursting) burstElapsed = Math.min(burstDur, burstElapsed + dt);

    // Wave radii over this frame for continuous hit test
    const r0 = wasBursting ? waveRadiusAt(Math.max(0, burstElapsed - dt)) : player.r;
    const r1 = wasBursting ? waveRadiusAt(burstElapsed) : player.r;

    // spawn
    const rate = D.startRate + timeAlive * D.rateRamp;
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      spawnShard();
    }

    // move + collisions
    const v = api.getView();
    const pf = getPF(v);

    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];

      // Move shard (we still run hit test using current position/velocity across dt)
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // cull far out
      if (
        s.x < pf.x - 80 || s.x > pf.x + pf.w + 80 ||
        s.y < pf.y - 80 || s.y > pf.y + pf.h + 80
      ) {
        shards.splice(i, 1);
        continue;
      }

      // ✅ Shield break via continuous collision during this frame
      if (wasBursting && waveHitsShardThisFrame(s, dt, r0, r1)) {
        shards.splice(i, 1);
        api.playHit();
        continue;
      }

      // player hit
      const dx = s.x - player.x;
      const dy = s.y - player.y;
      const dist = Math.hypot(dx, dy);

      if (dist < s.r + player.r * 0.75) {
        if (invulnT > 0) {
          shards.splice(i, 1);
          api.playHit();
          continue;
        }
        api.requestGameOver();
        return;
      }
    }

    api.setScore(timeAlive);
    api.setLevel(intensity);
  }

  // Draw helpers
  function roundRectFill(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function drawShard(ctx, s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    s.ang += s.spin * 0.03;
    ctx.rotate(s.ang);

    ctx.shadowColor = s.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = s.color;

    if (s.shape === "dot") {
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.shape === "diamond") {
      ctx.beginPath();
      ctx.moveTo(0, -s.r);
      ctx.lineTo(s.r, 0);
      ctx.lineTo(0, s.r);
      ctx.lineTo(-s.r, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -s.r);
      ctx.lineTo(s.r * 0.92, s.r * 0.92);
      ctx.lineTo(-s.r * 0.92, s.r * 0.92);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPlayer(ctx) {
    player.wob += 0.05;

    // body
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.sin(player.wob) * 0.06);

    ctx.shadowColor = "rgba(90,220,255,0.55)";
    ctx.shadowBlur = 18;

    ctx.fillStyle = "rgba(90,220,255,0.95)";
    roundRectFill(ctx, -player.r * 0.9, -player.r * 0.7, player.r * 1.8, player.r * 1.4, 10);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(5,7,12,0.85)";
    ctx.beginPath();
    ctx.arc(player.r * 0.35, -player.r * 0.08, player.r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // cooldown ring
    {
      const frac = D.cooldown > 0 ? Math.max(0, Math.min(1, 1 - cooldownT / D.cooldown)) : 1;
      const r = player.r + 16;
      const w = 3;

      ctx.save();

      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = "rgba(231,238,247,0.9)";
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = cooldownT > 0 ? 0.55 : 0.75;
      ctx.strokeStyle = "rgba(90,220,255,0.95)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();

      ctx.restore();
    }

    // shield burst (only outward pulse)
    if (shieldT > 0) {
      const maxR = player.r + (D.shieldRange || 50);
      const dur = Math.max(0.001, (D.shieldMs || 0.20));
      const t = Math.max(0, Math.min(1, 1 - (shieldT / dur)));
      const burstR = player.r + (maxR - player.r) * t;

      ctx.save();

      ctx.globalAlpha = 0.55 * (1 - t) + 0.12;
      ctx.strokeStyle = "rgba(90,220,255,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, burstR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.08 * (1 - t);
      ctx.fillStyle = "rgba(90,220,255,0.9)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, burstR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // invuln ring
    if (invulnT > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(timeAlive * 10);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.25 * pulse;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw(ctx, view) {
  const st = api.getState();
  const pf = getPF(view);

  // ⛔ Do NOT draw gameplay entities during title / ready / overlays
  if (st.state !== "playing" && st.state !== "paused") {
    ctx.fillStyle = "#05070c";
    ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
    return;
  }

  // Background
  ctx.fillStyle = "#05070c";
  ctx.fillRect(pf.x, pf.y, pf.w, pf.h);

  // Border
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(90, 220, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pf.x, pf.y, pf.w, pf.h);
  ctx.restore();

  // Gameplay
  for (let i = 0; i < shards.length; i++) drawShard(ctx, shards[i]);
  drawPlayer(ctx);
}

  return {
    init(_api) { api = _api; setDifficulty(api.getState().difficultyKey); },
    reset,
    resetRun: reset,
    start,
    startRun: start,
    update,
    draw,
    onPointerDown,
    onKeyDown,
    clearHazards,
  };
})();