/**
 * Purely visual effects in world pixel space: particles (ink splashes, eraser
 * crumbs, embers, paper flakes), expanding rings and floating text.
 */
export class Effects {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
  }

  clear() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
  }

  /**
   * Spray `n` particles from (x,y).
   * @param {object} o {color, speed, life, size, gravity, kind:'dot'|'crumb'|'ember'|'flake'|'drop', up}
   */
  burst(x, y, n, o = {}) {
    const speed = o.speed ?? 60;
    for (let k = 0; k < n && this.parts.length < 400; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.parts.push({
        x: x + (Math.random() - 0.5) * (o.spread ?? 6),
        y: y + (Math.random() - 0.5) * (o.spread ?? 6),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (o.up ?? 0),
        life,
        max: life,
        size: (o.size ?? 2.5) * (0.6 + Math.random() * 0.8),
        color: o.color ?? '#1d1915',
        g: o.gravity ?? 0,
        kind: o.kind ?? 'dot',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  ring(x, y, color, radius = 30, life = 0.6, width = 3) {
    this.rings.push({ x, y, color, radius, life, max: life, width });
  }

  text(x, y, str, color = '#1d1915', size = 15) {
    this.texts.push({ x, y, str, color, size, life: 1.3, max: 1.3 });
  }

  update(dt) {
    const drag = Math.exp(-dt * 3);
    for (const p of this.parts) {
      p.life -= dt;
      p.vx *= drag;
      p.vy = p.vy * drag + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 22;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx) {
    for (const p of this.parts) {
      const a = Math.min(1, p.life / p.max * 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'crumb' || p.kind === 'flake') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else if (p.kind === 'ember') {
        ctx.fillStyle = a > 0.5 ? '#ffcf6a' : '#e0622a';
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.2 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
      ctx.font = `bold ${t.size}px "Segoe Print", "Bradley Hand", casual, cursive`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(240,228,198,0.95)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
