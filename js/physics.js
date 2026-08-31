/* 圆形刚体 2D 物理引擎（为零依赖合成玩法定制：冲量求解 + 位置修正） */
"use strict";

let Body = class Body {
  constructor(x, y, r, tier) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = r;
    this.tier = tier;
    this.angle = 0;
    this.av = 0; // 角速度
    this.mass = r * r;
    this.invM = 1 / this.mass;
    this.inertia = 0.5 * this.mass * r * r;
    this.invI = 1 / this.inertia;
    this.age = 0;    // 存活时间（用于判定"已落稳"）
    this.pop = 0;    // 合成出生时的缩放动画进度（1 → 0）
    this.dead = false;
    this.id = Body._id++;
  }
};
Body._id = 1;

let World = class World {
  constructor(minX, maxX, floorY) {
    this.minX = minX;
    this.maxX = maxX;
    this.floorY = floorY;
    this.gravity = 2200;
    this.restitution = 0.12;
    this.friction = 0.09;
    this.speedCap = 1600;
    this.bodies = [];
  }

  add(b) { this.bodies.push(b); return b; }

  step(dt) {
    const sub = 4, h = dt / sub;
    for (let s = 0; s < sub; s++) this.substep(h);
  }

  substep(h) {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      b.age += h;
      b.vy += this.gravity * h;
      b.vx *= 0.999; b.vy *= 0.999;
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > this.speedCap * this.speedCap) {
        const k = this.speedCap / Math.sqrt(sp);
        b.vx *= k; b.vy *= k;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.av * h;
      b.av *= 0.995;
    }
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          this.resolvePair(bs[i], bs[j]);
        }
      }
      for (let i = 0; i < bs.length; i++) this.resolveWalls(bs[i]);
    }
  }

  resolvePair(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const rs = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rs * rs) return;
    if (d2 === 0) { b.x += 0.01; return; }
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const overlap = rs - d;

    // 位置修正（分离重叠，防止堆叠下沉）
    const invSum = a.invM + b.invM;
    const corr = Math.max(overlap - 0.4, 0) * 0.5 / invSum;
    a.x -= nx * corr * a.invM; a.y -= ny * corr * a.invM;
    b.x += nx * corr * b.invM; b.y += ny * corr * b.invM;

    // 接触点（沿中心连线）
    const r1x = nx * a.r, r1y = ny * a.r;
    const r2x = -nx * b.r, r2y = -ny * b.r;

    // 接触点相对速度（含旋转分量）
    const v1x = a.vx - a.av * r1y, v1y = a.vy + a.av * r1x;
    const v2x = b.vx - b.av * r2y, v2y = b.vy + b.av * r2x;
    const rvx = v2x - v1x, rvy = v2y - v1y;
    const rvn = rvx * nx + rvy * ny;
    if (rvn >= 0) return;

    // 法向冲量
    const jn = -(1 + this.restitution) * rvn / invSum;
    let jx = jn * nx, jy = jn * ny;
    a.vx -= jx * a.invM; a.vy -= jy * a.invM;
    b.vx += jx * b.invM; b.vy += jy * b.invM;
    a.av -= a.invI * (r1x * jy - r1y * jx);
    b.av += b.invI * (r2x * jy - r2y * jx);

    // 切向摩擦冲量（产生滚动）
    const tx = -ny, ty = nx;
    const v1x2 = a.vx - a.av * r1y, v1y2 = a.vy + a.av * r1x;
    const v2x2 = b.vx - b.av * r2y, v2y2 = b.vy + b.av * r2x;
    const rvt = (v2x2 - v1x2) * tx + (v2y2 - v1y2) * ty;
    const denom = invSum + (r1x * r1x + r1y * r1y) * a.invI + (r2x * r2x + r2y * r2y) * b.invI;
    let jt = -rvt / denom;
    const maxF = this.friction * jn;
    if (jt > maxF) jt = maxF; else if (jt < -maxF) jt = -maxF;
    jx = jt * tx; jy = jt * ty;
    a.vx -= jx * a.invM; a.vy -= jy * a.invM;
    b.vx += jx * b.invM; b.vy += jy * b.invM;
    a.av -= a.invI * (r1x * jy - r1y * jx);
    b.av += b.invI * (r2x * jy - r2y * jx);
  }

  resolveWalls(b) {
    if (b.x - b.r < this.minX) {
      b.x = this.minX + b.r;
      if (b.vx < 0) b.vx *= -this.restitution;
      b.av *= 0.98;
    } else if (b.x + b.r > this.maxX) {
      b.x = this.maxX - b.r;
      if (b.vx > 0) b.vx *= -this.restitution;
      b.av *= 0.98;
    }
    if (b.y + b.r > this.floorY) {
      b.y = this.floorY - b.r;
      if (b.vy > 0) b.vy *= -this.restitution;
      b.vx *= 0.985; // 地面摩擦
      b.av *= 0.96;
    }
  }
};
