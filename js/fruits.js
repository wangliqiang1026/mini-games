/* 水果定义与高清预渲染（Canvas 绘制，无外部图片资源） */
(function () {
  "use strict";

  // 11 档水果，半径为逻辑像素
  var FRUITS = [
    { name: "樱桃",   r: 12, base: "#d5383f", dark: "#9e2130", light: "#ff8a94", stem: true },
    { name: "草莓",   r: 16, base: "#ef5350", dark: "#c22f38", light: "#ff9d95", seeds: true },
    { name: "葡萄",   r: 21, base: "#a06cd5", dark: "#7b3fae", light: "#d3aef2" },
    { name: "柠檬",   r: 27, base: "#ffc233", dark: "#e09a1f", light: "#ffe9a3" },
    { name: "橘子",   r: 34, base: "#ff9838", dark: "#e77716", light: "#ffc98f", leaf: "#4caf50" },
    { name: "苹果",   r: 42, base: "#f04e3e", dark: "#c22f24", light: "#ff9d8a", leaf: "#4caf50", stem: true },
    { name: "梨",     r: 51, base: "#cddd64", dark: "#a3b944", light: "#eff7b0", leaf: "#6fae4e", stem: true },
    { name: "桃子",   r: 61, base: "#ffa6c1", dark: "#f27e9f", light: "#ffd9e5", leaf: "#5cab54" },
    { name: "菠萝",   r: 72, base: "#f5b53f", dark: "#d18f22", light: "#ffdd8f", crown: true, lattice: true },
    { name: "椰子",   r: 84, base: "#a5804f", dark: "#7c5a33", light: "#d3b183", husk: true },
    { name: "西瓜",   r: 97, base: "#4caf50", dark: "#2e8b3a", light: "#a5e8a0", stripes: true }
  ];

  var SS = 2; // 超采样倍率
  var TAU = Math.PI * 2;

  function drawFace(c, r) {
    var eyeY = -r * 0.05, eyeDX = r * 0.34, eyeR = Math.max(1.6, r * 0.11);
    c.fillStyle = "rgba(50,30,20,.92)";
    c.beginPath(); c.arc(-eyeDX, eyeY, eyeR, 0, TAU); c.fill();
    c.beginPath(); c.arc(eyeDX, eyeY, eyeR, 0, TAU); c.fill();
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(-eyeDX + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.38, 0, TAU); c.fill();
    c.beginPath(); c.arc(eyeDX + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.38, 0, TAU); c.fill();
    // 微笑
    c.strokeStyle = "rgba(50,30,20,.9)";
    c.lineWidth = Math.max(1.2, r * 0.05);
    c.lineCap = "round";
    c.beginPath(); c.arc(0, r * 0.14, r * 0.17, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    // 腮红
    c.fillStyle = "rgba(255,110,110,.32)";
    c.beginPath(); c.ellipse(-eyeDX - r * 0.17, eyeY + r * 0.17, r * 0.11, r * 0.07, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(eyeDX + r * 0.17, eyeY + r * 0.17, r * 0.11, r * 0.07, 0, 0, TAU); c.fill();
  }

  function drawFruitSprite(f, R) {
    var pad = R * 0.55 + 6;
    var half = R + pad;
    var cv = document.createElement("canvas");
    cv.width = half * 2 * SS;
    cv.height = half * 2 * SS;
    var c = cv.getContext("2d");
    c.scale(SS, SS);
    c.translate(half, half);

    // ---- 主体后方的茎叶装饰 ----
    if (f.crown) { // 菠萝叶冠
      c.fillStyle = "#3d9e4f";
      for (var i = -2; i <= 2; i++) {
        c.save();
        c.rotate(i * 0.42);
        c.beginPath();
        c.ellipse(0, -R * 0.95, R * 0.1, R * 0.3, 0, 0, TAU);
        c.fill();
        c.restore();
      }
    }
    if (f.stem) {
      c.strokeStyle = "#7a4a21";
      c.lineWidth = Math.max(2, R * 0.09);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(0, -R * 0.82);
      c.quadraticCurveTo(R * 0.16, -R * 1.12, R * 0.32, -R * 1.2);
      c.stroke();
    }
    if (f.leaf) {
      c.save();
      c.translate(R * 0.28, -R * 0.9);
      c.rotate(-0.5);
      c.fillStyle = f.leaf;
      c.beginPath();
      c.ellipse(0, 0, R * 0.3, R * 0.14, 0, 0, TAU);
      c.fill();
      c.restore();
    }

    // ---- 果体 ----
    var g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
    g.addColorStop(0, f.light);
    g.addColorStop(0.55, f.base);
    g.addColorStop(1, f.dark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.fill();

    // ---- 主体表面的装饰 ----
    if (f.stripes) { // 西瓜条纹
      c.save();
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
      c.strokeStyle = "rgba(28,100,42,.75)";
      c.lineWidth = R * 0.13;
      c.lineCap = "round";
      for (var s = -2; s <= 2; s++) {
        c.beginPath();
        c.moveTo(s * R * 0.42, -R);
        c.quadraticCurveTo(s * R * 0.78, 0, s * R * 0.42, R);
        c.stroke();
      }
      c.restore();
    }
    if (f.seeds) { // 草莓籽
      c.fillStyle = "rgba(255,244,180,.9)";
      var pts = [[-.5, -.35], [.32, -.52], [.58, -.08], [-.14, -.05], [.16, .38], [-.52, .28], [.48, .55], [-.3, .6]];
      for (var p = 0; p < pts.length; p++) {
        c.beginPath();
        c.ellipse(pts[p][0] * R, pts[p][1] * R, R * 0.055, R * 0.085, 0.4, 0, TAU);
        c.fill();
      }
    }
    if (f.lattice) { // 菠萝网格
      c.save();
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
      c.strokeStyle = "rgba(160,100,20,.38)";
      c.lineWidth = Math.max(1.2, R * 0.035);
      for (var k = -8; k <= 8; k++) {
        c.beginPath();
        c.moveTo(k * R * 0.25 - R, -R); c.lineTo(k * R * 0.25 + R, R);
        c.stroke();
        c.beginPath();
        c.moveTo(k * R * 0.25 + R, -R); c.lineTo(k * R * 0.25 - R, R);
        c.stroke();
      }
      c.restore();
    }
    if (f.husk) { // 椰子：边缘纤维 + 顶部三孔
      c.save();
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
      c.strokeStyle = "rgba(70,45,20,.28)";
      c.lineWidth = R * 0.04;
      c.lineCap = "round";
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * TAU;
        c.beginPath();
        c.moveTo(Math.cos(ang) * R * 0.82, Math.sin(ang) * R * 0.82);
        c.quadraticCurveTo(
          Math.cos(ang + 0.14) * R * 0.96, Math.sin(ang + 0.14) * R * 0.96,
          Math.cos(ang + 0.28) * R * 0.86, Math.sin(ang + 0.28) * R * 0.86
        );
        c.stroke();
      }
      c.restore();
      c.fillStyle = "rgba(60,38,18,.75)";
      var pores = [[-.22, -.55], [0, -.64], [.22, -.55]];
      for (var q = 0; q < pores.length; q++) {
        c.beginPath();
        c.ellipse(pores[q][0] * R, pores[q][1] * R, R * 0.055, R * 0.075, 0, 0, TAU);
        c.fill();
      }
    }

    // ---- 高光 + 脸 ----
    c.fillStyle = "rgba(255,255,255,.4)";
    c.beginPath();
    c.ellipse(-R * 0.38, -R * 0.42, R * 0.22, R * 0.13, -0.6, 0, TAU);
    c.fill();
    drawFace(c, R);

    return { canvas: cv, pad: pad, def: f };
  }

  var SPRITES = FRUITS.map(function (f) { return drawFruitSprite(f, f.r); });

  window.FRUITS = FRUITS;
  window.FRUIT_SPRITES = SPRITES;
  window.TIERS = FRUITS.length;
})();
