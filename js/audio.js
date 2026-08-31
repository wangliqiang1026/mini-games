/* WebAudio 合成音效（无外部音频资源） */
(function () {
  "use strict";
  var ctx = null, master = null, noiseBuf = null;
  var muted = false;
  try { muted = localStorage.getItem("watermelon_muted") === "1"; } catch (e) {}

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 0.3);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted || !ensure()) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, delay) {
    if (muted || !ensure() || !noiseBuf) return;
    var t0 = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  window.Sound = {
    get muted() { return muted; },
    unlock: function () { ensure(); },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem("watermelon_muted", muted ? "1" : "0"); } catch (e) {}
      if (!muted) { ensure(); tone(660, 0.08, "triangle", 0.2); }
      return muted;
    },
    drop: function () { tone(200, 0.09, "sine", 0.22, 0, 120); },
    pop: function (tier) {
      var f = Math.max(140, 560 - tier * 34);
      tone(f, 0.14, "triangle", 0.32, 0, f * 0.6);
      tone(f * 2, 0.09, "sine", 0.12, 0.02);
      noise(0.06, 0.1);
    },
    big: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.26, i * 0.07); });
      noise(0.2, 0.12);
    },
    over: function () {
      [392, 311, 262, 196].forEach(function (f, i) { tone(f, 0.22, "sine", 0.3, i * 0.16); });
    },
    click: function () { tone(720, 0.05, "triangle", 0.15); }
  };
})();
