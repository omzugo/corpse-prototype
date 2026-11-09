// Compositor: stacks a top, middle and bottom strip from three artworks so their seams meet.
//   Space    a new figure (locked strips stay)
//   click    lock or unlock a strip · ⌘-click to edit its lines in the annotator
//   buttons  day / night, and download the figure as a full-resolution PNG
// Helpers shared with the annotator (loading data and images, which strips an image can supply)
// live in common.js.

let images = [], annotations = {}, byId = {};
let pick = null;                     // the three image ids on screen: { top, middle, bottom }
let next = null;                     // a new pick, shown as soon as its three images have loaded
let locked = { top: false, middle: false, bottom: false };
let figView = null;                  // where the figure was last drawn: offset and scale
const MARGIN = 24;

// ---- 1. load the data, pick a random top, middle and bottom ----

async function setup() {
  createCanvas(windowWidth, windowHeight);
  try { setTheme(localStorage.getItem('compositorNight') === '1'); } catch (e) {}
  ({ images, annotations } = await loadData());
  for (const e of images) byId[e.id] = e;
  newFigure();
  // pick up annotation changes made in the annotator when you come back to this tab
  window.addEventListener('focus', async () => {
    ({ annotations } = await loadData());
    if (pick && !ROLES.every(role => canSupply(annotations[pick[role]], role))) newFigure();
  });
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

// Every image that can supply this strip (common.js: has the lines, isn't excluded or rejected).
function candidates(role) {
  return images.filter(e => e.w && canSupply(annotations[e.id], role)).map(e => e.id);
}

function newFigure() {
  const p = {};
  for (const role of ROLES) {
    const pool = candidates(role);
    if (!pool.length) return;
    // a random image, avoiding the other strips' images when there's a choice
    const fresh = pool.filter(id => !Object.values(p).includes(id));
    p[role] = locked[role] && pick ? pick[role] : random(fresh.length ? fresh : pool);
  }
  next = p;
  keepOnlyImages([...Object.values(next), ...(pick ? Object.values(pick) : [])]); // common.js: free the rest
  for (const role of ROLES) getImage(byId[next[role]]);                             // start loading the new three
}

// ---- 2. line up the seams ----

// Where each strip goes. Units are the middle image's pixels (from images.json, so nothing has to load):
// the middle is drawn at its own size; the top and bottom are scaled so their seam is as wide as the
// middle's matching seam, and shifted so the two seams' centers line up.
function computeLayout(p) {
  const T = byId[p.top], M = byId[p.middle], B = byId[p.bottom];
  const a = annotations[p.top], b = annotations[p.middle], c = annotations[p.bottom];
  const seam = (e, s) => ({ cx: (s.x1 + s.x2) / 2 * e.w, w: (s.x2 - s.x1) * e.w }); // in that image's pixels
  const mU = seam(M, b.upper), mL = seam(M, b.lower), tU = seam(T, a.upper), bL = seam(B, c.lower);
  const sT = mU.w / tU.w, sB = mL.w / bL.w;
  const strips = {
    top:    { e: T, s: sT, x: mU.cx - tU.cx * sT, y0: 0, y1: a.upper.y },        // y0, y1: the band, as
    middle: { e: M, s: 1,  x: 0,                  y0: b.upper.y, y1: b.lower.y }, // fractions of its image
    bottom: { e: B, s: sB, x: mL.cx - bL.cx * sB, y0: c.lower.y, y1: 1 },
  };
  let y = 0;
  for (const st of Object.values(strips)) {
    st.w = st.e.w * st.s;
    st.h = (st.y1 - st.y0) * st.e.h * st.s;
    st.y = y; y += st.h;
  }
  const all = Object.values(strips), x0 = min(all.map(st => st.x)), x1 = max(all.map(st => st.x + st.w));
  return { strips, x0, w: x1 - x0, h: y }; // nothing is trimmed: the figure is as wide as its widest strip
}

// ---- 3. draw the three strips ----

function draw() {
  background(isNight() ? 0 : 255);
  if (next && ROLES.every(role => getImage(byId[next[role]]))) { pick = next; next = null; }
  if (!pick) return;

  const L = computeLayout(pick);
  const f = min((width - 2 * MARGIN) / L.w, (height - 2 * MARGIN) / L.h); // fit inside the margins
  figView = { x: (width - L.w * f) / 2, y: (height - L.h * f) / 2, f, L };
  push();
  translate(figView.x, figView.y);
  scale(f);
  translate(-L.x0, 0);
  drawStrips(window, L);
  pop();

  drawingContext.canvas.style.cursor = roleUnderMouse() ? 'pointer' : 'default';
  showCredits();
}

// Draw each strip's band of its image. Works on the screen or on an offscreen buffer (for the PNG).
function drawStrips(g, L) {
  for (const role of ROLES) {
    const st = L.strips[role], img = getImage(st.e);
    g.image(img, st.x, st.y, st.w, st.h, 0, st.y0 * img.height, img.width, (st.y1 - st.y0) * img.height);
  }
}

// ---- 4. new figures and locking ----

function keyPressed(e) {
  if (e && (e.metaKey || e.ctrlKey)) return; // leave browser shortcuts alone
  if (key === ' ') { newFigure(); return false; }
}

// The strip under the mouse (on its image, not the empty space beside a narrower strip), or null.
function roleUnderMouse() {
  if (!figView) return null;
  const { L, f } = figView;
  const x = (mouseX - figView.x) / f + L.x0, y = (mouseY - figView.y) / f;
  return ROLES.find(role => {
    const st = L.strips[role];
    return y >= st.y && y < st.y + st.h && x >= st.x && x <= st.x + st.w;
  }) || null;
}

function mousePressed(e) {
  if (e && e.target !== drawingContext.canvas) return; // clicks on credits and buttons aren't strip clicks
  const role = roleUnderMouse();
  if (!role || (e && e.button !== 0)) return;
  if (e && (e.metaKey || e.ctrlKey)) window.open('annotator.html#' + encodeURIComponent(pick[role]), 'annotator');
  else locked[role] = !locked[role];
}

// ---- 5. credits ----

// All three artworks' details, stacked top to bottom in the bottom-left corner.
function showCredits() {
  const caption = document.getElementById('caption'), html = ROLES.map(credit).join('');
  if (caption.dataset.html !== html) { caption.innerHTML = html; caption.dataset.html = html; }
}

// One strip's credit: title in italics (linking to the museum page), artist and date, medium, museum.
function credit(role) {
  const e = byId[pick[role]];
  const museum = e.source === 'met' ? 'The Met' : 'Art Institute of Chicago';
  // noreferrer: the Art Institute's firewall blocks visits whose referrer is a localhost page
  const title = `<a href="${escapeHTML(e.page || '')}" target="_blank" rel="noopener noreferrer"><i>${fitLine(e.title || '')}</i></a>`
    + (locked[role] ? ' <span class="dim">(locked)</span>' : '');
  const lines = [title, fitLine([e.artist, e.date].filter(Boolean).join(', ')), fitLine(e.medium || ''), museum];
  return `<div class="credit">${lines.filter(Boolean).join('<br>')}</div>`;
}

// ---- 6. download, and day / night ----

// The figure as a PNG at the middle image's full resolution, transparent beside narrower strips.
function savePNG() {
  if (!figView) return;
  const L = figView.L, k = getImage(byId[pick.middle]).width / byId[pick.middle].w; // layout units → full-size pixels
  const g = createGraphics(round(L.w * k), round(L.h * k));
  g.clear();
  g.scale(k);
  g.translate(-L.x0, 0);
  drawStrips(g, L);
  save(g, `corpse_${pick.top}_${pick.middle}_${pick.bottom}.png`);
  g.remove();
}

// White or black page; remembered in this browser.
function isNight() { return document.body.classList.contains('night'); }
function setTheme(night) {
  document.body.classList.toggle('night', night);
  const btn = document.getElementById('theme'), label = night ? 'Switch to day' : 'Switch to night';
  btn.title = label; btn.setAttribute('aria-label', label);
  try { localStorage.setItem('compositorNight', night ? '1' : ''); } catch (e) {}
}
function toggleTheme() { setTheme(!isNight()); }
