// The house heard through a day. Everything is synthesised, nothing is downloaded:
//  - always: wind, the bamboo, the stream into the pond, the tsukubai dripping, a shishi-odoshi somewhere by the water;
//  - by hour and season: a bush warbler at dawn in spring, sparrows and bulbuls, cicadas through a summer day,
//    higurashi at dusk, bell crickets at night;
//  - inside: the kettle's "wind in the pines", charcoal ticking, and the corridors' nightingale floors under your feet;
//  - a temple bell far off at sunrise and at sunset.
// Indoors the garden is heard through the walls (lowpassed); sources pan with where they are relative to the view.
import { clamp, smoothstep } from '../lib/math.js';
import { ROOMS } from '../house/house.js';

function noiseBuffer(ctx, sec, pink) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return b;
}

function impulse(ctx, sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 300 ? i / 300 : 1);
  }
  return b;
}

// where things are, in the garden's metres
const AT = {
  stream: [[-2.6, -4.6], [-2.75, 0.0], [-3.0, 2.6], [-3.3, 4.0]],
  pond: [-1.0, 8.0],
  tsukubai: [-3.15, -4.05],
  roji: [-17.9, 10.2],
  shishi: [-4.4, 4.6],
  tea: [-6.37, -0.91],
  hearth: [2.275, -1.82],
  bath: [15.0, -5.0],
};
const CORRIDORS = ['irigawa', 'corridor'];
const inRoom = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.t = {};
    this.last = { hours: 6 };
    this.acc = 0;
    this.stepT = 0;
  }

  start() {
    if (this.ctx) { this.setOn(true); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.4;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 3.2, 3.0);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet).connect(this.master);
    // the garden, heard through the walls when inside
    this.wall = ctx.createBiquadFilter();
    this.wall.type = 'lowpass'; this.wall.frequency.value = 18000; this.wall.Q.value = 0.5;
    this.outdoor = ctx.createGain();
    this.outdoor.connect(this.wall).connect(this.master);
    this.wall.connect(this.reverb);
    this.indoor = ctx.createGain();
    this.indoor.connect(this.master);
    this.indoor.connect(this.reverb);

    const pink = noiseBuffer(ctx, 6, true), white = noiseBuffer(ctx, 4, false);
    this.white = white;
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const loop = (buf, chain, bus, pan = 0) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      let node = s;
      for (const f of chain) { node.connect(f); node = f; }
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      node.connect(g).connect(p).connect(bus);
      s.start(0, Math.random() * 3);
      return { g, p };
    };
    this.bq = bq;
    // wind: a low body that gusts, and the bamboo's hiss on top of it
    this.windF = bq('bandpass', 420, 0.5);
    this.wind = loop(pink, [this.windF], this.outdoor);
    this.bamboo = loop(white, [bq('bandpass', 3800, 0.6), bq('highshelf', 6000)], this.outdoor);
    // water: the stream's babble and the pond's low wash
    this.babbleF = bq('bandpass', 1600, 1.1);
    this.stream = loop(white, [this.babbleF, bq('lowpass', 5000)], this.outdoor);
    this.wash = loop(pink, [bq('lowpass', 380)], this.outdoor);
    // summer: the aburazemi's sizzle under the day
    this.sizzle = loop(white, [bq('bandpass', 5600, 2.2), bq('peaking', 6400, 4)], this.outdoor);
    // the kettle: matsukaze, a soft roar with a sung edge
    this.kettle = loop(pink, [bq('bandpass', 950, 0.8), bq('peaking', 2300, 6)], this.indoor);
    this.bathLap = loop(pink, [bq('lowpass', 650)], this.indoor);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
    this.on = true;
  }

  setOn(on) {
    if (!this.ctx) return;
    this.on = on;
    if (on) this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, on ? 0.8 : 0.25);
    if (!on) setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 900);
  }

  // ------------------------------------------------------------------ one-shot voices
  // a short-lived gain and pan into a bus, taken apart once its sound has rung out
  voice(bus, pan, gain, life = 4) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    g.connect(p).connect(bus);
    setTimeout(() => { g.disconnect(); p.disconnect(); }, life * 1000);
    return g;
  }
  tone(dest, t, f0, f1, dur, gain, type = 'sine', vib = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vib) {
      const l = ctx.createOscillator(); l.frequency.value = 7 + Math.random() * 3;
      const lg = ctx.createGain(); lg.gain.value = vib;
      l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.25));
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.18);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.3);
  }
  burst(dest, t, dur, f, q, gain) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const b = this.bq('bandpass', f, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b).connect(g).connect(dest);
    s.start(t, Math.random() * 3); s.stop(t + dur + 0.02);
  }

  uguisu(dest, t) {
    // ho———, a breath, then hokekyo
    this.tone(dest, t, 1050, 1300, 1.3, 0.16, 'sine', 12);
    this.tone(dest, t + 1.45, 2150, 2250, 0.11, 0.18);
    this.tone(dest, t + 1.6, 2650, 2550, 0.09, 0.16);
    this.tone(dest, t + 1.73, 2000, 1650, 0.42, 0.17, 'sine', 25);
  }
  sparrow(dest, t) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.11 + Math.random() * 0.08), f = 4200 + Math.random() * 1600;
      this.tone(dest, s, f, f * 0.72, 0.065, 0.09, 'triangle');
    }
  }
  bulbul(dest, t) {
    this.tone(dest, t, 3300, 2700, 0.26, 0.11, 'sine', 40);
    this.tone(dest, t + 0.32, 3000, 2300, 0.34, 0.1, 'sine', 30);
  }
  minmin(dest, t) {
    // min-min-min-min-meee
    const n = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) this.tone(dest, t + i * 0.21, 4100, 4400, 0.15, 0.045, 'sawtooth');
    this.tone(dest, t + n * 0.21, 4400, 3900, 1.1, 0.04, 'sawtooth', 60);
  }
  higurashi(dest, t) {
    // kana-kana-kana, falling and fading
    const n = 14 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const k = i / n, f = 4900 - k * 700;
      this.tone(dest, t + i * 0.105, f, f * 0.94, 0.085, 0.05 * (1 - k * 0.7), 'sine', 90);
    }
  }
  suzumushi(dest, t) {
    // riiin: a pure high tone trilled fast
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.value = 4300 + Math.random() * 400;
    const am = ctx.createOscillator(); am.frequency.value = 42 + Math.random() * 10;
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    am.connect(amg).connect(g.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.04);
    env.gain.setTargetAtTime(0, t + 0.38, 0.05);
    o.connect(g).connect(env).connect(dest);
    g.gain.setValueAtTime(0.5, t);
    o.start(t); am.start(t); o.stop(t + 0.7); am.stop(t + 0.7);
  }
  drip(dest, t, gain) {
    this.tone(dest, t, 1500 + Math.random() * 500, 520, 0.05, gain);
    this.burst(dest, t, 0.012, 6000, 1, gain * 0.25);
  }
  shishiOdoshi(dest, t) {
    // the bamboo arm tipping back onto its stone: a hollow, dry knock
    this.burst(dest, t, 0.05, 1100, 5, 0.5);
    this.tone(dest, t, 540, 470, 0.16, 0.32, 'triangle');
    this.tone(dest, t, 1250, 1150, 0.07, 0.12);
  }
  ember(dest, t) { this.burst(dest, t, 0.006 + Math.random() * 0.01, 2500 + Math.random() * 4000, 1.5, 0.12 + Math.random() * 0.1); }
  floor(dest, t) {
    // uguisu-bari: the nail rubbing its clamp under the boards, a chirp like a bird's
    const f = 1800 + Math.random() * 900;
    this.tone(dest, t, f, f * 1.25, 0.07, 0.06, 'sine', 120);
    this.tone(dest, t + 0.08, f * 1.2, f * 0.9, 0.09, 0.05, 'sine', 140);
  }
  bell(t) {
    // a bonshō far away: inharmonic partials, beating, a long decay, mostly reverb
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0.5;
    const lp = this.bq('lowpass', 1400);
    out.connect(lp).connect(this.outdoor);
    lp.connect(this.reverb);
    setTimeout(() => { out.disconnect(); lp.disconnect(); }, 25000);
    const f0 = 92;
    [[0.5, 0.35, 10], [1, 0.5, 9], [1.183, 0.3, 7], [1.506, 0.22, 6], [2.0, 0.18, 5], [2.74, 0.1, 3.5], [3.76, 0.06, 2.5]].forEach(([r, a, d]) => {
      for (const det of [0, 0.6]) {
        const o = ctx.createOscillator(); o.frequency.value = f0 * r + det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a * 0.5, t + 0.02);
        g.gain.setTargetAtTime(0, t + 0.05, d / 3);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + d * 2);
      }
    });
    this.burst(out, t, 0.08, 300, 1, 0.3);
  }

  // ------------------------------------------------------------------ per frame
  // s: { x, z, yaw (radians, view heading), hours, season (vec4), night, moving }
  update(dt, s) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    // continuous levels are eased ten times a second; events are scheduled as they fall due
    this.acc += dt;
    const h = s.hours, se = s.season;
    const dawn = smoothstep(4.9, 5.6, h) * (1 - smoothstep(8.5, 10, h));
    const day = smoothstep(6, 8, h) * (1 - smoothstep(17.5, 19, h));
    const dusk = smoothstep(17.2, 18, h) * (1 - smoothstep(19.2, 19.8, h));
    const night = s.night;
    const snow = se.w, summer = se.y;
    let inside = false, corridor = false;
    for (const [k, r] of Object.entries(ROOMS)) if (inRoom(s.x, s.z, r)) { inside = !CORRIDORS.includes(k); corridor = corridor || CORRIDORS.includes(k) || k === 'doma'; }
    const near = (p, r) => { const d = Math.hypot(s.x - p[0], s.z - p[1]); return 1 / (1 + (d * d) / (r * r)); };
    const pan = (p) => { const a = Math.atan2(p[0] - s.x, -(p[1] - s.z)) - s.yaw; return clamp(Math.sin(a) * 0.85, -1, 1); };
    const streamNear = Math.max(...AT.stream.map((p) => near(p, 3.5)));

    if (this.acc > 0.1) {
      this.acc = 0;
      const T = (param, v, tc = 0.6) => param.setTargetAtTime(v, now, tc);
      T(this.wall.frequency, inside ? 900 : corridor ? 3800 : 18000, 0.5);
      T(this.outdoor.gain, inside ? 0.55 : 1, 0.5);
      const gust = 0.6 + 0.4 * Math.sin(now * 0.13) * Math.sin(now * 0.071 + 1);
      T(this.wind.g.gain, (0.05 + 0.05 * snow + 0.03 * night) * gust * (1 - summer * 0.3));
      T(this.windF.frequency, 340 + 260 * gust);
      const bambooNear = clamp((s.x - 12) / 8, 0, 1) * 0.7 + clamp((-s.z - 8) / 5, 0, 1) * 0.3;
      T(this.bamboo.g.gain, (0.004 + 0.02 * bambooNear) * gust * (1 - snow * 0.6));
      T(this.stream.g.gain, 0.06 * streamNear * (1 - snow * 0.5));
      T(this.stream.p.pan, pan(AT.stream[2]));
      this.babbleF.frequency.setTargetAtTime(1300 + Math.random() * 900, now, 0.08);
      T(this.wash.g.gain, 0.05 * near(AT.pond, 7));
      T(this.wash.p.pan, pan(AT.pond));
      const sizzle = summer * day * smoothstep(9, 11, h) * (1 - smoothstep(16.5, 17.5, h));
      T(this.sizzle.g.gain, 0.012 * sizzle * (0.7 + 0.3 * Math.sin(now * 0.4)));
      const kTea = near(AT.tea, 2.4), kHearth = near(AT.hearth, 3.2);
      T(this.kettle.g.gain, 0.05 * Math.max(kTea, kHearth) * (0.8 + 0.2 * Math.sin(now * 0.6)));
      T(this.kettle.p.pan, pan(kTea > kHearth ? AT.tea : AT.hearth));
      T(this.bathLap.g.gain, 0.05 * near(AT.bath, 2.5) * (0.6 + 0.4 * Math.sin(now * 0.9)));
      T(this.bathLap.p.pan, pan(AT.bath));
    }

    // events
    const due = (k, gap) => { if (!this.t[k]) this.t[k] = now + gap() * Math.random(); if (now >= this.t[k]) { this.t[k] = now + gap(); return true; } return false; };
    const out = (panV, g) => this.voice(this.outdoor, panV, g);
    const rnd = () => Math.random() * 2 - 1;
    if (dawn * (1 - snow) > 0.2 && se.x > 0.3 && due('uguisu', () => 9 + Math.random() * 14)) this.uguisu(out(rnd() * 0.7, 0.8 * dawn * se.x), now + 0.05);
    if ((dawn + day * 0.4) * (1 - snow * 0.8) > 0.15 && due('sparrow', () => 3 + Math.random() * 7)) this.sparrow(out(rnd(), 0.7), now + 0.05);
    if (day * (1 - snow) > 0.3 && due('bulbul', () => 14 + Math.random() * 20)) this.bulbul(out(rnd(), 0.6), now + 0.05);
    if (summer > 0.4 && day > 0.5 && h > 9 && h < 16.5 && due('minmin', () => 10 + Math.random() * 12)) this.minmin(out(rnd() * 0.8, summer), now + 0.05);
    if ((summer + se.x * 0.3) > 0.4 && dusk > 0.3 && due('higurashi', () => 7 + Math.random() * 9)) this.higurashi(out(rnd() * 0.8, dusk), now + 0.05);
    if ((summer + se.z) > 0.4 && night > 0.4 && due('suzu', () => 0.5 + Math.random() * 1.4)) this.suzumushi(out(rnd(), night * (summer + se.z)), now + 0.02);
    const basin = near(AT.tsukubai, 2.2) > near(AT.roji, 2.2) ? AT.tsukubai : AT.roji;
    const tsu = near(basin, 2.2);
    if (tsu > 0.04 && due('drip', () => 0.7 + Math.random() * 1.6)) this.drip(out(pan(basin), tsu), now + 0.02, 0.22);
    const shi = near(AT.shishi, 9);
    if (shi > 0.05 && (1 - snow) > 0.3 && due('shishi', () => 26 + Math.random() * 18)) this.shishiOdoshi(out(pan(AT.shishi), shi), now + 0.02);
    const hearthK = near(AT.hearth, 2.2);
    if (hearthK > 0.08 && due('ember', () => 0.25 + Math.random() * 1.6)) this.ember(this.voice(this.indoor, pan(AT.hearth), hearthK, 1), now + 0.01);
    // the floors sing under each step along the corridors
    if (corridor && s.moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.5 + Math.random() * 0.25;
        if (Math.random() < 0.55) this.floor(this.voice(this.indoor, rnd() * 0.3, 0.9, 1.5), now + 0.01);
      }
    }
    // the bell, once as the sun comes up and once as it goes down, walking forward through the day
    for (const bh of [5.75, 18.25]) if (this.last.hours < bh && h >= bh && h - this.last.hours < 0.5) this.bell(now + 0.05);
    this.last.hours = h;
  }
}
