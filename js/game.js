/* 合成大西瓜 —— 主逻辑：输入、合成、特效、渲染 */
(function () {
  "use strict";

  // ---------- 常量 ----------
  var W = 420, H = 700, WALL = 10, LINE_Y = 140, DROP_Y = 66;
  var COOLDOWN = 0.5;          // 两次投掷间隔（秒）
  var OVER_TIME = 1.6;         // 压线多久判负（秒）
  var COMBO_WINDOW = 0.9;      // 连击窗口（秒）
  var SCORE_TABLE = [0, 0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]; // 合成出第 n 档的得分
  var SPAWN_WEIGHTS = [30, 26, 20, 15, 9]; // 只投放前 5 档

  // ---------- DOM ----------
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var elScore = document.getElementById("score");
  var elBest = document.getElementById("best");
  var elNext = document.getElementById("next-canvas");
  var nextCtx = elNext.getContext("2d");
  var ovStart = document.getElementById("overlay-start");
  var ovOver = document.getElementById("overlay-over");
  var elFinal = document.getElementById("final-score");
  var elFinalBest = document.getElementById("final-best");
  var elRecord = document.getElementById("new-record");
  var elToast = document.getElementById("toast");
  var elWrap = document.querySelector(".stage-wrap");

  // ---------- 状态 ----------
  var world = new World(WALL, W - WALL, H - WALL);
  var state = "ready"; // ready | playing | over
  var score = 0, best = 0, newBest = false;
  try { best = parseInt(localStorage.getItem("watermelon_best") || "0", 10) || 0; } catch (e) {}
  elBest.textContent = best;

  var curTier = null, nextT = null;
  var cooldown = 0, aimX = W / 2;
  var particles = [], floaters = [], confetti = [];
  var shake = 0, warnT = 0, combo = 0, comboTimer = 0;
  var bgCanvas = null, tGlobal = 0, viewScale = 1;

  // ---------- 工具 ----------
  var TAU = Math.PI * 2;
  function randTier() {
    var r = Math.random() * 100, acc = 0;
    for (var i = 0; i < SPAWN_WEIGHTS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r < acc) return i + 1;
    }
    return 1;
  }
  function clampAim(x, tier) {
    var r = FRUITS[tier - 1].r;
    return Math.max(WALL + r + 2, Math.min(W - WALL - r - 2, x));
  }
  function showToast(msg) {
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { elToast.classList.remove("show"); }, 1600);
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- 画布自适应 ----------
  function fit() {
    var availW = Math.min(elWrap.clientWidth - 4, 460);
    var availH = elWrap.clientHeight - 4;
    var s = Math.max(0.3, Math.min(availW / W, availH / H));
    canvas.style.width = (W * s) + "px";
    canvas.style.height = (H * s) + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * s * dpr);
    canvas.height = Math.round(H * s * dpr);
    viewScale = canvas.width / W;
  }
  window.addEventListener("resize", fit);

  // ---------- 输入 ----------
  function toGameX(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  }
  canvas.addEventListener("pointermove", function (e) {
    if (state === "playing" && curTier != null) aimX = clampAim(toGameX(e), curTier);
  });
  canvas.addEventListener("pointerdown", function (e) {
    Sound.unlock();
    if (state === "playing" && curTier != null) {
      aimX = clampAim(toGameX(e), curTier);
      if (canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  canvas.addEventListener("pointerup", function (e) {
    if (state !== "playing" || curTier == null) return;
    aimX = clampAim(toGameX(e), curTier);
    dropFruit();
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  window.addEventListener("keydown", function (e) {
    if (state !== "playing") return;
    if (e.key === "g" || e.key === "G") { gameOver(); return; } // 调试用：快速结束一局
    if (curTier == null) return;
    if (e.key === "ArrowLeft") aimX = clampAim(aimX - 24, curTier);
    else if (e.key === "ArrowRight") aimX = clampAim(aimX + 24, curTier);
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); dropFruit(); }
  });

  function dropFruit() {
    if (cooldown > 0 || curTier == null) return;
    var r = FRUITS[curTier - 1].r;
    var b = world.add(new Body(aimX, DROP_Y, r, curTier));
    b.vy = 60;
    Sound.drop();
    curTier = null;
    cooldown = COOLDOWN;
  }

  // ---------- 合成 ----------
  function processMerges() {
    var bs = world.bodies, i, j, a, b;
    var anyMerged = false;
    for (var round = 0; round < 3; round++) {
      var found = false;
      outer:
      for (i = 0; i < bs.length; i++) {
        a = bs[i];
        if (a.dead) continue;
        for (j = i + 1; j < bs.length; j++) {
          b = bs[j];
          if (b.dead || b.tier !== a.tier) continue;
          var dx = b.x - a.x, dy = b.y - a.y;
          var rr = a.r + b.r + 1; // 接触即合成（物理会把重叠分离到 ~0.4px 间隙）
          if (dx * dx + dy * dy <= rr * rr) {
            doMerge(a, b);
            found = true;
            anyMerged = true;
            break outer;
          }
        }
      }
      if (!found) break;
    }
    if (anyMerged) world.bodies = world.bodies.filter(function (x) { return !x.dead; });
  }

  function doMerge(a, b) {
    a.dead = b.dead = true;
    var tier = a.tier;
    var nx = (a.x + b.x) / 2, ny = (a.y + b.y) / 2;

    if (tier >= TIERS) { // 两个西瓜合体消散 → 大奖
      addScore(200, nx, ny - 40, true);
      burst(nx, ny, "#ff5b6a", 40, 6);
      confettiBurst(nx, ny);
      shake = Math.min(16, shake + 12);
      Sound.big();
      floater(nx, ny - 70, "双瓜消散！+200", "#ff5b6a", 20);
      return;
    }

    var nt = tier + 1;
    var def = FRUITS[nt - 1];
    var nb = new Body(nx, ny, def.r, nt);
    nb.vx = (a.vx + b.vx) * 0.25;
    nb.vy = (a.vy + b.vy) * 0.25 - 70;
    nb.av = (Math.random() - 0.5) * 4;
    nb.pop = 1;
    world.add(nb);

    combo = comboTimer > 0 ? combo + 1 : 1;
    comboTimer = COMBO_WINDOW;
    var pts = SCORE_TABLE[nt] * Math.min(combo, 5);
    addScore(pts, nx, ny - def.r - 8, false);
    burst(nx, ny, def.light, 8 + nt * 2, 3 + nt * 0.4);
    shake = Math.min(14, shake + nt * 0.7);
    Sound.pop(nt);
    if (combo >= 2) floater(nx, ny - def.r - 30, "连击 x" + combo, "#ff8f3d", 15);
    if (nt === TIERS) { // 首次合成出西瓜
      floater(nx, ny - def.r - 52, "🍉 合成大西瓜！", "#2e8b3a", 20);
      confettiBurst(nx, ny);
      Sound.big();
      shake = 12;
    }
  }

  function addScore(n, x, y, big) {
    score += n;
    elScore.textContent = score;
    if (score > best) {
      best = score;
      newBest = true;
      elBest.textContent = best;
      try { localStorage.setItem("watermelon_best", String(best)); } catch (e) {}
    }
    floater(x, y, "+" + n, big ? "#ff5b6a" : "#5b3a29", big ? 22 : 16);
  }

  // ---------- 特效 ----------
  function burst(x, y, color, n, spd) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = (0.4 + Math.random() * 0.6) * spd * 60;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        r: 2 + Math.random() * 3,
        color: color,
        life: 1, decay: 1.6 + Math.random()
      });
    }
  }
  function confettiBurst(x, y) {
    var colors = ["#ff5b6a", "#ffc233", "#4caf50", "#a06cd5", "#ff9838", "#5bc8ff"];
    for (var i = 0; i < 36; i++) {
      var a = Math.random() * TAU, v = 120 + Math.random() * 260;
      confetti.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 180,
        w: 5 + Math.random() * 5,
        ang: Math.random() * TAU, av: (Math.random() - 0.5) * 12,
        color: colors[i % colors.length],
        life: 1.6
      });
    }
  }
  function floater(x, y, txt, color, size) {
    floaters.push({ x: x, y: y, txt: txt, color: color, size: size || 16, life: 1 });
  }
  function updateFx(dt) {
    var i, p;
    for (i = particles.length - 1; i >= 0; i--) {
      p = particles[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = floaters.length - 1; i >= 0; i--) {
      p = floaters[i];
      p.life -= dt * 1.1;
      if (p.life <= 0) { floaters.splice(i, 1); continue; }
      p.y -= 42 * dt;
    }
    for (i = confetti.length - 1; i >= 0; i--) {
      p = confetti[i];
      p.life -= dt;
      if (p.life <= 0) { confetti.splice(i, 1); continue; }
      p.vy += 700 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.ang += p.av * dt;
    }
    for (i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 5);
    }
    shake = Math.max(0, shake - dt * 26);
  }

  // ---------- 危险线 / 结束 ----------
  function updateDanger(dt) {
    var danger = false;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      var sp = Math.abs(b.vx) + Math.abs(b.vy);
      if (b.age > 0.7 && sp < 120 && b.y - b.r < LINE_Y) { danger = true; break; }
    }
    if (danger) warnT += dt;
    else warnT = Math.max(0, warnT - dt * 1.6);
    if (warnT > OVER_TIME) gameOver();
  }

  function gameOver() {
    if (state !== "playing") return;
    state = "over";
    Sound.over();
    elFinal.textContent = score;
    elFinalBest.textContent = best;
    elRecord.style.display = newBest && score > 0 ? "inline-block" : "none";
    ovOver.classList.remove("hidden");
    if (window.__fillLazyAds) window.__fillLazyAds();
  }

  // ---------- 开局 / 重置 ----------
  function start() {
    world.bodies.length = 0;
    particles.length = 0; floaters.length = 0; confetti.length = 0;
    score = 0; elScore.textContent = "0";
    newBest = false; warnT = 0; combo = 0; comboTimer = 0; shake = 0;
    curTier = randTier(); nextT = randTier();
    cooldown = 0; aimX = W / 2;
    drawNextPreview();
    ovStart.classList.add("hidden");
    ovOver.classList.add("hidden");
    state = "playing";
  }

  function seedAmbient() { // 开始界面的氛围水果
    var tiers = [1, 2, 3, 2, 4];
    for (var i = 0; i < tiers.length; i++) {
      var r = FRUITS[tiers[i] - 1].r;
      var x = WALL + r + 10 + Math.random() * (W - 2 * (WALL + r + 10));
      var y = H - WALL - r - i * 40;
      world.add(new Body(x, y, r, tiers[i]));
    }
  }

  // ---------- 下一颗预览 ----------
  function drawNextPreview() {
    nextCtx.clearRect(0, 0, 88, 88);
    if (nextT == null) return;
    var spr = FRUIT_SPRITES[nextT - 1];
    var total = (spr.def.r + spr.pad) * 2;
    var dw = total * (80 / total);
    nextCtx.drawImage(spr.canvas, (88 - dw) / 2, (88 - dw) / 2, dw, dw);
  }

  // ---------- 背景 ----------
  function makeBg() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = W; bgCanvas.height = H;
    var c = bgCanvas.getContext("2d");
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#fff8ec");
    g.addColorStop(1, "#ffeeda");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(240,190,140,.14)";
    for (var y = 0; y < 14; y++) {
      for (var x = 0; x < 9; x++) {
        c.beginPath();
        c.arc(x * 52 + (y % 2) * 26, y * 52 + 20, 3.2, 0, TAU);
        c.fill();
      }
    }
    var v = c.createRadialGradient(W / 2, H - 40, 60, W / 2, H - 40, 420);
    v.addColorStop(0, "rgba(180,110,60,.10)");
    v.addColorStop(1, "rgba(180,110,60,0)");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  // ---------- 渲染 ----------
  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.drawImage(bgCanvas, 0, 0);

    // 果盘边框
    ctx.strokeStyle = "rgba(200,140,90,.35)";
    ctx.lineWidth = 3;
    roundRectPath(ctx, WALL - 6, WALL - 6, W - 2 * (WALL - 6), H - 2 * (WALL - 6), 18);
    ctx.stroke();

    // 危险线
    var warn = warnT > 0 && state === "playing";
    var pulse = 0.5 + 0.5 * Math.sin(tGlobal * 14);
    ctx.strokeStyle = warn
      ? "rgba(232,73,79," + (0.45 + 0.55 * pulse).toFixed(3) + ")"
      : "rgba(200,140,90,.35)";
    ctx.lineWidth = warn ? 3 : 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(WALL, LINE_Y); ctx.lineTo(W - WALL, LINE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = warn ? "rgba(232,73,79,.95)" : "rgba(200,140,90,.65)";
    ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(warn ? "⚠ 危险！" : "⚠ 危险线", W - WALL - 6, LINE_Y - 6);
    if (warn) { // 压线倒计时进度条
      var p = Math.max(0, 1 - warnT / OVER_TIME);
      ctx.fillStyle = "rgba(232,73,79,.8)";
      ctx.fillRect(WALL, LINE_Y - 5, (W - 2 * WALL) * p, 3);
    }

    // 水果
    var i, b;
    for (i = 0; i < world.bodies.length; i++) {
      b = world.bodies[i];
      var spr = FRUIT_SPRITES[b.tier - 1];
      var half = spr.def.r + spr.pad;
      var s = 1;
      if (b.pop > 0) s = 1 + 0.32 * Math.sin((1 - b.pop) * Math.PI);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      if (s !== 1) ctx.scale(s, s);
      ctx.drawImage(spr.canvas, -half, -half, half * 2, half * 2);
      ctx.restore();
    }

    // 手中的水果 + 瞄准线
    if (state === "playing" && curTier != null) {
      var r = FRUITS[curTier - 1].r;
      var spr2 = FRUIT_SPRITES[curTier - 1];
      var half2 = spr2.def.r + spr2.pad;
      ctx.strokeStyle = "rgba(120,80,50,.28)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(aimX, DROP_Y + r);
      ctx.lineTo(aimX, H - WALL);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(120,80,50,.12)";
      ctx.beginPath();
      ctx.ellipse(aimX, H - WALL - 5, r * 0.8, 6, 0, 0, TAU);
      ctx.fill();
      var bobY = DROP_Y + Math.sin(tGlobal * 3) * 3;
      ctx.save();
      ctx.translate(aimX, bobY);
      ctx.rotate(Math.sin(tGlobal * 1.4) * 0.08);
      ctx.drawImage(spr2.canvas, -half2, -half2, half2 * 2, half2 * 2);
      ctx.restore();
    }

    // 粒子
    for (i = 0; i < particles.length; i++) {
      var q = particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, q.life));
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * q.life + 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 彩带
    for (i = 0; i < confetti.length; i++) {
      var cf = confetti[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, cf.life);
      ctx.translate(cf.x, cf.y);
      ctx.rotate(cf.ang);
      ctx.fillStyle = cf.color;
      ctx.fillRect(-cf.w / 2, -cf.w / 3, cf.w, cf.w * 0.66);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // 飘字
    ctx.textAlign = "center";
    for (i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.font = "900 " + f.size + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.strokeStyle = "rgba(255,252,245,.9)";
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 主循环 ----------
  var last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    var dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    tGlobal += dt;

    if (state === "playing") {
      world.step(dt);
      processMerges();
      updateDanger(dt);
      if (state === "playing" && cooldown > 0) {
        cooldown -= dt;
        if (cooldown <= 0) {
          curTier = nextT;
          nextT = randTier();
          drawNextPreview();
          aimX = clampAim(aimX, curTier);
        }
      }
      if (comboTimer > 0) comboTimer -= dt;
      else combo = 0;
    } else {
      world.step(dt * 0.6); // 非游戏状态下慢动作滚动
    }
    updateFx(dt);
    render();
  }

  // ---------- 按钮 ----------
  document.getElementById("btn-start").addEventListener("click", function () {
    Sound.unlock(); Sound.click(); start();
  });
  document.getElementById("btn-again").addEventListener("click", function () {
    Sound.click(); start();
  });
  document.getElementById("btn-restart").addEventListener("click", function () {
    Sound.click();
    if (state !== "ready") start();
  });
  var btnMute = document.getElementById("btn-mute");
  function syncMute() { btnMute.textContent = Sound.muted ? "🔇" : "🔊"; }
  btnMute.addEventListener("click", function () { Sound.toggle(); syncMute(); });
  syncMute();

  document.getElementById("btn-share").addEventListener("click", function () {
    var text = "我在「合成大西瓜」拿到了 " + score + " 分，快来挑战我！🍉";
    if (navigator.share) {
      navigator.share({ title: "合成大西瓜", text: text, url: location.href }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + " " + location.href).then(
        function () { showToast("成绩已复制，去分享吧！"); },
        function () { showToast(text); }
      );
    } else showToast(text);
  });

  document.addEventListener("visibilitychange", function () { last = performance.now(); });

  // 自动演示/压测模式：?auto=1（随机投掷，用于测试物理与合成链路）
  if (new URLSearchParams(location.search).get("auto") != null) {
    setInterval(function () {
      if (state !== "playing") { start(); return; }
      if (cooldown <= 0 && curTier != null) {
        aimX = WALL + 30 + Math.random() * (W - 2 * WALL - 60);
        dropFruit();
      }
    }, 320);
  }

  // 调试接口
  window.__game = {
    world: world,
    start: start,
    get state() { return state; },
    get score() { return score; }
  };

  // ---------- 初始化 ----------
  makeBg();
  seedAmbient();
  drawNextPreview();
  fit();
  requestAnimationFrame(tick);
})();
