// ---------- État & persistance ----------

const STORAGE_KEY = "interval-trainer-v1";

const defaultState = () => ({
  level: 1, // nombre d'intervalles débloqués - 1 (level 1 = 2 intervalles)
  history: [], // { i: intervalId, d: "asc"|"desc", a: réponse, ok: bool, t: timestamp }
  // "m3-asc" -> index dans SONGS[id][dir] (nombre, ancien format)
  //          ou { src: "builtin"|"custom", idx } (nouveau format)
  refSongs: {},
  customSongs: {}, // "m3-asc" -> [{ title, artist }] ajoutées par l'utilisateur
  settings: { direction: "asc" },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return { ...defaultState(), ...s, settings: { ...defaultState().settings, ...s.settings } };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ---------- Audio : son de type piano (Web Audio) ----------

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playPianoNote(midi, when, duration = 1.4) {
  const ctx = getCtx();
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

function playInterval(q) {
  const ctx = getCtx();
  const t = ctx.currentTime + 0.05;
  playPianoNote(q.note1, t);
  playPianoNote(q.note2, t + 0.9);
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
function pickInterval() {
  const pool = unlockedIds();
  const lastId = state.history.length ? state.history[state.history.length - 1].i : null;
  const weights = pool.map((id) => {
    const attempts = state.history.filter((h) => h.i === id).length;
    const acc = recentAccuracy(id);
    let w = 1;
    if (acc !== null) w += 5 * (1 - acc); // plus d'erreurs → plus fréquent
    if (attempts < 4) w += 2; // intervalle récent/débloqué → plus fréquent
    if (id === lastId) w *= 0.3; // éviter de répéter le même
    return w;
  });
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

  markAnswers(id, currentQuestion.id);
  showFeedback(ok);
  renderLevel();

  if (newInterval) {
    showToast(`🎉 Nouvel intervalle débloqué : ${newInterval.name} !`);
  }

  if (ok) {
    setTimeout(newQuestion, 1200);
  }
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

  const unlocked = new Set(unlockedIds());
  const rows = INTERVALS.map((interval) => {
    const attempts = state.history.filter((h) => h.i === interval.id);
    const isUnlocked = unlocked.has(interval.id);
    if (!isUnlocked) {
      return `<div class="stat-row stat-locked"><span>🔒 ${interval.name}</span><div class="stat-bar-track"></div><span class="stat-pct">—</span></div>`;
    }
    if (attempts.length === 0) {
      return `<div class="stat-row"><span>${interval.name}</span><div class="stat-bar-track"></div><span class="stat-pct">0 essai</span></div>`;
    }
    const acc = attempts.filter((h) => h.ok).length / attempts.length;
    const pct = Math.round(acc * 100);
    const cls = acc >= 0.8 ? "" : acc >= 0.5 ? "mid" : "low";
    return `<div class="stat-row">
      <span>${interval.name}</span>
      <div class="stat-bar-track"><div class="stat-bar ${cls}" style="width:${pct}%"></div></div>
      <span class="stat-pct">${pct} % (${attempts.length})</span>
    </div>`;
  }).join("");
  $("#stats-table").innerHTML = rows;
}

function resetProgress() {
  if (!confirm("Réinitialiser toute ta progression (historique, niveaux, chansons de référence) ?")) return;
  state = defaultState();
  saveState();
  renderLevel();
  renderStats();
  newQuestion();
}

// ---------- Initialisation ----------

$("#play-btn").addEventListener("click", () => {
  if (currentQuestion) playInterval(currentQuestion);
});

$("#next-btn").addEventListener("click", newQuestion);

$("#stats-btn").addEventListener("click", () => {
  const stats = $("#stats");
  stats.classList.toggle("hidden");
  if (!stats.classList.contains("hidden")) renderStats();
});

$("#reset-btn").addEventListener("click", resetProgress);

$("#direction-select").value = state.settings.direction;
$("#direction-select").addEventListener("change", (e) => {
  state.settings.direction = e.target.value;
  saveState();
  newQuestion();
});

renderLevel();
renderAnswers();

// Le contexte audio ne peut démarrer qu'après une interaction : la première
// question est lancée au premier clic sur "Écouter".
$("#play-btn").addEventListener("click", () => {
  if (!currentQuestion) newQuestion();
}, { once: true });
