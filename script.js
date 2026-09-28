// ==========================================================================
// script.js: the page's interactive logic
// --------------------------------------------------------------------------
// Unpacked from the original single-file bundle, code unchanged.
//
// This is not a normal <script>. The page is a "Design Component" rendered by
// js/dc-runtime.js (a small React-based runtime from the design tool it was
// exported from). The runtime reads this code as the text of the
// <script type="text/x-dc" data-dc-script> tag in index.html. It expects a
// `class Component extends DCLogic`, whose state and methods fill the
// {{ ... }} placeholders in the HTML template. index.html loads this file
// into that tag before starting the runtime.
//
// Files this code loads at runtime (paths relative to index.html):
//   data/embedding.json      data points for the interactive map in the hero
//   uploads/jupy-theme.png   screen image drawn on the canvas
//   assets/fig01..04-*.png   images on the "Four ways in" cards
//   assets/projects/*.png    images on the Projects cards
// ==========================================================================

const TYPES = [
  { k: 'project', hi: '#56b4e9', lo: '#a8d8f0', ring: '#1c96db', r: 5.5 },
  { k: 'tool', hi: '#6b6b6b', lo: '#c9ccd1', ring: '#6b6b6b', r: 4.2 },
  { k: 'dataset', hi: '#e69f00', lo: '#f4ce8e', ring: '#be8300', r: 4.6 },
  { k: 'experience', hi: '#009e73', lo: '#8fd6be', ring: '#009e73', r: 5.5 },
  { k: 'publication', hi: '#cc79a7', lo: '#e3b4ce', ring: '#c972a3', r: 5.5 },
  { k: 'paper', hi: '#f0e442', lo: '#f5efa8', ring: '#9b910c', r: 5.5 },
  { k: 'workshop', hi: '#0072b2', lo: '#9bbedc', ring: '#0072b2', r: 4.8 },
  { k: 'award', hi: '#d55e00', lo: '#f0b08a', ring: '#d55e00', r: 5.5 },
  { k: 'course', hi: '#a3f5b9', lo: '#aeeabe', ring: '#12a539', r: 5.5 }
];
const TI = {};
TYPES.forEach((t, i) => { TI[t.k] = i; });

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
function ss(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function hx(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mixv(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgb(c, al) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (al === undefined ? 1 : al) + ')'; }

const PAPER = hx('#f7f6f1');
const DARK = hx('#121316');

const PHASES = [[0, 0.16, 6.2, 6.2], [0.16, 0.34, 6.2, 5.4], [0.34, 0.52, 5.4, 4.1], [0.52, 0.68, 4.1, 2.6], [0.68, 0.9, 2.6, 0.32], [0.9, 1.01, 0.32, 0.32]];
function camZ(p) {
  for (const ph of PHASES) if (p < ph[1]) return lerp(ph[2], ph[3], clamp((p - ph[0]) / (ph[1] - ph[0]), 0, 1));
  return 0.32;
}

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { items: [], hidden: {}, unverified: false };
    ['cvRef', 'stageRef', 'wrapRef', 'navRef', 'markRef', 'statusRef', 'cueRef', 'capRef', 'tipRef', 'scanRef', 'skipRef', 'unvRef', 'miniRef'].forEach((k) => { this[k] = React.createRef(); });
    this.p = 0;
    this.live = true;
    this.proj = [];
    this.hover = -1;
  }

  componentDidMount() {
    window.addEventListener('error', (e) => {
      window.__lastErr = e.message ? e.message + ' @ ' + e.filename + ':' + e.lineno : 'resource: ' + ((e.target && (e.target.src || e.target.href)) || 'unknown');
    }, true);
    const im = new Image();
    im.onload = () => { this.screenImg = im; };
    const R = (window.__resources || {});
    im.src = R.screenImg || 'uploads/jupy-theme.png';

    const resumeUrl = R.resume;
    if (resumeUrl) {
      document.querySelectorAll('a[href$="anabella-phelps-resume-2026.pdf"]').forEach((a) => { a.href = resumeUrl; });
    }

    fetch(R.embedding || 'data/embedding.json').then((r) => r.json()).then((d) => {
      const pub = this.props.publicBuild === true;
      const items = (d.items || []).filter((it) => !(pub && it.embargoed));
      this.setState({ items: items, totalInventory: d.total_inventory, embeddedCount: d.embedded_count }, () => this.build());
    }).catch(() => { this.setState({ items: [] }); });

    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    if (window.ResizeObserver && this.stageRef.current) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.stageRef.current);
    }
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.t0 = performance.now();
    // one frame: read the cached rect, never do work in the scroll listener
    this.frame = (now) => {
      const st = this.stageRef.current;
      if (st && (st.clientWidth !== this.W || st.clientHeight !== this.H)) this.resize();
      const w = this.wrapRef.current;
      if (w) {
        const r = w.getBoundingClientRect();
        this.p = clamp(-r.top / (r.height - window.innerHeight), 0, 1);
        // visibility from the rect we already have — an IntersectionObserver
        // can latch false against a node replaced by a later render
        this.live = r.bottom > 0 && r.top < window.innerHeight;
      }
      if (this.reduced) this.p = 1;
      if (this.live) this.draw(this.reduced ? 0 : (now - this.t0) / 1000);
    };
    this.tick = (now) => {
      this.raf = requestAnimationFrame(this.tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(this.tick);
    // rAF is suspended while the document is hidden (background tab, offscreen
    // preview), which would freeze the stage mid-sequence. Scroll then drives it.
    this.onScroll = () => { if (document.hidden) this.frame(performance.now()); };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('visibilitychange', this.onScroll);
  }
  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onScroll);
    document.removeEventListener('visibilitychange', this.onScroll);
    if (this.ro) this.ro.disconnect();
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevState.hidden !== this.state.hidden) this.build();
  }

  // three position buffers, written once: helix, stream, and the real UMAP coords
  build() {
    const hidden = this.state.hidden;
    const rows = this.state.items.filter((it) => !hidden[it.type]);
    this.rows = rows;
    this.n = rows.length;
    if (!this.n) return;
    const n = this.n;
    this.A = new Float32Array(n * 3);
    this.B = new Float32Array(n * 3);
    this.C = new Float32Array(n * 3);
    const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
    const cxm = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
    const cym = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    const span = Math.max(Math.max.apply(null, ys) - Math.min.apply(null, ys), (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 1.7) / 2;
    const k = 0.075 / Math.max(0.001, span);
    const rnd = mulberry32(42);
    const hover = [0, 1.34, -0.34];
    for (let i = 0; i < n; i++) {
      const strand = i % 2;
      const u = Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1);
      const ang = u * Math.PI * 3.6 + strand * Math.PI;
      const rr = 1.02 + (rnd() - 0.5) * 0.06;
      const ax = rr * Math.cos(ang), ay = lerp(-1.42, 1.42, u), az = rr * Math.sin(ang);
      this.A[i * 3] = ax; this.A[i * 3 + 1] = ay; this.A[i * 3 + 2] = az;
      const s = 0.3 + rnd() * 0.7, m = 1 - s;
      const c = [ax * 0.4, 1.6 + rnd() * 0.4, 0.32];
      this.B[i * 3] = m * m * ax + 2 * m * s * c[0] + s * s * hover[0] + (rnd() - 0.5) * 0.62;
      this.B[i * 3 + 1] = m * m * ay + 2 * m * s * c[1] + s * s * hover[1] + (rnd() - 0.5) * 0.3;
      this.B[i * 3 + 2] = m * m * az + 2 * m * s * c[2] + s * s * hover[2] + (rnd() - 0.5) * 0.5;
      this.C[i * 3] = (rows[i].x - cxm) * k;
      this.C[i * 3 + 1] = -(rows[i].y - cym) * k;
      this.C[i * 3 + 2] = 0;
    }
  }

  resize() {
    const cv = this.cvRef.current, st = this.stageRef.current;
    if (!cv || !st) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(st.clientWidth * dpr); cv.height = Math.round(st.clientHeight * dpr);
    this.W = st.clientWidth; this.H = st.clientHeight; this.dpr = dpr;
    this.ctx = cv.getContext('2d');
    const mc = this.miniRef.current;
    if (mc) {
      this.miniW = mc.clientWidth; this.miniH = mc.clientHeight;
      if (this.miniW && this.miniH) {
        mc.width = Math.round(this.miniW * dpr); mc.height = Math.round(this.miniH * dpr);
      }
    }
  }

  onMove = (e) => {
    const cv = this.cvRef.current; if (!cv) return;
    const b = cv.getBoundingClientRect();
    const mx = e.clientX - b.left, my = e.clientY - b.top;
    let best = null, bd = 24 * 24;
    for (const q of this.proj) {
      const dx = q.x - mx, dy = q.y - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = q; }
    }
    const tip = this.tipRef.current;
    if (tip) {
      if (best) {
        const it = best.it;
        const t = TYPES[TI[it.type] === undefined ? 0 : TI[it.type]];
        const stg = it.stage && it.stage !== 'done' ? '<span style="display:block;color:#8a9099;font-family:\'IBM Plex Mono\',monospace;font-size:12.6px;margin-top:2px">' + it.stage + '</span>' : '';
        tip.innerHTML = '<span style="font-family:\'IBM Plex Mono\',monospace;text-transform:uppercase;font-size:12.6px;color:' + t.hi + ';display:block;margin-bottom:2px">' + it.type + '</span>'
          + '<span style="color:#eceef2;font-weight:600">' + it.label + '</span>' + stg;
        tip.style.left = best.x + 'px'; tip.style.top = best.y + 'px'; tip.style.opacity = '1';
      } else tip.style.opacity = '0';
    }
    this.hover = best ? best.i : -1;
  };
  onLeave = () => { this.hover = -1; const t = this.tipRef.current; if (t) t.style.opacity = '0'; };
  skip = () => {
    const w = this.wrapRef.current; if (!w) return;
    window.scrollTo({ top: w.offsetTop + w.offsetHeight - window.innerHeight, behavior: 'smooth' });
  };

  draw(time) {
    try { this.drawFrame(time); } catch (e) {
      console.error('draw', e && (e.stack || e.message));
      cancelAnimationFrame(this.raf); this.raf = 0;
    }
  }

  drawFrame(time) {
    const ctx = this.ctx; if (!ctx) return;
    const p = this.p, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const gT = ss(0.72, 0.86, p);
    const ground = mixv(PAPER, DARK, gT);
    const chroma = 0.24 + 0.76 * gT;
    const z = camZ(p);
    const f = 1.4535 * H;
    const t1 = ss(0.16, 0.44, p);
    const cx = W / 2, cy = H * (0.5 + 0.22 * (1 - t1));
    const tLand = ss(0.60, 0.82, p);
    const tFlat = ss(0.84, 1.0, p);
    const t2 = tFlat;
    const drain = 1 - ss(0.9, 1.0, p);
    const spin = (this.reduced ? 0 : time * 0.28) * (1 - t1);
    const lid = ss(0.34, 0.60, p);
    const lidA = -(1 - Math.pow(1 - lid, 3)) * 1.83;
    const lca = Math.cos(lidA), lsa = Math.sin(lidA);
    const lapA = ss(0.26, 0.42, p) * (1 - ss(0.8, 0.9, p));
    const fade = 1 - 0.62 * (ss(0.42, 0.62, p) - ss(0.66, 0.8, p));

    ctx.fillStyle = rgb(ground); ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(mixv(ground, [255, 255, 255], gT > 0.5 ? 0.03 : 0.5), gT > 0.5 ? 0.1 : 0.3));
    g.addColorStop(1, rgb(mixv(ground, DARK, 0.35), 0.16));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const cos = Math.cos(spin), sin = Math.sin(spin);
    const yOff = lerp(0.12, 0.58, ss(0.2, 0.5, p)) * (1 - ss(0.68, 0.94, p));
    const P = (x, y, zz) => {
      const d = z - zz;
      if (d < 0.04) return null;
      return { x: cx + (x * f) / d, y: cy - ((y - yOff) * f) / d, s: f / d, d: d };
    };

    if (lapA > 0.01) this.laptop(ctx, P, lidA, lapA, ground, gT, p, false);

    const pts = [];
    if (this.n) {
      for (let i = 0; i < this.n; i++) {
        const ax = this.A[i * 3], ay = this.A[i * 3 + 1], az = this.A[i * 3 + 2];
        const rx = ax * cos + az * sin, rz = -ax * sin + az * cos;
        let x = lerp(rx, this.B[i * 3], t1), y = lerp(ay, this.B[i * 3 + 1], t1), zz = lerp(rz, this.B[i * 3 + 2], t1);
        // idle bob while the cloud waits for the lid
        const holdA = t1 * (1 - tLand);
        if (holdA > 0.01 && !this.reduced) y += Math.sin(time * 0.9 + i * 0.7) * 0.045 * holdA;
        if (tLand > 0.001) {
          const u = this.C[i * 3] / 0.075, vv = clamp(this.C[i * 3 + 1] / 0.075 * 0.5 + 0.5, 0, 1);
          const vL = 0.1 + 0.8 * vv;
          x = lerp(x, u * 0.6, tLand);
          y = lerp(y, -vL * lsa * 1.42, tLand);
          zz = lerp(zz, -0.58 + vL * lca * 1.42, tLand);
        }
        x = lerp(x, this.C[i * 3], tFlat); y = lerp(y, this.C[i * 3 + 1], tFlat); zz = lerp(zz, 0, tFlat) * drain;
        const q = P(x, y, zz);
        if (q) { q.i = i; q.it = this.rows[i]; pts.push(q); }
      }
    }
    pts.sort((a, b) => b.d - a.d);
    this.proj = pts;

    const sa = 0.2 * (1 - ss(0.16, 0.34, p));
    if (sa > 0.005 && pts.length) {
      const byI = [];
      for (const q of pts) byI[q.i] = q;
      for (let s = 0; s < 2; s++) {
        ctx.beginPath();
        let started = false;
        for (let i = s; i < this.n; i += 2) {
          const q = byI[i]; if (!q) continue;
          if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = rgb(mixv(ground, DARK, 1 - gT * 0.9), sa);
        ctx.lineWidth = 1; ctx.stroke();
      }
    }

    const fogAmt = 1 - t2 * 0.85;
    for (const q of pts) {
      const t = TYPES[TI[q.it.type] === undefined ? 0 : TI[q.it.type]];
      const scale = Math.pow(q.s / 253, 0.42);
      let rad = t.r * 0.95 * scale;
      const fog = clamp((q.d - (z - 1.7)) / 3.6, 0, 1) * fogAmt * (0.34 + 0.5 * gT);
      let fill = mixv(mixv(hx(t.lo), hx(t.hi), chroma), ground, fog);
      let ringC = mixv(mixv(hx(t.ring), hx(t.hi), chroma), ground, fog * 0.6);
      if (this.hover === q.i) { fill = hx('#f2b65a'); ringC = hx(gT > 0.5 ? '#f2b65a' : '#9b6617'); rad *= 1.5; }
      const stage = q.it.stage || 'done';
      const a0 = fade * (0.72 + 0.28 * (1 - fog));
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(0.7, rad), 0, 6.2832);
      if (stage !== 'planned') { ctx.fillStyle = rgb(fill, a0 * (stage === 'in-progress' ? 0.55 : 1)); ctx.fill(); }
      if (stage !== 'done' || gT < 0.85) {
        ctx.strokeStyle = rgb(ringC, a0 * (stage === 'done' ? 0.85 * (1 - gT) : 1));
        ctx.lineWidth = 1; ctx.stroke();
      }
      if (rad > 4) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, rad * 2.4, 0, 6.2832);
        ctx.fillStyle = rgb(fill, 0.05 * fade * (gT * 0.8 + 0.2));
        ctx.fill();
      }
    }

    if (lapA > 0.01) this.laptop(ctx, P, lidA, lapA, ground, gT, p, true);
    this.mini(time);
    this.overlays(p, gT);
  }

  // the bottom-left monitor: the settled map, always dark, always moving
  mini(time) {
    const cv = this.miniRef.current; if (!cv || !this.n) return;
    const dpr = this.dpr || 1;
    const w = this.miniW, h = this.miniH;
    if (!w || !h) return;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, w, h);
    const gg = c.createLinearGradient(0, 0, 0, h);
    gg.addColorStop(0, 'rgba(143,168,232,.10)');
    gg.addColorStop(1, 'rgba(47,209,165,.05)');
    c.fillStyle = gg; c.fillRect(0, 0, w, h);
    // slow orbit + breathing zoom, so the panel never reads as a still
    const a = time * 0.16, zoom = 1 + 0.07 * Math.sin(time * 0.35);
    const k = Math.min(w, h) * 4.6 * zoom;
    const cxm = w / 2 + Math.sin(time * 0.22) * w * 0.035;
    const cym = h / 2 + Math.cos(time * 0.19) * h * 0.05;
    const cs = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < this.n; i++) {
      const x = this.C[i * 3], y = this.C[i * 3 + 1];
      const rx = x * cs - y * sn, ry = (x * sn + y * cs) * 0.62;
      const t = TYPES[TI[this.rows[i].type] === undefined ? 0 : TI[this.rows[i].type]];
      const px = cxm + rx * k, py = cym + ry * k;
      if (px < -6 || px > w + 6 || py < -6 || py > h + 6) continue;
      const stage = this.rows[i].stage || 'done';
      const rad = Math.max(0.9, t.r * 0.26 * zoom);
      c.beginPath(); c.arc(px, py, rad, 0, 6.2832);
      if (stage !== 'planned') { c.fillStyle = t.hi; c.globalAlpha = stage === 'in-progress' ? 0.55 : 0.9; c.fill(); }
      c.globalAlpha = 0.9; c.lineWidth = 0.7; c.strokeStyle = t.ring; c.stroke();
      c.globalAlpha = 1;
    }
    // sweep, so there is motion even where the cloud is sparse
    const sx = ((time * 0.14) % 1.6 - 0.3) * w;
    const sg = c.createLinearGradient(sx, 0, sx + w * 0.3, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,.05)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(0, 0, w, h);
  }

  quad(ctx, a, b, c, d, fill, stroke) {
    if (!a || !b || !c || !d) return;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  alu(k, gT) { return rgb(mixv([54, 57, 62], [240, 242, 245], clamp(k * (1 - 0.46 * gT), 0, 1))); }

  // perspective-map an image onto a quad by subdividing into affine cells
  imgQuad(ctx, img, s, cols, rows) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cw = iw / cols, chh = ih / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const A = s(i / cols, 1 - j / rows), B = s((i + 1) / cols, 1 - j / rows), D = s(i / cols, 1 - (j + 1) / rows);
        if (!A || !B || !D) continue;
        const sx = i * cw, sy = j * chh;
        const e1x = (B.x - A.x) / cw, e1y = (B.y - A.y) / cw;
        const e2x = (D.x - A.x) / chh, e2y = (D.y - A.y) / chh;
        ctx.save();
        ctx.transform(e1x, e1y, e2x, e2y, A.x - e1x * sx - e2x * sy, A.y - e1y * sx - e2y * sy);
        ctx.drawImage(img, sx, sy, cw, chh, sx - 0.4, sy - 0.4, cw + 0.8, chh + 0.8);
        ctx.restore();
      }
    }
  }

  laptop(ctx, P, lidA, al, ground, gT, p, lidPass) {
    const HW = 1.2, ZF = 0.62, ZB = -0.58, TH = 0.075;
    ctx.save();
    ctx.globalAlpha = al;

    if (!lidPass) {
      const s0 = P(-HW * 1.08, -0.055, ZB - 0.1), s1 = P(HW * 1.08, -0.055, ZB - 0.1), s2 = P(HW * 1.22, -0.055, ZF + 0.22), s3 = P(-HW * 1.22, -0.055, ZF + 0.22);
      if (s0 && s1 && s2 && s3) {
        // flat contact shadow: two stacked quads, no filter and no gradient
        this.quad(ctx, s0, s1, s2, s3, rgb(mixv(ground, [0, 0, 0], 0.62), 0.18));
        this.quad(ctx, P(-HW, -0.008, ZB), P(HW, -0.008, ZB), P(HW, -0.008, ZF), P(-HW, -0.008, ZF), rgb(mixv(ground, [0, 0, 0], 0.7), 0.34));
      }
      const a = P(-HW, 0, ZB), b = P(HW, 0, ZB), c = P(HW, 0, ZF), d = P(-HW, 0, ZF);
      if (a && b && c && d) {
        const gg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        gg.addColorStop(0, this.alu(0.52, gT));
        gg.addColorStop(0.34, this.alu(0.88, gT));
        gg.addColorStop(0.62, this.alu(0.7, gT));
        gg.addColorStop(1, this.alu(0.44, gT));
        this.quad(ctx, a, b, c, d, gg);
        const fe = P(HW, -TH, ZF), ff = P(-HW, -TH, ZF), le = P(-HW, -TH, ZB), re = P(HW, -TH, ZB);
        this.quad(ctx, d, c, fe, ff, this.alu(0.3, gT));
        this.quad(ctx, a, d, ff, le, this.alu(0.22, gT));
        this.quad(ctx, b, c, fe, re, this.alu(0.26, gT));
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y);
        ctx.strokeStyle = this.alu(1, gT); ctx.lineWidth = 1.5; ctx.stroke();
        const kw = (u, zz) => P(u * 1.03, 0.001, zz);
        this.quad(ctx, kw(-1, -0.46), kw(1, -0.46), kw(1, 0.15), kw(-1, 0.15), this.alu(0.4, gT));
        const KC = 14, KR = 6;
        for (let r = 0; r < KR; r++) {
          for (let cI = 0; cI < KC; cI++) {
            const z0 = lerp(-0.44, 0.13, r / KR) + 0.014, z1 = lerp(-0.44, 0.13, (r + 1) / KR) - 0.014;
            const x0 = lerp(-1, 1, cI / KC) + 0.014, x1 = lerp(-1, 1, (cI + 1) / KC) - 0.014;
            this.quad(ctx, P(x0, 0.004, z0), P(x1, 0.004, z0), P(x1, 0.004, z1), P(x0, 0.004, z1), rgb(mixv([16, 17, 20], [46, 49, 54], 0.35 + 0.4 * (r / KR)), 0.95));
          }
        }
        this.quad(ctx, P(-0.4, 0.002, 0.24), P(0.4, 0.002, 0.24), P(0.4, 0.002, 0.56), P(-0.4, 0.002, 0.56), this.alu(0.62, gT), 'rgba(128,128,128,.35)');
      }
      ctx.restore();
      return;
    }

    const ca = Math.cos(lidA), sa = Math.sin(lidA), L = 1.42;
    const lp = (u, v) => P(u * HW, -v * sa * L, ZB + v * ca * L);
    const a = lp(-1, 0), b = lp(1, 0), c = lp(1, 1), d = lp(-1, 1);
    if (a && b && c && d) {
      this.quad(ctx, a, b, c, d, rgb([13, 14, 17], 1));
      const bez = 0.045;
      const s = (u, v) => lp(lerp(-1 + bez, 1 - bez, u), lerp(0.055, 0.945, v));
      const q0 = s(0, 0), q1 = s(1, 0), q2 = s(1, 1), q3 = s(0, 1);
      const wake = ss(0.46, 0.6, p);
      this.quad(ctx, q0, q1, q2, q3, rgb(mixv([8, 9, 11], [17, 20, 26], wake), 1));
      if (this.screenImg && wake > 0.01) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.closePath(); ctx.clip();
        ctx.globalAlpha = al * wake;
        this.imgQuad(ctx, this.screenImg, s, 12, 9);
        ctx.restore();
        ctx.globalAlpha = al;
      }
      const gl = ctx.createLinearGradient(q3.x, q3.y, q1.x, q1.y);
      gl.addColorStop(0, 'rgba(255,255,255,.13)');
      gl.addColorStop(0.4, 'rgba(255,255,255,.02)');
      gl.addColorStop(0.72, 'rgba(255,255,255,.09)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      this.quad(ctx, q0, q1, q2, q3, gl);
      const sh = ctx.createLinearGradient(q0.x, q0.y, q3.x, q3.y);
      sh.addColorStop(0, 'rgba(0,0,0,.5)');
      sh.addColorStop(0.22, 'rgba(0,0,0,0)');
      this.quad(ctx, q0, q1, q2, q3, sh);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.strokeStyle = this.alu(0.8, gT); ctx.lineWidth = 2; ctx.stroke();
      const cam = lp(0, 0.978);
      if (cam) { ctx.beginPath(); ctx.arc(cam.x, cam.y, Math.max(0.8, 0.9 * (cam.s / 300)), 0, 6.2832); ctx.fillStyle = 'rgba(120,128,140,.9)'; ctx.fill(); }
      if (wake > 0.05) {
        const spill = ctx.createLinearGradient(a.x, a.y, d.x, d.y);
        spill.addColorStop(0, 'rgba(150,180,255,.14)');
        spill.addColorStop(1, 'rgba(150,180,255,0)');
        ctx.globalAlpha = al * wake * 0.7;
        this.quad(ctx, a, b, c, d, spill);
        ctx.globalAlpha = al;
      }
    }
    ctx.restore();
  }

  // the nav and hero type read live --stage-* equivalents as the ground crossfades
  setStyle(el, prop, val, key) {
    if (!el) return;
    const c = this._ov || (this._ov = {});
    if (c[key] === val) return;
    c[key] = val;
    if (prop.charAt(0) === '-') el.style.setProperty(prop, val); else el.style[prop] = val;
  }

  overlays(p, gT) {
    const dark = gT > 0.5;
    const ink = dark ? '#eceef2' : '#16181c';
    const muted = dark ? '#8a9099' : '#6b727b';
    const shift = -Math.round(ss(0.16, 0.62, p) * (this.H || 800) * 0.62);
    const mark = this.markRef.current;
    const op = (v) => (Math.round(v * 100) / 100).toString();
    this.setStyle(mark, 'opacity', op((1 - 0.6 * ss(0.16, 0.34, p)) * (1 - ss(0.5, 0.66, p))), 'mo');
    this.setStyle(mark, 'transform', 'translate3d(0,' + shift + 'px,0)', 'mt');
    this.setStyle(mark, 'color', ink, 'mc');
    const set = (el, o, col, key) => {
      this.setStyle(el, 'opacity', op(o), key + 'o');
      if (col) this.setStyle(el, 'color', col, key + 'c');
    };
    set(this.statusRef.current, 1 - ss(0.18, 0.32, p), muted, 'st');
    set(this.cueRef.current, 1 - ss(0.03, 0.14, p), ink, 'cu');
    set(this.capRef.current, ss(0.9, 1.0, p), null, 'cp');
    const sig = dark ? '#2fd1a5' : '#0e8063';
    const skip = this.skipRef.current;
    this.setStyle(skip, 'color', sig, 'sk');
    this.setStyle(skip, 'borderColor', sig, 'skb');
    this.setStyle(this.scanRef.current, 'mixBlendMode', dark ? 'screen' : 'multiply', 'sc');
    const nav = this.navRef.current;
    this.setStyle(nav, 'color', ink, 'nc');
    this.setStyle(nav, 'background', dark ? 'rgba(18,19,22,.82)' : 'rgba(247,246,241,.82)', 'nb');
    this.setStyle(nav, 'borderBottomColor', dark ? '#2a2e35' : '#d9d7cd', 'nbc');
    this.setStyle(nav, '--sig', sig, 'ns');
    this.setStyle(nav, '--mut', muted, 'nm');
    this.setStyle(nav, '--ink', ink, 'ni');
  }

  renderVals() {
    const items = this.state.items;
    const hidden = this.state.hidden;
    const counts = {};
    items.forEach((it) => { counts[it.type] = (counts[it.type] || 0) + 1; });
    const legend = TYPES.filter((t) => counts[t.k]).map((t) => ({
      k: t.k, hi: t.hi, lo: t.lo, ring: t.ring, r: t.r, n: counts[t.k] || 0,
      border: hidden[t.k] ? '#3b414a' : '#eceef2',
      fg: hidden[t.k] ? '#8a9099' : '#eceef2',
      op: hidden[t.k] ? 0.45 : 1,
      toggle: () => this.setState((s) => {
        const h = Object.assign({}, s.hidden);
        if (h[t.k]) delete h[t.k]; else h[t.k] = true;
        return { hidden: h };
      })
    }));
    const shown = items.filter((it) => !hidden[it.type]).length;
    const unv = this.state.unverified;
    return {
      cvRef: this.cvRef, stageRef: this.stageRef, wrapRef: this.wrapRef, navRef: this.navRef,
      markRef: this.markRef, statusRef: this.statusRef, cueRef: this.cueRef, capRef: this.capRef,
      tipRef: this.tipRef, scanRef: this.scanRef, skipRef: this.skipRef, unvRef: this.unvRef,
      miniRef: this.miniRef,
      onMove: this.onMove, onLeave: this.onLeave, skip: this.skip,
      items: items, legend: legend,
      shownCount: shown || this.state.embeddedCount || 72,
      totalCount: this.state.totalInventory || 133,
      typeCount: legend.length || 8,
      unverifiedLabel: unv ? 'hide unverified claims' : 'show unverified claims',
      unvBorder: unv ? '#f2b65a' : '#3b414a',
      unvColor: unv ? '#f2b65a' : '#8a9099',
      toggleUnverified: () => {
        this.setState((s) => ({ unverified: !s.unverified }), () => {
          const el = this.unvRef.current;
          if (el) el.style.background = this.state.unverified ? 'rgba(242,182,90,.16)' : 'transparent';
        });
      },
      facts: [
        { k: 'Institution', v: 'Carnegie Mellon University' },
        { k: 'Lab', v: 'Bruno Lab · UPMC Hillman' },
        { k: 'Focus', v: 'Computational Biology' },
        { k: 'Current Project', v: '9 public PDAC dataset Atlas' },
        { k: 'Contact', v: 'afphelps@andrew.cmu.edu' }
      ],
      cards: [
        { href: '#research', slot: 'Fig 01', img: (window.__resources && window.__resources.fig01) || 'assets/fig01-umap.png', ph: 'UMAP export', title: 'Research', body: 'Single-cell and spatial analysis of the tumor-immune microenvironment in the Bruno Lab at UPMC Hillman — a 9-dataset PDAC atlas, plus tertiary lymphoid structure work in lung and ovarian cancer.' },
        { href: '#projects', slot: 'Fig 02', img: (window.__resources && window.__resources.fig02) || 'assets/fig02-tls.png', ph: 'TLS Builder capture', title: 'Projects', body: 'TLS Builder, a simulation game modelling tertiary lymphoid structure development from spatial rules; a TartanHacks financial analytics platform; a K-5 AI literacy curriculum for the CREATE Lab.' },
        { href: '#teaching', slot: 'Fig 03', img: (window.__resources && window.__resources.fig03) || 'assets/fig03-lab.png', ph: 'Teaching photo', title: 'Leadership', body: 'TA for 15-112 Fundamentals of Programming and Computer Science at Carnegie Mellon, and student mentor through the Hillman Cancer Academy.' },
        { href: '#publications', slot: 'Fig 04', img: (window.__resources && window.__resources.fig04) || 'assets/fig04-poster.png', ph: 'Poster photo', title: 'Publications', body: 'First-author abstract and poster on CD200 in ovarian cancer, a co-authored abstract on memory B cells, and conference presentations.' }
      ],
      // GitHub projects, shown as cards in the #projects section of index.html
      projects: [
        { slot: 'Proj 01', img: 'assets/projects/seq2find.png', ph: 'Seq2Find search interface', title: 'Seq2Find', body: 'AI-ranked GEO dataset search. Describe the study you need (assay, organism, tissue, conditions) and get a short ranked list of GEO series with download links. It queries NCBI live, then a language model judges each candidate against the whole request.', stack: 'FastAPI · PostgreSQL · OpenAI · NCBI E-utilities', links: [
          { label: 'Live site', href: 'https://afphelps-wq.github.io/seq2find-frontend/' },
          { label: 'Frontend', href: 'https://github.com/afphelps-wq/seq2find-frontend' },
          { label: 'Backend', href: 'https://github.com/afphelps-wq/HW4_Backend' }
        ] },
        { slot: 'Proj 02', img: 'assets/projects/lane-hopper.png', ph: 'Lane Hopper title screen', title: 'Lane Hopper', body: 'An original low-poly endless lane-crossing game in the spirit of Crossy Road. Procedurally generated roads, rivers and railroads, coins that unlock four animated characters, and original sound and music.', stack: 'JavaScript · Three.js · Vite', links: [
          { label: 'Play', href: 'https://afphelps-wq.github.io/crossy-road/' },
          { label: 'Code', href: 'https://github.com/afphelps-wq/crossy-road' }
        ] },
        { slot: 'Proj 03', img: 'assets/projects/bulk-rnaseq.png', ph: 'Bulk RNA-seq Explorer interface', title: 'Bulk RNA-seq Explorer', body: 'Upload a count matrix, compare two groups of samples, and get differential expression, a volcano plot and pathway enrichment, plus a summary of the strongest genes grounded in PubMed abstracts. Built for 15-113.', stack: 'Python · Flask · g:Profiler · PubMed · OpenAI', links: [
          { label: 'Code', href: 'https://github.com/afphelps-wq/15113-api-project' }
        ] }
      ]
    };
  }
}
