// Game-002 config (Shard Shield) — shared shell
window.GAME_CFG = {
  storage: {
    bestKey: "shardshield_best_v1",
    runsKey: "shardshield_runs_v1",
    metricsKey: "shardshield_metrics_v1",
    soundKey: "shardshield_sound_v1",
  },

  // Flow toggles (shell defaults ready screen to ON if you applied that patch)
  flow: { hasReadyScreen: true },

  ui: {
    titleText: "Shard Shield",
    titleSubtext:
      "Tap / click / Enter to pulse a shield.\n" +
      "Break shards before they reach you.\n\n" +
      "Pause: Space or ⏸",

    pauseHintText: "Pause: Space or ⏸",

    // Copy used by shell overlay states
    deathTitle: "Run ended",
    deathSub: "A shard hit you.",
    restartText: "Restart",

    // Keep HUD as 3 pills (Score/Best/Level)
    hudLabels: { score: "Time", best: "Best", level: "Intensity" },

    // Tell shell these are time values (it will format nicely if supported)
    scoreFormat: "seconds_1dp",
    bestFormat: "seconds_1dp",
  },

  difficulty: {
    enabled: true,
    defaultKey: "easy",
    copy: {
      easy: "Easy gives you breathing room and a forgiving cooldown.",
      normal: "Normal is steady pressure with an honest ramp.",
      hard: "Hard ramps fast and punishes spam.",
    },
  },

  // One-continue-per-run discovery (only shown on death)
  rewarded: {
    enabled: true,
    discoveredAtDeath: true,
    oneContinuePerRun: true,
    countdownSeconds: 5,
    buttonText: "Watch Ad to Continue",
    finishedLabel: "Ad finished",
    resumeText: "Resume",
  },

  // If landscape is too short, pause and show orientation message
  orientation: {
    mode: "portraitPreferred",
    minPlayfieldW: 280,
    minPlayfieldH: 420,
    message: "Rotate to portrait for best play.",
  },

  // Pause dock placement (shell can vary by preset)
  pauseDock: { preset: "bottomLeft" },

  themeVars: {
    "--bg": "#05070c",
    "--text": "#e7eef7",
    "--accent": "rgba(90,220,255,0.95)",
    "--danger": "rgba(255,110,110,0.95)",
  },
};
