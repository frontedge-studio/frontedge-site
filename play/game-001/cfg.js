// Game-001 config (Lane Change)
window.GAME_CFG = {
  storage: {
    bestKey: "lanechange_best_v1",
    runsKey: "lanechange_runs_v1",
    metricsKey: "lanechange_metrics_v1",
    soundKey: "lanechange_sound_v1",
  },

  ui: {
    titleText: "Lane Change",
    titleSubtext:
      "Catch the falling orbs.\n" +
      "Tap left/right (or Arrow keys) to switch lanes.\n" +
      "Miss = game over.\n\n" +
      "Pause: Space or ⏸",
    pauseHintText: "Pause: Space or ⏸",
    readyFoot: "Pick a difficulty, then press Start. You can also tap the playfield to start.",
    deadCopy: "You missed an orb.",
    pauseDockPreset: "bottomLeft", // bottomLeft | bottomRight | topRight
  },

  // If landscape on small phones makes it too short, we pause and show a message.
  orientation: {
    mode: "portraitPreferred", // portraitPreferred | portraitOnly | any
    minPlayfieldW: 280,
    minPlayfieldH: 420,
    message: "Rotate to portrait for best play.",
  },

  rewarded: {
    enabled: true,
    discoveredAtDeath: true,  // shell always hides continue on ready; discovery behavior is default
    oneContinuePerRun: true,
    countdownSeconds: 5,
    buttonText: "Watch Ad to Continue",
    deadCopy: "You missed an orb. One save per run is available."
  },

  // Playfield geometry expectations (used for lane X positions and player baseline)
  playfield: {
    laneXLeft: 0.25,
    laneXRight: 0.75,
    playerBottomMargin: 64,
  },

  difficulty: {
    enabled: true,
    defaultKey: "easy",
    copy: {
      easy: "Easy is chill and slow. Great for first-time players.",
      normal: "Normal is the standard pace with regular lane switching.",
      hard: "Hard ramps quickly and demands strong reflexes.",
    }
  },

  // Theme variables (override shared defaults)
  themeVars: {
    "--bg": "#0b0f14",
    "--text": "#e7eef7",
  },
};
