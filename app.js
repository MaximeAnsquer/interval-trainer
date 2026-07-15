// ---------- État & persistance ----------

const STORAGE_KEY = "interval-trainer-v1";

const defaultState = () => ({
  level: 1, // nombre d'intervalles débloqués - 1 (level 1 = 2 intervalles)
  history: [], // { i: intervalId, d: "asc"|"desc", a: réponse, ok: bool, t: timestamp }
  // "m3-asc" -> index dans SONGS[id][dir] (nombre, ancien format)
  //          ou { src: "builtin"|"custom", idx } (nouveau format)
  refSongs: {},
  customSongs: {}, // "m3-asc" -> [{ title, artist }] ajoutées par l'utilisateur
  // Meilleurs scores : { timed: { "1": {correct,total,at}, ... }, nofilet: {streak,at} }
  bestScores: { timed: {}, nofilet: null },
  settings: { direction: "asc" },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return {
      ...defaultState(),
      ...s,
      settings: { ...defaultState().settings, ...s.settings },
      bestScores: {
        ...defaultState().bestScores,
        ...s.bestScores,
        timed: { ...(s.bestScores && s.bestScores.timed) },
      },
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ---------- Audio : piano (échantillons Salamander via Tone.js, repli synthétisé) ----------

// Jeu épars d'échantillons (Tone.js interpole les notes manquantes par pitch-shift)
const SAMPLE_NOTES = [
  "A0", "C1", "Ds1", "Fs1", "A1", "C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3",
  "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6", "A6", "C7",
];

let sampler = null;
let samplerReady = false;
let samplerFailed = false;
let fallbackCtx = null; // Web Audio, utilisé seulement si les échantillons ne se chargent pas

function setAudioStatus(text, kind, autoHideMs) {
  const el = $("#audio-status");
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.className = `audio-status ${kind || ""}`;
  el.classList.remove("hidden");
  if (autoHideMs) setTimeout(() => setAudioStatus(""), autoHideMs);
}

function initSampler() {
  if (sampler || samplerFailed) return;
  if (typeof Tone === "undefined") {
    samplerFailed = true;
    return;
  }
  setAudioStatus("🎹 Chargement du piano…", "loading");
  const urls = {};
  for (const n of SAMPLE_NOTES) urls[n.replace("s", "#")] = `${n}.mp3`;
  sampler = new Tone.Sampler({
    urls,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    onload: () => {
      samplerReady = true;
      setAudioStatus("");
    },
    onerror: () => {
      samplerFailed = true;
      setAudioStatus("🎹 Son synthétisé (échantillons indisponibles)", "warn", 3000);
    },
  }).toDestination();
}

function getFallbackCtx() {
  if (!fallbackCtx) fallbackCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (fallbackCtx.state === "suspended") fallbackCtx.resume();
  return fallbackCtx;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteName(midi) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

function playFallbackNote(midi, when, duration = 1.4) {
  const ctx = getFallbackCtx();
  const freq = midiToFreq(midi);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, when);
  master.gain.linearRampToValueAtTime(0.4, when + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(freq * 8, 9000), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 400), when + duration);

  master.connect(filter);
  filter.connect(ctx.destination);

  // Harmoniques d'un timbre proche du piano
  const partials = [
    { mult: 1, gain: 1.0 },
    { mult: 2, gain: 0.45 },
    { mult: 3, gain: 0.22 },
    { mult: 4, gain: 0.1 },
    { mult: 5, gain: 0.06 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * p.mult, when);
    const g = ctx.createGain();
    // Les harmoniques aigus s'éteignent plus vite, comme sur un piano
    g.gain.setValueAtTime(p.gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration / (1 + p.mult * 0.4));
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + duration);
  }

  // Petit "coup de marteau" à l'attaque
  const noise = ctx.createOscillator();
  noise.type = "triangle";
  noise.frequency.setValueAtTime(freq * 6.3, when);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.08, when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
  noise.connect(ng);
  ng.connect(master);
  noise.start(when);
  noise.stop(when + 0.12);
}

function playNote(midi, delaySec) {
  if (samplerReady && sampler) {
    sampler.triggerAttackRelease(midiToNoteName(midi), 1.4, `+${delaySec}`);
  } else {
    const ctx = getFallbackCtx();
    playFallbackNote(midi, ctx.currentTime + delaySec + 0.03);
  }
}

function playInterval(q) {
  if (typeof Tone !== "undefined") Tone.start();
  playNote(q.note1, 0.05);
  playNote(q.note2, 0.95);
}

// ---------- Logique du quiz ----------

const RECENT_WINDOW = 6; // tentatives récentes considérées pour la maîtrise
const MASTERY_MIN_ATTEMPTS = 5; // tentatives minimum avant de pouvoir débloquer
const MASTERY_ACCURACY = 0.8; // précision récente requise pour débloquer

let currentQuestion = null;
let answered = false;

function unlockedIds() {
  return UNLOCK_ORDER.slice(0, state.level + 1);
}

function intervalById(id) {
  return INTERVALS.find((i) => i.id === id);
}

function recentAttempts(id) {
  return state.history.filter((h) => h.i === id).slice(-RECENT_WINDOW);
}

function recentAccuracy(id) {
  const recent = recentAttempts(id);
  if (recent.length === 0) return null;
  return recent.filter((h) => h.ok).length / recent.length;
}

// Pondération adaptative : les intervalles ratés récemment et les nouveaux
// intervalles reviennent plus souvent.
function intervalWeight(id, lastId = null) {
  const attempts = state.history.filter((h) => h.i === id).length;
  const acc = recentAccuracy(id);
  let w = 1;
  if (acc !== null) w += 5 * (1 - acc); // plus d'erreurs → plus fréquent
  if (attempts < 4) w += 2; // intervalle récent/débloqué → plus fréquent
  if (lastId && id === lastId) w *= 0.3; // éviter de répéter le même
  return w;
}

function pickInterval() {
  const pool = unlockedIds();
  const lastId = state.history.length ? state.history[state.history.length - 1].i : null;
  const weights = pool.map((id) => intervalWeight(id, lastId));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let k = 0; k < pool.length; k++) {
    r -= weights[k];
    if (r <= 0) return pool[k];
  }
  return pool[pool.length - 1];
}

function newQuestion() {
  const id = pickInterval();
  const interval = intervalById(id);
  const dirSetting = state.settings.direction;
  const direction = dirSetting === "both" ? (Math.random() < 0.5 ? "asc" : "desc") : dirSetting;
  // Note grave entre do3 (48) et do5 (72), en gardant la note aiguë ≤ mi5 (76)
  const low = 48 + Math.floor(Math.random() * Math.min(25, 76 - 48 - interval.semitones + 1));
  const high = low + interval.semitones;
  currentQuestion = {
    id,
    direction,
    note1: direction === "asc" ? low : high,
    note2: direction === "asc" ? high : low,
  };
  answered = false;
  renderAnswers();
  hideFeedback();
  playInterval(currentQuestion);
}

function checkLevelUp() {
  if (state.level >= UNLOCK_ORDER.length - 1) return null;
  const allMastered = unlockedIds().every((id) => {
    const attempts = state.history.filter((h) => h.i === id).length;
    const acc = recentAccuracy(id);
    return attempts >= MASTERY_MIN_ATTEMPTS && acc !== null && acc >= MASTERY_ACCURACY;
  });
  if (allMastered) {
    state.level++;
    return intervalById(UNLOCK_ORDER[state.level]);
  }
  return null;
}

function answer(id) {
  if (answered || !currentQuestion) return;
  answered = true;
  const ok = id === currentQuestion.id;
  state.history.push({
    i: currentQuestion.id,
    d: currentQuestion.direction,
    a: id,
    ok,
    t: Date.now(),
  });

  let newInterval = null;
  if (ok) newInterval = checkLevelUp();
  saveState();

  if (sessionStats) {
    sessionStats.total++;
    if (ok) {
      sessionStats.correct++;
      sessionStats.streak++;
      sessionStats.bestStreak = Math.max(sessionStats.bestStreak, sessionStats.streak);
    } else {
      sessionStats.streak = 0;
      // En mode "sans filet", la première erreur met fin à la série ; la
      // session se termine quand l'utilisateur clique sur "Continuer" après
      // avoir vu la correction et la chanson de référence.
      if (sessionStats.mode === "nofilet") sessionStats.dead = true;
    }
    updateSessionHud();
  }

  markAnswers(id, currentQuestion.id);
  showFeedback(ok);
  renderLevel();
  if (!$("#stats").classList.contains("hidden")) renderStats();

  if (newInterval) {
    showToast(`🎉 Nouvel intervalle débloqué : ${newInterval.name} !`);
  }

  if (ok) {
    // En mode chrono, le temps peut s'écouler pendant le délai : on vérifie
    // que la session est toujours active avant d'enchaîner.
    setTimeout(() => {
      if (!sessionStats || sessionActive) newQuestion();
    }, 1200);
  }
}

// ---------- Modes de jeu : libre, chrono, sans filet ----------

let mode = "free"; // "free" | "timed" | "nofilet"
let timedMinutes = 1; // dernière durée de chrono choisie
let sessionTimerId = null;
let sessionEndAt = 0;
let sessionActive = false;
let sessionStats = null; // { mode, correct, total, streak, bestStreak, minutes?, dead }

function updateSessionHud(remainingMs) {
  if (!sessionStats) return;
  const timeEl = $("#session-time");
  if (sessionStats.mode === "timed") {
    timeEl.classList.remove("hidden");
    if (remainingMs === undefined) remainingMs = Math.max(0, sessionEndAt - Date.now());
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    timeEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
    $("#session-score").textContent = `✅ ${sessionStats.correct} / ${sessionStats.total}`;
  } else {
    timeEl.classList.add("hidden");
    $("#session-score").textContent = "🎯 Sans filet";
  }
  $("#session-streak").textContent = `🔥 ${sessionStats.streak}`;
}

function tickSession() {
  const remaining = sessionEndAt - Date.now();
  if (remaining <= 0) {
    endSession();
    return;
  }
  updateSessionHud(remaining);
}

function startTimedSession(minutes) {
  timedMinutes = minutes;
  sessionStats = { mode: "timed", minutes, correct: 0, total: 0, streak: 0, bestStreak: 0, dead: false };
  sessionEndAt = Date.now() + minutes * 60000;
  sessionActive = true;
  $("#session-hud").classList.remove("hidden");
  updateSessionHud();
  sessionTimerId = setInterval(tickSession, 250);
  newQuestion();
}

function startNofiletSession() {
  sessionStats = { mode: "nofilet", correct: 0, total: 0, streak: 0, bestStreak: 0, dead: false };
  sessionActive = true;
  $("#session-hud").classList.remove("hidden");
  updateSessionHud();
  newQuestion();
}

function endSession() {
  clearInterval(sessionTimerId);
  sessionTimerId = null;
  sessionActive = false;
  answered = true;
  document.querySelectorAll(".answer-btn").forEach((b) => (b.disabled = true));
  $("#session-hud").classList.add("hidden");
  const isNewRecord = checkRecord();
  showRecap(isNewRecord);
}

function selectMode(newMode, minutes) {
  clearInterval(sessionTimerId);
  sessionTimerId = null;
  sessionActive = false;
  mode = newMode;
  document.querySelectorAll(".timer-opt").forEach((b) => {
    const active = b.dataset.mode === newMode && (newMode !== "timed" || Number(b.dataset.min) === minutes);
    b.classList.toggle("active", active);
  });
  hideRecap();
  if (newMode === "timed") {
    startTimedSession(minutes);
  } else if (newMode === "nofilet") {
    startNofiletSession();
  } else {
    sessionStats = null;
    $("#session-hud").classList.add("hidden");
    newQuestion();
  }
}

// Enregistre un nouveau record si le résultat de la session dépasse le
// meilleur score connu pour ce mode. Renvoie true si un record est battu.
function checkRecord() {
  const s = sessionStats;
  if (s.mode === "timed") {
    const key = String(s.minutes);
    const prev = state.bestScores.timed[key];
    const isNew = !prev || s.correct > prev.correct;
    if (isNew) {
      state.bestScores.timed[key] = { correct: s.correct, total: s.total, at: Date.now() };
      saveState();
    }
    return isNew;
  }
  if (s.mode === "nofilet") {
    const prev = state.bestScores.nofilet;
    const isNew = !prev || s.bestStreak > prev.streak;
    if (isNew) {
      state.bestScores.nofilet = { streak: s.bestStreak, at: Date.now() };
      saveState();
    }
    return isNew;
  }
  return false;
}

function bestScoreLine(s) {
  if (s.mode === "timed") {
    const best = state.bestScores.timed[String(s.minutes)];
    return best ? `<div class="recap-record">Record actuel : ${best.correct}/${best.total} bonnes réponses</div>` : "";
  }
  if (s.mode === "nofilet") {
    const best = state.bestScores.nofilet;
    return best ? `<div class="recap-record">Record actuel : ${best.streak} 🔥 d'affilée</div>` : "";
  }
  return "";
}

function showRecap(isNewRecord) {
  const s = sessionStats;
  const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  $("#recap-title").textContent = s.mode === "nofilet" ? "🎯 Série interrompue !" : "⏱ Temps écoulé !";

  const statsHtml =
    s.mode === "nofilet"
      ? `<div class="recap-stats">
          <div class="recap-stat"><span class="recap-num">${s.bestStreak}</span><span>bonnes réponses d'affilée</span></div>
          <div class="recap-stat"><span class="recap-num">${s.total}</span><span>questions posées</span></div>
        </div>`
      : `<div class="recap-stats">
          <div class="recap-stat"><span class="recap-num">${s.correct}/${s.total}</span><span>bonnes réponses</span></div>
          <div class="recap-stat"><span class="recap-num">${acc} %</span><span>de réussite</span></div>
          <div class="recap-stat"><span class="recap-num">${s.bestStreak}</span><span>meilleure série</span></div>
        </div>`;
  const recordHtml = isNewRecord ? `<div class="recap-record new">🏆 Nouveau record !</div>` : bestScoreLine(s);

  $("#recap-body").innerHTML = statsHtml + recordHtml;
  $("#quiz").classList.add("hidden");
  $("#recap").classList.remove("hidden");
}

function hideRecap() {
  $("#recap").classList.add("hidden");
  $("#quiz").classList.remove("hidden");
}

function handleNext() {
  if (sessionStats && sessionStats.dead) endSession();
  else newQuestion();
}

// ---------- Rendu ----------

const $ = (sel) => document.querySelector(sel);

function renderLevel() {
  const unlocked = unlockedIds().length;
  $("#level-label").textContent =
    unlocked >= INTERVALS.length
      ? `Tous les intervalles sont débloqués (${unlocked}/${INTERVALS.length}) 🏆`
      : `Intervalles débloqués : ${unlocked}/${INTERVALS.length}`;
  $("#level-progress").style.width = `${(unlocked / INTERVALS.length) * 100}%`;
}

function renderAnswers() {
  const container = $("#answers");
  container.innerHTML = "";
  const unlocked = new Set(unlockedIds());
  for (const interval of INTERVALS) {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.dataset.id = interval.id;
    if (unlocked.has(interval.id)) {
      btn.innerHTML = `${interval.name}<span class="short">${interval.short}</span>`;
      btn.addEventListener("click", () => answer(interval.id));
    } else {
      btn.classList.add("locked");
      btn.disabled = true;
      btn.innerHTML = `🔒<span class="short">${interval.name}</span>`;
    }
    container.appendChild(btn);
  }
}

function markAnswers(chosen, correct) {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.id === correct) btn.classList.add("correct");
    else if (btn.dataset.id === chosen) btn.classList.add("wrong");
    else btn.classList.add("dimmed");
  });
}

function hideFeedback() {
  $("#feedback").classList.add("hidden");
  $("#feedback").classList.remove("ok", "ko");
  $("#next-btn").classList.add("hidden");
  $("#song-area").innerHTML = "";
}

function showFeedback(ok) {
  const fb = $("#feedback");
  fb.classList.remove("hidden");
  const interval = intervalById(currentQuestion.id);
  const dirLabel = currentQuestion.direction === "asc" ? "ascendante" : "descendante";
  if (ok) {
    fb.classList.add("ok");
    $("#feedback-text").textContent = `✅ Bravo ! C'était bien : ${interval.name} (${dirLabel}).`;
  } else {
    fb.classList.add("ko");
    $("#feedback-text").textContent = `❌ Raté… C'était : ${interval.name} (${dirLabel}).`;
    renderSongArea();
    $("#next-btn").classList.remove("hidden");
  }
}

// Aide mnémotechnique : chanson de référence pour l'intervalle raté

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getChosenSong(key, builtin, custom) {
  const ref = state.refSongs[key];
  if (ref === undefined) return null;
  if (typeof ref === "number") return builtin[ref] || null; // ancien format
  return ref.src === "custom" ? custom[ref.idx] || null : builtin[ref.idx] || null;
}

function renderSongArea(forceChoice = false) {
  const area = $("#song-area");
  const { id, direction } = currentQuestion;
  const key = `${id}-${direction}`;
  const builtin = (SONGS[id] && SONGS[id][direction]) || [];
  const custom = state.customSongs[key] || [];
  const chosen = getChosenSong(key, builtin, custom);

  if (chosen && !forceChoice) {
    area.innerHTML = `
      <div class="song-hint">
        💡 Pense à ta chanson de référence :
        <div class="song-title">${escapeHtml(chosen.title)}</div>
        <div class="song-artist">${escapeHtml(chosen.artist || "")}</div>
      </div>
      <button class="change-song">Choisir une autre chanson de référence</button>`;
    area.querySelector(".change-song").addEventListener("click", () => renderSongArea(true));
  } else {
    const item = (s, src, k) => `
        <button class="song-choice" data-src="${src}" data-idx="${k}">
          ${src === "custom" ? "⭐" : "🎵"} <strong>${escapeHtml(s.title)}</strong>
          ${s.artist ? `<span class="song-artist">— ${escapeHtml(s.artist)}</span>` : ""}
        </button>`;
    const items =
      builtin.map((s, k) => item(s, "builtin", k)).join("") +
      custom.map((s, k) => item(s, "custom", k)).join("");
    area.innerHTML = `
      <p>Ces chansons célèbres commencent par cet intervalle.
      <strong>Choisis celle qui te parle le plus</strong> : elle deviendra ta référence.</p>
      <div class="song-choices">${items}</div>
      <form class="add-song">
        <input type="text" name="title" placeholder="Ou ajoute ta propre chanson…" required>
        <input type="text" name="artist" placeholder="Artiste (optionnel)">
        <button type="submit" class="primary add-song-btn">+ Ajouter comme référence</button>
      </form>`;
    area.querySelectorAll(".song-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.refSongs[key] = { src: btn.dataset.src, idx: Number(btn.dataset.idx) };
        saveState();
        renderSongArea();
      });
    });
    area.querySelector(".add-song").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = e.target.title.value.trim();
      if (!title) return;
      const artist = e.target.artist.value.trim();
      if (!state.customSongs[key]) state.customSongs[key] = [];
      state.customSongs[key].push({ title, artist });
      state.refSongs[key] = { src: "custom", idx: state.customSongs[key].length - 1 };
      saveState();
      renderSongArea();
    });
  }
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

// ---------- Statistiques ----------

function renderStats() {
  const total = state.history.length;
  const correct = state.history.filter((h) => h.ok).length;
  $("#stats-summary").textContent = total
    ? `${total} réponses au total — ${Math.round((correct / total) * 100)} % de réussite.`
    : "Aucune réponse pour l'instant. Lance-toi !";

  // Probabilité d'apparition : poids adaptatif de l'intervalle rapporté au
  // total (sans le malus anti-répétition, qui varie à chaque question).
  const pool = unlockedIds();
  const totalWeight = pool.reduce((sum, id) => sum + intervalWeight(id), 0);
  const proba = (id) => intervalWeight(id) / totalWeight;

  const unlocked = new Set(pool);
  const sorted = [...INTERVALS].sort((a, b) => {
    const ua = unlocked.has(a.id), ub = unlocked.has(b.id);
    if (ua !== ub) return ua ? -1 : 1; // verrouillés en bas
    if (!ua) return 0;
    return proba(b.id) - proba(a.id);
  });

  const header = `<div class="stat-row stat-header">
    <span>Intervalle</span>
    <span>Réussite</span>
    <span class="stat-pct"></span>
    <span class="stat-proba">Proba</span>
  </div>`;

  const rows = sorted.map((interval) => {
    if (!unlocked.has(interval.id)) {
      return `<div class="stat-row stat-locked"><span>🔒 ${interval.name}</span><div class="stat-bar-track"></div><span class="stat-pct">—</span><span class="stat-proba">—</span></div>`;
    }
    const probaPct = `${Math.round(proba(interval.id) * 100)} %`;
    const attempts = state.history.filter((h) => h.i === interval.id);
    if (attempts.length === 0) {
      return `<div class="stat-row"><span>${interval.name}</span><div class="stat-bar-track"></div><span class="stat-pct">0 essai</span><span class="stat-proba">${probaPct}</span></div>`;
    }
    const acc = attempts.filter((h) => h.ok).length / attempts.length;
    const pct = Math.round(acc * 100);
    const cls = acc >= 0.8 ? "" : acc >= 0.5 ? "mid" : "low";
    return `<div class="stat-row">
      <span>${interval.name}</span>
      <div class="stat-bar-track"><div class="stat-bar ${cls}" style="width:${pct}%"></div></div>
      <span class="stat-pct">${pct} % (${attempts.length})</span>
      <span class="stat-proba">${probaPct}</span>
    </div>`;
  }).join("");
  $("#stats-table").innerHTML = header + rows;

  renderBestScores();
  renderProgressChart();
}

function renderBestScores() {
  const b = state.bestScores;
  const nofiletVal = b.nofilet ? `${b.nofilet.streak} 🔥` : "—";
  const timedRows = [1, 2, 3, 5]
    .map((min) => {
      const rec = b.timed[String(min)];
      const val = rec ? `${rec.correct}/${rec.total} bonnes réponses` : "—";
      return `<div class="best-row"><span>${min} min</span><span>${val}</span></div>`;
    })
    .join("");
  $("#best-scores").innerHTML = `
    <div class="best-row"><span>🎯 Sans filet</span><span>${nofiletVal}</span></div>
    ${timedRows}`;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderProgressChart() {
  const DAYS = 10;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ key: dayKey(d.getTime()), date: d, correct: 0, total: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const h of state.history) {
    const b = byKey[dayKey(h.t)];
    if (b) {
      b.total++;
      if (h.ok) b.correct++;
    }
  }

  const container = $("#progress-chart");
  if (!buckets.some((b) => b.total > 0)) {
    container.innerHTML = `<p class="chart-empty">Pas encore assez de données pour un graphique. Continue à t'entraîner !</p>`;
    return;
  }

  const bars = buckets
    .map((b) => {
      const pct = b.total ? Math.round((b.correct / b.total) * 100) : null;
      const height = pct === null ? 3 : Math.max(6, pct);
      const cls = pct === null ? "empty" : pct >= 80 ? "" : pct >= 50 ? "mid" : "low";
      const label = `${String(b.date.getDate()).padStart(2, "0")}/${String(b.date.getMonth() + 1).padStart(2, "0")}`;
      const title = pct === null ? `${label} : aucune réponse` : `${label} : ${b.correct}/${b.total} (${pct} %)`;
      return `<div class="chart-bar-wrap" title="${title}">
        <div class="chart-bar ${cls}" style="height:${height}%"></div>
        <span class="chart-day-label">${label}</span>
      </div>`;
    })
    .join("");
  container.innerHTML = `<div class="chart-bars">${bars}</div>`;
}

function resetProgress() {
  if (!confirm("Réinitialiser toute ta progression (historique, niveaux, chansons de référence, records) ?")) return;
  state = defaultState();
  saveState();
  renderLevel();
  renderStats();
  selectMode("free", null);
}

// ---------- Export / import ----------

function exportProgress() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interval-trainer-progression-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      alert("Fichier invalide : ce n'est pas un JSON valide.");
      return;
    }
    if (!parsed || !Array.isArray(parsed.history)) {
      alert("Fichier invalide : ce n'est pas une sauvegarde de progression reconnue.");
      return;
    }
    if (!confirm("Importer ce fichier remplacera ta progression actuelle. Continuer ?")) return;
    state = {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultState().settings, ...parsed.settings },
      bestScores: {
        ...defaultState().bestScores,
        ...parsed.bestScores,
        timed: { ...(parsed.bestScores && parsed.bestScores.timed) },
      },
    };
    saveState();
    $("#direction-select").value = state.settings.direction;
    renderLevel();
    renderStats();
    selectMode("free", null);
    alert("Progression importée avec succès !");
  };
  reader.readAsText(file);
}

// ---------- Initialisation ----------

$("#play-btn").addEventListener("click", () => {
  if (typeof Tone !== "undefined") Tone.start();
  if (currentQuestion) playInterval(currentQuestion);
  else newQuestion(); // newQuestion() joue elle-même l'intervalle
});

$("#next-btn").addEventListener("click", handleNext);

$("#stats-btn").addEventListener("click", () => {
  const stats = $("#stats");
  stats.classList.toggle("hidden");
  if (!stats.classList.contains("hidden")) renderStats();
});

$("#reset-btn").addEventListener("click", resetProgress);

document.querySelectorAll(".timer-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    const m = btn.dataset.mode;
    selectMode(m, m === "timed" ? Number(btn.dataset.min) : null);
  });
});
$("#recap-replay").addEventListener("click", () => selectMode(mode, mode === "timed" ? timedMinutes : null));
$("#recap-free").addEventListener("click", () => selectMode("free", null));

$("#export-btn").addEventListener("click", exportProgress);
$("#import-btn").addEventListener("click", () => $("#import-input").click());
$("#import-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importProgress(file);
  e.target.value = "";
});

$("#direction-select").value = state.settings.direction;
$("#direction-select").addEventListener("change", (e) => {
  state.settings.direction = e.target.value;
  saveState();
  newQuestion();
});

renderLevel();
renderAnswers();
initSampler(); // précharge les échantillons en tâche de fond
