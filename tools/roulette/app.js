/* ぽこルーレット
 * file:// で動かすため module / fetch は使わない(docs/development/conventions.md)
 */
(function () {
  "use strict";

  var VERSION = "0.2.0"; // tool.json と揃える
  var STORAGE_KEY = "poko-tools.roulette.v1";
  var STAGE_W = 1920;
  var STAGE_H = 1080;
  var WINNER_SHOW_MS = 5000;
  var TWO_PI = Math.PI * 2;
  var COLORS = ["#ff8fc7", "#ffffff", "#6cb8ff", "#ff6b6b", "#b98cff", "#ffe066"];
  var INK = "#3b2b45";
  var FONT = '"M PLUS Rounded 1c", "Kosugi Maru", "Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Meiryo", system-ui, sans-serif';
  var MAX_NAME_LENGTH = 40;
  // 針のプルプル: 項目の境目が針を通るたびに弾かれ、すぐ減衰する
  // 最後の境目は停止の0.7秒以上前に通る(offset>=0.15)ので、止まる瞬間には揺れが収まっている
  var KICK_DEG = 5;
  var KICK_DECAY_MS = 80;
  var KICK_PERIOD_MS = 160;
  var KICK_FULL_SPEED = 6;   // rad/s。これより遅いと弾く強さを弱める
  var KICK_MIN_RATIO = 0.3;
  // 中心の飾りと重ならないよう、盤の中の文字を上にずらす量(半径比)
  var OFF_CENTER_Y = 0.35;

  // ---------- state ----------

  var state = {
    entries: [],   // {id, name}
    removed: [],   // 「当たったら消す」で盤から外した人。結果クリアで戻す
    winners: [],   // {n, name}
    spinCount: 0,
    lastWinnerId: null,
    options: { removeOnWin: false, noRepeat: false, showCount: false, sound: true, fanfare: true, congrats: true }
  };

  var rotation = 0;
  var spinning = false;
  var pendingRemovalId = null;
  var winnerTimer = null;
  var nextId = 1;

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      state.entries = Array.isArray(saved.entries) ? saved.entries : [];
      state.removed = Array.isArray(saved.removed) ? saved.removed : [];
      state.winners = Array.isArray(saved.winners) ? saved.winners : [];
      state.spinCount = saved.spinCount | 0;
      state.lastWinnerId = saved.lastWinnerId || null;
      for (var k in state.options) {
        if (saved.options && typeof saved.options[k] === "boolean") state.options[k] = saved.options[k];
      }
      state.entries.concat(state.removed).forEach(function (e) {
        if (e.id >= nextId) nextId = e.id + 1;
      });
    } catch (e) {
      // 保存データが壊れていても初期状態で起動する
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // 保存できない環境(シークレットウィンドウ等)でも動作は続ける
    }
  }

  // ---------- random ----------

  // 0 <= r < n の一様な整数(剰余の偏りを除く)
  function randInt(n) {
    var buf = new Uint32Array(1);
    var limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  function randFloat() {
    return randInt(0x40000000) / 0x40000000;
  }

  // ---------- DOM ----------

  function $(id) { return document.getElementById(id); }

  var el = {
    stage: $("stage"),
    wheelArea: document.querySelector(".wheel-area"),
    canvas: $("wheel"),
    pointer: document.querySelector(".pointer"),
    spinCount: $("spinCount"),
    winner: $("winner"),
    winnerLabel: document.querySelector(".winner-label"),
    winnerName: $("winnerName"),
    winnerList: $("winnerList"),
    entryList: $("entryList"),
    entryCount: $("entryCount"),
    clearEntries: $("clearEntries"),
    addInput: $("addInput"),
    addBtn: $("addBtn"),
    startBtn: $("startBtn"),
    resetBtn: $("resetBtn"),
    version: $("version"),
    opt: {
      removeOnWin: $("optRemoveOnWin"),
      noRepeat: $("optNoRepeat"),
      showCount: $("optShowCount"),
      sound: $("optSound"),
      fanfare: $("optFanfare"),
      congrats: $("optCongrats")
    }
  };
  var ctx = el.canvas.getContext("2d");

  // ---------- layout ----------

  var isObs = typeof window.obsstudio !== "undefined";
  var params = new URLSearchParams(location.search);
  if (!isObs && params.get("bg") !== "transparent") document.body.classList.add("preview");

  var stageScale = 1;
  function fitStage() {
    stageScale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    var left = (window.innerWidth - STAGE_W * stageScale) / 2;
    var top = (window.innerHeight - STAGE_H * stageScale) / 2;
    el.stage.style.transform = "translate(" + left + "px," + top + "px) scale(" + stageScale + ")";
    resizeCanvas();
  }

  function resizeCanvas() {
    var ratio = Math.max(1, (window.devicePixelRatio || 1) * stageScale);
    var size = Math.round(640 * ratio);
    if (el.canvas.width !== size) {
      el.canvas.width = size;
      el.canvas.height = size;
    }
    drawWheel();
  }

  // ---------- wheel ----------

  function segmentColor(i, n) {
    // 最後と最初が同じ色で隣り合う場合は最後の色をずらす
    if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[2];
    return COLORS[i % COLORS.length];
  }

  function normalize(a) {
    a %= TWO_PI;
    return a < 0 ? a + TWO_PI : a;
  }

  // 針(真上)の下にある項目の index
  function indexAtPointer(n) {
    return Math.floor(normalize(-rotation) / (TWO_PI / n)) % n;
  }

  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var s = text;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
    return s + "…";
  }

  function drawWheel() {
    var size = el.canvas.width;
    var k = size / 640;
    var c = size / 2;
    var r = 300 * k;
    var n = state.entries.length;

    ctx.clearRect(0, 0, size, size);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, TWO_PI);
      ctx.fillStyle = "#f3eaf2";
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = "800 " + 36 * k + "px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 中心の飾りと重ならないよう上にずらす
      ctx.fillText("名前を追加してね", c, c - r * OFF_CENTER_Y);
    } else {
      var seg = TWO_PI / n;
      for (var i = 0; i < n; i++) {
        var a0 = -Math.PI / 2 + rotation + i * seg;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, r, a0, a0 + seg);
        ctx.closePath();
        ctx.fillStyle = segmentColor(i, n);
        ctx.fill();
        if (n > 1) {
          ctx.lineWidth = 2 * k;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      }

      // 名前(中心から外向き)
      var fontSize = Math.max(14, Math.min(40, (TWO_PI * r * 0.55) / n / k * 0.9)) * k;
      if (n === 1) fontSize = 48 * k;
      ctx.font = "800 " + fontSize + "px " + FONT;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (var j = 0; j < n; j++) {
        var mid = -Math.PI / 2 + rotation + (j + 0.5) * seg;
        var label = fitText(state.entries[j].name, r * 0.66);
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(n === 1 ? 0 : mid);
        // 1人だけの時は中心の飾りと重ならないよう上に置く
        var x = n === 1 ? ctx.measureText(label).width / 2 : r * 0.9;
        var y = n === 1 ? -r * OFF_CENTER_Y : 0;
        ctx.lineWidth = fontSize * 0.28;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText(label, x, y);
        ctx.fillStyle = INK;
        ctx.fillText(label, x, y);
        ctx.restore();
      }
    }

    // 外枠と中心
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TWO_PI);
    ctx.lineWidth = 16 * k;
    ctx.strokeStyle = INK;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, 26 * k, 0, TWO_PI);
    ctx.fillStyle = "#ffe066";
    ctx.fill();
    ctx.lineWidth = 6 * k;
    ctx.stroke();
  }

  // ---------- sound (Web Audio 合成。素材ファイル不要) ----------

  var audio = null;
  var lastTickAt = 0;

  function audioCtx() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  }

  function tone(freq, start, duration, type, gain) {
    var ac = audioCtx();
    if (!ac) return;
    var t = ac.currentTime + start;
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function playTick() {
    if (!state.options.sound) return;
    var now = performance.now();
    if (now - lastTickAt < 35) return;
    lastTickAt = now;
    tone(1650, 0, 0.04, "triangle", 0.18);
  }

  function playWin() {
    if (!state.options.sound || !state.options.fanfare) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(f, i * 0.11, 0.35, "triangle", 0.22);
    });
    tone(1318.5, 0.44, 0.7, "sine", 0.18);
  }

  // ---------- spin ----------

  function pickWinnerIndex() {
    var candidates = [];
    state.entries.forEach(function (e, i) {
      if (state.options.noRepeat && state.entries.length > 1 && e.id === state.lastWinnerId) return;
      candidates.push(i);
    });
    return candidates[randInt(candidates.length)];
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  // ---------- pointer ----------

  var kickAt = 0;
  var kickAmp = 0;
  var kickRunning = false;

  // 境目に弾かれた時に呼ぶ。speed: 盤の角速度(rad/s)
  function kickPointer(speed) {
    kickAt = performance.now();
    kickAmp = KICK_DEG * Math.max(KICK_MIN_RATIO, Math.min(1, speed / KICK_FULL_SPEED));
    if (!kickRunning) {
      kickRunning = true;
      requestAnimationFrame(animatePointer);
    }
  }

  // 盤は時計回り = 上端は右へ動くので、針先は右(マイナス方向)へ弾かれて減衰振動する
  function animatePointer(now) {
    var dt = Math.max(0, now - kickAt);
    if (dt > KICK_DECAY_MS * 6) {
      kickRunning = false;
      el.pointer.style.transform = "";
      return;
    }
    var deg = -kickAmp * Math.exp(-dt / KICK_DECAY_MS) * Math.cos((dt / KICK_PERIOD_MS) * TWO_PI);
    el.pointer.style.transform = "rotate(" + deg.toFixed(2) + "deg)";
    requestAnimationFrame(animatePointer);
  }

  function start() {
    if (spinning) return;
    finishWinnerDisplay();
    var n = state.entries.length;
    if (n === 0) return;

    audioCtx(); // ユーザー操作の中で音声を有効化する

    var seg = TWO_PI / n;
    var w = pickWinnerIndex();
    var offset = 0.15 + randFloat() * 0.7; // 境界ギリギリに止めない
    var target = -(w + offset) * seg;
    var turns = 5 + randInt(3);
    var from = rotation;
    var delta = turns * TWO_PI + normalize(target - from);
    var duration = 4500 + randInt(2500);
    var winnerEntry = state.entries[w];

    spinning = true;
    state.spinCount += 1;
    render();

    var t0 = performance.now();
    var lastIdx = indexAtPointer(n);

    function frame(now) {
      var t = Math.min(1, (now - t0) / duration);
      rotation = from + delta * easeOutQuart(t);
      drawWheel();
      var idx = indexAtPointer(n);
      if (idx !== lastIdx) {
        lastIdx = idx;
        playTick();
        kickPointer((delta * 4 * Math.pow(1 - t, 3)) / (duration / 1000)); // easeOutQuart の微分
      }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        rotation = normalize(rotation);
        drawWheel();
        onStop(winnerEntry);
      }
    }
    requestAnimationFrame(frame);
  }

  function onStop(entry) {
    spinning = false;
    state.lastWinnerId = entry.id;
    state.winners.push({ n: state.spinCount, name: entry.name });
    if (state.options.removeOnWin) pendingRemovalId = entry.id;
    save();
    render({ newWinner: true });
    showWinner(entry.name);
    playWin();
  }

  function showWinner(name) {
    el.winnerName.textContent = name;
    el.winner.hidden = false;
    el.winner.classList.remove("hide");
    el.winner.classList.remove("show");
    void el.winner.offsetWidth; // アニメーションを再生し直す
    el.winner.classList.add("show");
    fitWinnerName();
    winnerTimer = setTimeout(function () {
      el.winner.classList.add("hide");
      winnerTimer = setTimeout(finishWinnerDisplay, 350);
    }, WINNER_SHOW_MS);
  }

  // 盤の幅に収まるよう文字サイズを決める(アニメーション中でも測れるよう canvas で計測)
  // 1行に入らない長い名前は2行に折り返す
  function fitWinnerName() {
    var maxSize = 110;
    var lineWidth = 460; // .winner-name の max-width から枠と余白を引いた幅
    ctx.save();
    ctx.font = "800 " + maxSize + "px " + FONT;
    var width = ctx.measureText(el.winnerName.textContent).width;
    ctx.restore();
    var oneLine = Math.floor(maxSize * lineWidth / width);
    var twoLines = oneLine < 56;
    var size = twoLines ? Math.floor(maxSize * lineWidth * 1.8 / width) : Math.min(maxSize, oneLine);
    el.winnerName.classList.toggle("two-lines", twoLines);
    el.winnerName.style.fontSize = Math.max(28, size) + "px";
  }

  // 当選表示を閉じ、「当たったら消す」を反映する
  function finishWinnerDisplay() {
    clearTimeout(winnerTimer);
    winnerTimer = null;
    el.winner.hidden = true;
    el.winner.classList.remove("show", "hide");
    if (pendingRemovalId !== null) {
      var id = pendingRemovalId;
      pendingRemovalId = null;
      var i = indexOfId(id);
      if (i >= 0) {
        state.removed.push(state.entries[i]);
        state.entries.splice(i, 1);
        save();
        render();
      }
    }
  }

  // ---------- entries ----------

  function indexOfId(id) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return i;
    return -1;
  }

  function addFromInput() {
    if (spinning) return;
    var names = el.addInput.value
      .split(/\r?\n/)
      .map(function (s) { return s.trim().slice(0, MAX_NAME_LENGTH); })
      .filter(function (s) { return s.length > 0; });
    if (names.length === 0) return;
    finishWinnerDisplay();
    names.forEach(function (name) {
      state.entries.push({ id: nextId++, name: name });
    });
    el.addInput.value = "";
    save();
    render();
  }

  function removeEntry(id) {
    if (spinning) return;
    finishWinnerDisplay();
    var i = indexOfId(id);
    if (i < 0) return;
    state.entries.splice(i, 1);
    save();
    render();
  }

  // 誤操作防止: 2回押しで全消去(OBSの対話ウィンドウでは confirm() が出ないため)
  var clearArmTimer = null;
  function clearEntries() {
    if (spinning) return;
    if (!el.clearEntries.classList.contains("armed")) {
      el.clearEntries.classList.add("armed");
      el.clearEntries.textContent = "もう一回で消去";
      clearArmTimer = setTimeout(disarmClear, 3000);
      return;
    }
    disarmClear();
    finishWinnerDisplay();
    state.entries = [];
    state.removed = [];
    state.lastWinnerId = null;
    save();
    render();
  }

  function disarmClear() {
    clearTimeout(clearArmTimer);
    el.clearEntries.classList.remove("armed");
    el.clearEntries.textContent = "全消去";
  }

  function resetResults() {
    if (spinning) return;
    finishWinnerDisplay();
    state.entries = state.entries.concat(state.removed);
    state.removed = [];
    state.winners = [];
    state.spinCount = 0;
    state.lastWinnerId = null;
    save();
    render();
  }

  // ---------- render ----------

  function render(opts) {
    opts = opts || {};
    var n = state.entries.length;

    el.entryCount.textContent = n;
    el.entryList.textContent = "";
    if (n === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "まだ誰もいないよ";
      el.entryList.appendChild(empty);
    }
    state.entries.forEach(function (e, i) {
      var li = document.createElement("li");
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = segmentColor(i, n);
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = e.name;
      name.title = e.name;
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.title = e.name + " を削除";
      del.disabled = spinning;
      del.addEventListener("click", function () { removeEntry(e.id); });
      li.appendChild(sw);
      li.appendChild(name);
      li.appendChild(del);
      el.entryList.appendChild(li);
    });

    el.winnerList.textContent = "";
    state.winners.forEach(function (w, i) {
      var li = document.createElement("li");
      if (opts.newWinner && i === state.winners.length - 1) li.className = "new";
      var num = document.createElement("span");
      num.className = "n";
      num.textContent = w.n + ".";
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = w.name;
      li.appendChild(num);
      li.appendChild(name);
      el.winnerList.appendChild(li);
    });
    el.winnerList.scrollTop = el.winnerList.scrollHeight;

    el.spinCount.hidden = !state.options.showCount || state.spinCount === 0;
    el.spinCount.textContent = state.spinCount + "回目";

    for (var k in el.opt) el.opt[k].checked = state.options[k];
    el.winnerLabel.hidden = !state.options.congrats; // 当選表示中の切替にもすぐ反映

    el.startBtn.disabled = spinning || n === 0;
    el.addBtn.disabled = spinning;
    el.resetBtn.disabled = spinning;
    el.clearEntries.disabled = spinning || (n === 0 && state.removed.length === 0);
    el.wheelArea.classList.toggle("spinning", spinning);

    if (!spinning) drawWheel();
  }

  // ---------- events ----------

  el.startBtn.addEventListener("click", start);
  el.resetBtn.addEventListener("click", resetResults);
  el.addBtn.addEventListener("click", addFromInput);
  el.clearEntries.addEventListener("click", clearEntries);
  el.addInput.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      addFromInput();
    }
  });
  Object.keys(el.opt).forEach(function (k) {
    el.opt[k].addEventListener("change", function () {
      state.options[k] = el.opt[k].checked;
      save();
      render();
    });
  });
  window.addEventListener("resize", fitStage);

  // ---------- boot ----------

  el.version.textContent = "ぽこルーレット v" + VERSION;
  load();
  render();
  fitStage();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawWheel);

  // 検証用フック(動作には影響しない)
  window.__pokoRoulette = {
    state: state,
    indexAtPointer: function () { return indexAtPointer(state.entries.length); },
    isSpinning: function () { return spinning; }
  };
})();
