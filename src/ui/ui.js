// The interface. A loader that draws the house as an architect's plan while the world loads; a title sheet; then
// the chrome of the walk: chapter cards that come in as you come to rest, a day ruler on the right that is the
// sun's path from five in the morning to nine at night, the four seasons, sound, a photo mode that also prints a
// postcard, from above, the rooms as places to go back to, and a colophon naming whose work the garden is made of.
import './ui.css';
import { buildPlan } from './plan.js';
import { TITLE, COPY, SEASONS, PLACES, CREDITS, COLOPHON } from './copy.js';

const $ = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad2 = (n) => String(n).padStart(2, '0');
const clockOf = (h) => { const m = Math.round(h * 60); return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`; };
// characters that rise into place one after another
const chars = (s, d0 = 0, step = 0.045) => [...s].map((c, i) => `<span class="ch" style="--d:${(d0 + i * step).toFixed(3)}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
const H0 = 4.5, H1 = 21.0;

export class UI {
  constructor() {
    this.root = $('div', 'ut pre');
    this.root.id = 'ui';
    document.body.appendChild(this.root);
    document.documentElement.classList.add('locked');
    this.buildLoader();
    this.buildColophon();
    this.cardStop = -1;
    this.cardOn = false;
    this.photo = false;
    this.opened = false;
  }

  // ------------------------------------------------------------------ loader: the plan draws itself
  buildLoader() {
    const L = document.getElementById('load');
    L.innerHTML = '';
    const plan = buildPlan();
    this.plan = plan;
    const sheet = $('div', 'sheet');
    sheet.appendChild(plan.svg);
    L.appendChild(sheet);
    // the title block, set like the corner of a drawing sheet
    const tb = $('div', 'titleblock');
    tb.innerHTML = `
      <div class="tb-row tb-title"><span class="jp v">${TITLE.jp}</span><div class="tb-names"><b>${TITLE.en}</b><i>${TITLE.sub}</i><em>${TITLE.subJa}</em></div></div>
      <div class="tb-row tb-meta"><span>京都 · 北山</span><span>1 : 250</span><button class="colo-open" type="button">Credits</button><span class="pct">000</span></div>`;
    L.appendChild(tb);
    tb.querySelector('.colo-open').addEventListener('click', () => this.setColophon(true));
    this.pct = tb.querySelector('.pct');
    const go = $('div', 'enter');
    go.innerHTML = `
      <button class="go" type="button"><span class="jp">入る</span><span class="en">Enter</span></button>
      <button class="quiet" type="button">or enter in silence</button>
      <p class="gloss">${TITLE.gloss}</p>`;
    L.appendChild(go);
    this.goEl = go;
    this.loader = L;
    this.target = 0;
    this.shown = 0;
  }

  // loading can finish in a blink; the pen still takes its time over the sheet
  progress(p) {
    this.target = Math.max(this.target, clamp(p, 0, 1));
    if (this.drawing) return;
    this.drawing = true;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.shown = Math.min(this.target, this.shown + dt / 3.2);
      const k = this.shown, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.plan.draw(e);
      this.pct.textContent = String(Math.round(k * 100)).padStart(3, '0');
      if (this.shown >= 1 && this.onDrawn) { this.onDrawn(); this.onDrawn = null; }
      if (this.shown < this.target) requestAnimationFrame(step);
      else this.drawing = false;
    };
    requestAnimationFrame(step);
  }

  // resolves with whether to start with sound
  async ready() {
    if (this.shown < 1) await new Promise((r) => { this.onDrawn = r; this.progress(1); });
    await wait(350);
    this.loader.classList.add('ready');
    return new Promise((res) => {
      const done = (sound) => { removeEventListener('keydown', key); res(sound); };
      const key = (e) => { if (!this.colo && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); done(true); } };
      this.goEl.querySelector('.go').addEventListener('click', () => done(true), { once: true });
      this.goEl.querySelector('.quiet').addEventListener('click', () => done(false), { once: true });
      addEventListener('keydown', key);
    });
  }

  // straight into the walk, for tools and deep links
  skip() {
    this.loader.remove();
    this.root.classList.remove('pre');
    document.documentElement.classList.remove('locked');
    this.opened = true;
    this.skipped = true;
  }

  // the sheet tips back into the ground plane and the garden comes up through it
  async open() {
    this.loader.classList.add('leaving');
    await wait(1700);
    this.loader.classList.add('gone');
    this.root.classList.remove('pre');
    document.documentElement.classList.remove('locked');
    this.opened = true;
    if (scrollY < 40) this.hint.classList.add('in');
    await wait(400);
    this.loader.remove();
  }

  // ------------------------------------------------------------------ colophon: a schedule of whose work the garden is made of
  // a scan this build does not carry is not credited
  uncredit(models) {
    for (const m of models) document.querySelectorAll(`.colo-row[data-model="${m}"]`).forEach((e) => e.remove());
  }

  buildColophon() {
    const c = $('div', 'colophon');
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-modal', 'true');
    c.setAttribute('aria-labelledby', 'colo-h');
    const ext = 'target="_blank" rel="noopener"';
    const rows = CREDITS.map((g) => `<li class="colo-group"><span class="jp">${g.jp}</span>${g.group}</li>` + g.items.map((r) => `
      <li class="colo-row"${r.model ? ` data-model="${r.model}"` : ''}><span class="use"><span class="jp">${r.jp}</span><span class="en">${r.use}</span></span>
        <a class="work" href="${r.url}" ${ext}>${r.work}</a><span class="by">${r.by}</span><a class="lic" href="${r.lic[1]}" ${ext}>${r.lic[0]}</a></li>`).join('')).join('');
    c.innerHTML = `
      <div class="colo-sheet">
        <header class="colo-head"><span class="jp v">奥付</span>
          <div class="colo-title"><h2 id="colo-h">Colophon</h2><p>${COLOPHON.en}</p><p class="ja">${COLOPHON.ja}</p></div>
          <button class="colo-close" type="button">Close · Esc</button></header>
        <ul class="colo-list">${rows}</ul>
      </div>`;
    document.body.appendChild(c);
    c.addEventListener('click', (e) => { if (e.target === c) this.setColophon(false); });
    c.querySelector('.colo-close').addEventListener('click', () => this.setColophon(false));
    // ahead of the walk's own keys: while it is open, Escape closes it, Tab stays inside it, nothing else moves
    addEventListener('keydown', (e) => {
      if (!this.colo) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); this.setColophon(false); }
      else if (e.key === 'Tab') {
        const f = c.querySelectorAll('a, button'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }, true);
    this.coloEl = c;
  }

  setColophon(on) {
    if (on === !!this.colo) return;
    this.colo = on;
    this.coloEl.classList.toggle('in', on);
    document.documentElement.classList.toggle('reading', on);
    if (on) {
      this.coloBack = document.activeElement;
      this.coloEl.querySelector('.colo-list').scrollTop = 0;
      this.coloEl.querySelector('.colo-close').focus({ preventScroll: true });
    } else this.coloBack?.focus?.({ preventScroll: true });
  }

  // ------------------------------------------------------------------ chrome
  attach(app) {
    this.app = app;
    const { STOPS } = app;
    const R = this.root;

    // wordmark
    const wm = $('a', 'wordmark', `<span class="jp">${TITLE.jp}</span><span class="rule"></span><span class="en">${TITLE.en.toUpperCase()}</span>`);
    wm.href = '#';
    wm.addEventListener('click', (e) => { e.preventDefault(); this.goTo(0); });
    R.appendChild(wm);

    // seasons, sound, photo
    const ctl = $('div', 'controls');
    const seasons = $('div', 'seasons');
    seasons.setAttribute('role', 'radiogroup');
    seasons.setAttribute('aria-label', 'Season');
    this.seasonBtns = SEASONS.map((s, i) => {
      const b = $('button', 'season', `<span class="jp">${s.jp}</span><span class="tip">${s.en}</span>`);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', s.en);
      b.addEventListener('click', () => this.setSeason(i));
      seasons.appendChild(b);
      return b;
    });
    this.seasonBar = $('span', 'bar');
    seasons.appendChild(this.seasonBar);
    ctl.appendChild(seasons);
    this.soundBtn = $('button', 'icon sound', '<span class="jp">音</span><span class="eq"><i></i><i></i><i></i><i></i></span><span class="tip">Sound</span>');
    this.soundBtn.type = 'button';
    this.soundBtn.setAttribute('aria-label', 'Sound');
    this.soundBtn.addEventListener('click', () => this.setSound(!app.sound.on));
    ctl.appendChild(this.soundBtn);
    const photoBtn = $('button', 'icon photo', '<span class="jp">写</span><span class="tip">Photo · P</span>');
    photoBtn.type = 'button';
    photoBtn.setAttribute('aria-label', 'Photo mode');
    photoBtn.addEventListener('click', () => this.setPhoto(true));
    ctl.appendChild(photoBtn);
    R.appendChild(ctl);

    // the day ruler
    const ruler = $('nav', 'ruler');
    ruler.setAttribute('aria-label', 'The walk');
    const track = $('div', 'track');
    for (let h = 5; h <= 21; h++) {
      const t = $('span', h % 3 === 0 ? 'tick major' : 'tick');
      t.style.top = `${((h - H0) / (H1 - H0)) * 100}%`;
      if (h % 3 === 0) t.dataset.h = pad2(h);
      track.appendChild(t);
    }
    this.stopEls = STOPS.map((s, i) => {
      const b = $('button', 'mark', `<span class="dot"></span><span class="lbl"><span class="jp">${COPY[i].jp}</span><span class="en">${COPY[i].en}</span></span>`);
      b.type = 'button';
      b.style.top = `${((s.h - H0) / (H1 - H0)) * 100}%`;
      b.setAttribute('aria-label', `${String(i + 1).padStart(2, '0')} ${COPY[i].en}`);
      b.addEventListener('click', () => this.goTo(i));
      track.appendChild(b);
      return b;
    });
    this.sunEl = $('div', 'sun', '<span class="disc"></span><span class="clock">05:06</span>');
    track.appendChild(this.sunEl);
    ruler.appendChild(track);
    R.appendChild(ruler);
    this.clockEl = this.sunEl.querySelector('.clock');

    // the chapter card
    this.scrim = $('div', 'scrim');
    R.appendChild(this.scrim);
    this.card = $('section', 'card');
    this.card.setAttribute('aria-live', 'polite');
    R.appendChild(this.card);

    // the first hint
    this.hint = $('div', 'hint', '<span class="line"></span><span class="en">Scroll, and the day passes</span><span class="jp">スクロールで、一日が過ぎてゆく</span>');
    R.appendChild(this.hint);
    if (this.skipped) this.hint.remove();

    // the rooms, from above
    this.places = PLACES.map((p) => {
      const b = $('button', 'place', `<span class="jp">${p.jp}</span><span class="en">${p.en}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => this.goTo(p.stop));
      R.appendChild(b);
      return { ...p, el: b };
    });

    // photo mode: everything steps away; a single quiet bar to print a postcard or come back
    this.photoBar = $('div', 'photobar', '<button type="button" class="print"><span class="jp">刷</span><span class="en">Postcard</span></button><button type="button" class="back"><span class="en">Back</span><span class="k">Esc</span></button>');
    this.photoBar.querySelector('.print').addEventListener('click', () => this.postcard());
    this.photoBar.querySelector('.back').addEventListener('click', () => this.setPhoto(false));
    R.appendChild(this.photoBar);

    // the veil for cuts between distant stops
    this.veil = $('div', 'veil');
    R.appendChild(this.veil);

    const colo = $('button', 'colo-link', '<span class="jp">奥付</span>Credits');
    colo.type = 'button';
    colo.addEventListener('click', () => this.setColophon(true));
    R.appendChild(colo);

    this.bindInput();
    this.setSeason(app.env.season, true);
    addEventListener('resize', () => this.setSeason(this.seasonI, true));
    this.syncSound();
    this.bindIdle();
  }

  bindInput() {
    const { journey } = this.app;
    const canvas = document.getElementById('c');
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      journey.parallaxT.set((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    });
    // drag to look further; let go and the view settles back
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      journey.dragT.set(clamp((e.clientX - drag.x) * 0.0032, -1.1, 1.1), clamp((e.clientY - drag.y) * 0.0026, -0.45, 0.45));
    });
    const up = () => { if (!drag) return; drag = null; journey.dragT.set(0, 0); this.root.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (!this.opened || this.colo || e.metaKey || e.ctrlKey || e.altKey) return;
      const here = Math.round(journey.target);
      if (this.photo && e.key === 'Escape') return this.setPhoto(false);
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); this.goTo(here + 1); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); this.goTo(here - 1); }
      else if (e.key === 'Home') { e.preventDefault(); this.goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); this.goTo(this.app.STOPS.length - 1); }
      else if (e.key >= '1' && e.key <= '4') this.setSeason(+e.key - 1);
      else if (e.key === 'm' || e.key === 'M') this.setSound(!this.app.sound.on);
      else if (e.key === 'p' || e.key === 'P') this.setPhoto(!this.photo);
    });
    addEventListener('scroll', () => { if (scrollY > 40) this.hint.classList.remove('in'); }, { passive: true });
  }

  // with a mouse, the chrome steps back after a few still seconds and returns on the slightest movement
  bindIdle() {
    let timer = 0;
    const wake = (e) => {
      this.root.classList.remove('idle');
      clearTimeout(timer);
      if (e && e.pointerType && e.pointerType !== 'mouse') return;
      timer = setTimeout(() => this.root.classList.add('idle'), 5000);
    };
    addEventListener('pointermove', wake);
    addEventListener('keydown', wake);
    addEventListener('scroll', wake, { passive: true });
  }

  // ------------------------------------------------------------------ actions
  scrollYFor(i) {
    const max = document.documentElement.scrollHeight - innerHeight;
    return (i / (this.app.STOPS.length - 1)) * max;
  }

  // a neighbour is walked to; anything further is a cut through a veil of paper-dark
  async goTo(i) {
    const { journey, STOPS, env } = this.app;
    i = clamp(i, 0, STOPS.length - 1);
    if (this.cutting) return;
    if (Math.abs(i - journey.progress) <= 1.25) {
      scrollTo({ top: this.scrollYFor(i), behavior: 'smooth' });
      return;
    }
    this.cutting = true;
    this.veil.classList.add('on');
    await wait(520);
    scrollTo({ top: this.scrollYFor(i), behavior: 'instant' });
    journey.progress = journey.target = i;
    journey.vel = 0;
    env.setHours(STOPS[i].h, true);
    await wait(160);
    this.veil.classList.remove('on');
    this.cutting = false;
  }

  setSeason(i, quiet = false) {
    this.app.env.setSeason(i);
    this.seasonBtns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-checked', k === i ? 'true' : 'false'); });
    const b = this.seasonBtns[i];
    this.seasonBar.style.transform = `translateX(${(b.offsetLeft + b.offsetWidth / 2 - 7).toFixed(1)}px)`;
    this.seasonI = i;
    if (!quiet) this.toast(`${SEASONS[i].jp}　${SEASONS[i].en}`, SEASONS[i].note);
  }

  setSound(on) {
    const s = this.app.sound;
    if (on) s.start(); else s.setOn(false);
    this.syncSound();
  }
  syncSound() { this.soundBtn.classList.toggle('on', !!this.app.sound.on); }

  setPhoto(on) {
    this.photo = on;
    this.root.classList.toggle('photo', on);
  }

  toast(title, note) {
    if (!this.toastEl) { this.toastEl = $('div', 'toast'); this.root.appendChild(this.toastEl); }
    const t = this.toastEl;
    t.innerHTML = `<b>${title}</b><i>${note}</i>`;
    t.classList.remove('in');
    void t.offsetWidth;
    t.classList.add('in');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('in'), 2600);
  }

  // the next rendered frame, set on a card with the place, the hour and the season, saved as a PNG
  async postcard() {
    const { env, journey } = this.app;
    const src = await this.app.capture();
    const c = COPY[journey.stop];
    const W = 2400, ph = Math.round((W - 160) * (src.height / src.width)), H = ph + 360;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#efe8dc';
    g.fillRect(0, 0, W, H);
    g.drawImage(src, 80, 80, W - 160, ph);
    await document.fonts.ready;
    g.fillStyle = '#1b1713';
    g.font = '500 88px "Shippori Mincho B1", serif';
    g.fillText(c.jp, 80, ph + 210);
    const jw = g.measureText(c.jp).width;
    g.font = 'italic 500 64px "Cormorant Garamond", serif';
    g.fillText(c.en, 80 + jw + 40, ph + 205);
    g.font = '500 26px "IBM Plex Mono", monospace';
    g.fillStyle = '#6b6156';
    const meta = `${clockOf(env.hours)}   ${SEASONS[env.season].en.toUpperCase()}   UTSUROI · A HOUSE IN KYOTO`;
    g.fillText(meta, 80, ph + 280);
    g.fillStyle = '#c4452b';
    g.fillRect(W - 80 - 96, ph + 140, 96, 96);
    g.fillStyle = '#efe8dc';
    g.font = '700 58px "Shippori Mincho B1", serif';
    g.textAlign = 'center';
    g.fillText('移', W - 80 - 48, ph + 210);
    const a = document.createElement('a');
    a.download = `utsuroi-${c.id}-${clockOf(env.hours).replace(':', '')}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  // ------------------------------------------------------------------ per frame
  update() {
    if (!this.app) return;
    const { journey, env, camera, STOPS } = this.app;
    // ruler: the sun (or the moon) at the hour
    const y = clamp((env.hours - H0) / (H1 - H0), 0, 1);
    this.sunEl.style.top = `${(y * 100).toFixed(3)}%`;
    this.sunEl.classList.toggle('night', env.night > 0.5);
    const clock = clockOf(env.hours);
    if (clock !== this.lastClock) { this.clockEl.textContent = clock; this.lastClock = clock; }
    const here = journey.stop;
    if (here !== this.lastHere) {
      this.stopEls.forEach((b, i) => { b.classList.toggle('here', i === here); b.classList.toggle('past', i < here); });
      this.lastHere = here;
    }

    // the card arrives once you have come to rest, and leaves as soon as you move on
    const rest = journey.restK;
    const want = this.opened && !this.photo && rest > 0.9 && Math.abs(journey.progress - journey.target) < 0.08;
    if (want && (!this.cardOn || this.cardStop !== here)) this.showCard(here);
    else if (!want && this.cardOn && rest < 0.8) this.hideCard();

    // from above: the rooms become places to go back to
    const above = this.opened && !this.photo && journey.progress > STOPS.length - 1.35;
    this.root.classList.toggle('above', above);
    if (above) {
      const v = this._v || (this._v = camera.position.clone());
      const k = clamp((journey.progress - (STOPS.length - 1.35)) / 0.3, 0, 1);
      for (const p of this.places) {
        v.set(p.x, 0.4, p.z).project(camera);
        const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
        p.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        p.el.style.opacity = k.toFixed(3);
      }
    }
  }

  showCard(i) {
    const c = COPY[i];
    const n = this.app.STOPS.length;
    this.card.innerHTML = `
      <div class="num"><span>${String(i + 1).padStart(2, '0')}</span><span class="of">/ ${String(n).padStart(2, '0')}</span><span class="time">${c.time}</span></div>
      <div class="body">
        <h2 class="name"><span class="jp v">${chars(c.jp, 0.05, 0.12)}</span><span class="kana v">${c.kana}</span></h2>
        <div class="text">
          <h3 class="en">${chars(c.en, 0.25, 0.03)}</h3>
          <p class="line">${c.body}</p>
          <p class="ja">${c.ja}</p>
        </div>
      </div>`;
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
    this.scrim.classList.add('in');
    this.cardStop = i;
    this.cardOn = true;
  }

  hideCard() {
    this.card.classList.remove('in');
    this.scrim.classList.remove('in');
    this.cardOn = false;
  }
}
