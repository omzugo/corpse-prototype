// Seam annotator.
// Draw horizontal cut lines across a form; each line ends where the form's contour does.
//   U / L      choose the upper or lower line, then click twice: left end, right end
//   drag       a line's end to adjust it (sideways moves that end, up or down moves the whole line)
//   scroll     zoom · hold Space and drag to pan · F to fit the window
//   T M B      include or exclude the top / middle / bottom strip (or click its label)
//   X reject · ← → previous / next · N next unannotated
// Each line is saved as fractions of the image: { y, x1, x2 }.
// Helpers shared with the compositor (loading, saving, image cache) live in common.js.

let images = [], annotations = {}, idx = 0;
let mode = 'upper';              // which line the next two clicks draw
let firstClick = null;           // after the first click of a new line: that point, in image pixels
let dragging = null;             // while dragging a line end: { name: 'upper' | 'lower', end: 'x1' | 'x2' }
let panning = null;              // while space-dragging: the last mouse position
let view = { x: 0, y: 0, s: 1 }; // where the image sits on screen, and its scale
let fittedTo = null;             // id of the image the view was last fitted to
let checkboxes = {};             // the browser's own checkboxes, one per strip

const COLORS = { upper: [150, 205, 235], lower: [235, 125, 65] };
const MARGIN = 24, LEADING = 16;

// ---- 1. show an image, and move through the collection ----

async function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Helvetica Neue');
  textSize(12);
  ({ images, annotations } = await loadData());
  let saved = 0;
  try { saved = parseInt(localStorage.getItem('annotatorIdx')) || 0; } catch (e) {}
  go(constrain(saved, 0, images.length - 1));
  for (const role of ROLES) { // p5's createCheckbox makes a real browser checkbox, with its label
    checkboxes[role] = createCheckbox(role[0].toUpperCase() + role.slice(1), true);
    checkboxes[role].addClass('strip-check');
    checkboxes[role].changed(() => toggleStrip(role));
    checkboxes[role].hide();
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash); // the compositor opens images as annotator.html#<id>
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); fittedTo = null; }

function current() { return images[idx]; }
function ann() { return annotations[current().id] || (annotations[current().id] = {}); }

function go(i) {
  idx = (i + images.length) % images.length;
  firstClick = null; dragging = null; mode = 'upper'; fittedTo = null;
  try { localStorage.setItem('annotatorIdx', idx); } catch (e) {}
  // keep only this image and its neighbors in memory, and start loading the next two
  keepOnlyImages([-1, 0, 1, 2].map(k => images[(idx + k + images.length) % images.length].id));
  for (let k = 1; k <= 2; k++) getImage(images[(idx + k) % images.length]);
}

function openFromHash() {
  const i = images.findIndex(e => e.id === decodeURIComponent(location.hash.slice(1)));
  if (i >= 0) go(i);
}

function fit(img) {
  view.s = min(width / img.width, height / img.height);
  view.x = (width - img.width * view.s) / 2;
  view.y = (height - img.height * view.s) / 2;
  fittedTo = current().id;
}

function draw() {
  background(0);
  if (!images.length) return;
  const img = getImage(current());
  if (img && fittedTo !== current().id) fit(img);
  const a = annotations[current().id] || {};

  if (img) {
    // Everything inside push/pop is drawn in the image's own pixels; translate and scale put it on screen.
    push();
    translate(view.x, view.y);
    scale(view.s);
    image(img, 0, 0);
    if (a.reject) { noStroke(); fill(0, 190); rect(0, 0, img.width, img.height); }
    else dimExcludedStrips(a, img);
    for (const name of ['upper', 'lower']) if (a[name]) drawLine(a[name], COLORS[name], img);
    drawLineInProgress(img);
    pop();
    drawLoupe(img, a);
  }
  drawText(a, img);
  updateCursor(img);
}

// ---- 2. zoom and pan ----

// The mouse position in the image's own pixels.
function mouseInImage() {
  return { x: (mouseX - view.x) / view.s, y: (mouseY - view.y) / view.s };
}

function mouseWheel(e) {
  // zoom around the point under the cursor, so it stays put
  const r = drawingContext.canvas.getBoundingClientRect(); // the wheel event's own position on the canvas
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const s = constrain(view.s * Math.exp(-e.delta * 0.002), 0.05, 8);
  view.x = mx - (mx - view.x) * (s / view.s);
  view.y = my - (my - view.y) * (s / view.s);
  view.s = s;
  return false;
}

// ---- 3. draw a line: U / L, then two clicks ----

// Snap a point to the center of the image pixel it falls in, kept inside the image.
function snap(p, img) {
  return { x: constrain(floor(p.x), 0, img.width - 1) + 0.5, y: constrain(floor(p.y), 0, img.height - 1) + 0.5 };
}

function onImage(p, img) { return p.x >= 0 && p.x < img.width && p.y >= 0 && p.y < img.height; }

function clickToDraw(img) {
  const m = mouseInImage();
  if (!onImage(m, img)) return;
  const p = snap(m, img);
  if (!firstClick) { firstClick = p; return; }
  // second click: the line stays at the first click's height
  ann()[mode] = { y: firstClick.y / img.height, x1: min(firstClick.x, p.x) / img.width, x2: max(firstClick.x, p.x) / img.width };
  firstClick = null;
  if (mode === 'upper') mode = 'lower';
  persist();
}

// A line: a faint line across the whole window, solid color between its two ends.
// Called inside the image-pixel transform, so widths are divided by the scale to stay 1px on screen.
function drawLine(s, c, img) {
  const y = s.y * img.height;
  faintLine(y);
  stroke(...c); strokeWeight(1.5 / view.s);
  line(s.x1 * img.width, y, s.x2 * img.width, y);
}

function faintLine(y) {
  stroke(255, 115); strokeWeight(1 / view.s);
  line(-view.x / view.s, y, (width - view.x) / view.s, y); // the window's left and right edges, in image pixels
}

// After the first click: the line so far. Before it: a preview at the mouse's height.
function drawLineInProgress(img) {
  const m = mouseInImage();
  if (firstClick) {
    faintLine(firstClick.y);
    stroke(...COLORS[mode]); strokeWeight(1.5 / view.s);
    line(firstClick.x, firstClick.y, constrain(m.x, 0, img.width), firstClick.y);
  } else if (!dragging && !endUnderMouse(img) && onImage(m, img)) {
    stroke(...COLORS[mode], 130); strokeWeight(1 / view.s);
    line(0, m.y, img.width, m.y);
  }
}

// ---- 4. drag a line's ends ----

// The line end within 8 screen pixels of the mouse, if any.
function endUnderMouse(img) {
  const a = annotations[current().id] || {};
  for (const name of ['upper', 'lower']) {
    if (!a[name]) continue;
    for (const end of ['x1', 'x2']) {
      const sx = view.x + a[name][end] * img.width * view.s, sy = view.y + a[name].y * img.height * view.s;
      if (dist(mouseX, mouseY, sx, sy) < 8) return { name, end };
    }
  }
  return null;
}

function mousePressed(e) {
  if (e && e.target !== drawingContext.canvas) return; // clicks on the checkboxes aren't drawing clicks
  const img = getImage(current());
  if (!img) return;
  if (keyIsDown(32)) { panning = { x: mouseX, y: mouseY }; return; } // Space held: pan
  dragging = firstClick ? null : endUnderMouse(img);
  if (!dragging) clickToDraw(img);
}

function mouseDragged() {
  const img = getImage(current());
  if (panning) {
    view.x += mouseX - panning.x; view.y += mouseY - panning.y;
    panning = { x: mouseX, y: mouseY };
  } else if (dragging && img) {
    const p = snap(mouseInImage(), img), s = ann()[dragging.name];
    s[dragging.end] = p.x / img.width; // sideways: this end
    s.y = p.y / img.height;            // up or down: the whole line
  }
}

function mouseReleased() {
  if (dragging) {
    const s = ann()[dragging.name];
    if (s.x1 > s.x2) [s.x1, s.x2] = [s.x2, s.x1];
    persist();
  }
  dragging = null; panning = null;
}

function updateCursor(img) {
  const c = panning || keyIsDown(32) ? 'grab'
    : dragging || (img && !firstClick && endUnderMouse(img)) ? 'move'
    : img && onImage(mouseInImage(), img) ? 'crosshair' : 'default';
  if (drawingContext.canvas.style.cursor !== c) drawingContext.canvas.style.cursor = c;
}

// ---- 5. save ----

function persist() {
  const id = current().id;
  saveAnnotation(id, annotations[id]); // common.js: writes this image's record to data/annotations.json
  if (annotations[id] && !Object.keys(annotations[id]).length) delete annotations[id];
}

// ---- 6. the loupe: a zoomed view of the exact pixels you're placing, beside the cursor ----

const LOUPE_N = 15, LOUPE_CELL = 7; // pixels shown across, and the screen size of each

function drawLoupe(img, a) {
  if (panning || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  const f = loupeFocus(img, a);
  if (!f) return;
  const size = LOUPE_N * LOUPE_CELL, half = (LOUPE_N - 1) / 2;
  const sx = f.x - half, sy = f.y - half;              // top-left source pixel shown
  let bx = mouseX + 24, by = mouseY + 24;              // below-right of the cursor,
  if (bx + size > width - 8) bx = mouseX - 24 - size;  // flipped near the window's edges
  if (by + size > height - 8) by = mouseY - 24 - size;

  push(); // p5's push/pop (not the canvas's save/restore) so p5's remembered colors stay correct
  drawingContext.beginPath(); drawingContext.rect(bx, by, size, size); drawingContext.clip();
  fill(0); noStroke(); rect(bx, by, size, size); // shows beyond the image's edge
  drawingContext.imageSmoothingEnabled = false;   // hard-edged pixels, no blur
  drawingContext.drawImage(img.canvas, sx, sy, LOUPE_N, LOUPE_N, bx, by, size, size);
  drawingContext.imageSmoothingEnabled = true;
  stroke(255, 30); strokeWeight(1);
  for (let k = 1; k < LOUPE_N; k++) {
    line(bx + k * LOUPE_CELL, by, bx + k * LOUPE_CELL, by + size);
    line(bx, by + k * LOUPE_CELL, bx + size, by + k * LOUPE_CELL);
  }
  for (const name of ['upper', 'lower']) { // lines passing through the loupe
    const s = a[name];
    if (!s) continue;
    const y = by + (floor(s.y * img.height) - sy + 0.5) * LOUPE_CELL;
    stroke(...COLORS[name]); strokeWeight(1.5);
    line(bx + (floor(s.x1 * img.width) - sx) * LOUPE_CELL, y, bx + (floor(s.x2 * img.width) - sx + 1) * LOUPE_CELL, y);
  }
  const cx = bx + half * LOUPE_CELL, cy = by + half * LOUPE_CELL; // the target pixel
  noFill(); stroke(0); strokeWeight(3); rect(cx, cy, LOUPE_CELL, LOUPE_CELL);
  stroke(255); strokeWeight(1); rect(cx, cy, LOUPE_CELL, LOUPE_CELL);
  pop();
  noFill(); stroke(255); strokeWeight(1); rect(bx, by, size, size);
}

// The pixel the loupe centers on: the line end you're placing or adjusting (on the line's height even
// if the mouse drifts), otherwise the pixel under the mouse. Null when there's nothing to show.
function loupeFocus(img, a) {
  const m = mouseInImage();
  const end = dragging || (!firstClick && endUnderMouse(img));
  if (end) return { x: floor(a[end.name][end.end] * img.width), y: floor(a[end.name].y * img.height) };
  if (firstClick) return { x: constrain(floor(m.x), 0, img.width - 1), y: floor(firstClick.y) };
  return onImage(m, img) ? { x: floor(m.x), y: floor(m.y) } : null;
}

// ---- 7. strips, reject, keys, and the text around the image ----

function keyPressed(e) {
  if (e && (e.metaKey || e.ctrlKey)) return; // leave browser shortcuts alone
  if (key === 'u' || key === 'U') { mode = 'upper'; firstClick = null; }
  else if (key === 'l' || key === 'L') { mode = 'lower'; firstClick = null; }
  else if (keyCode === ESCAPE) firstClick = null;
  else if (keyCode === BACKSPACE || keyCode === DELETE) {
    if (firstClick) firstClick = null; else { delete ann()[mode]; persist(); }
  }
  else if (key === 't' || key === 'T') toggleStrip('top');
  else if (key === 'm' || key === 'M') toggleStrip('middle');
  else if (key === 'b' || key === 'B') toggleStrip('bottom');
  else if (key === 'x' || key === 'X') { ann().reject = !ann().reject; if (!ann().reject) delete ann().reject; persist(); }
  else if (key === 'n' || key === 'N') nextUnannotated();
  else if (key === 'f' || key === 'F') fittedTo = null;
  else if (keyCode === RIGHT_ARROW) go(idx + 1);
  else if (keyCode === LEFT_ARROW) go(idx - 1);
  return false;
}

function toggleStrip(role) {
  const a = annotations[current().id] || {};
  if (a.reject || !available(a, role)) return;
  a.no = a.no || [];
  a.no = a.no.includes(role) ? a.no.filter(r => r !== role) : [...a.no, role];
  if (!a.no.length) delete a.no;
  persist();
}

function nextUnannotated() {
  for (let k = 1; k <= images.length; k++) {
    const i = (idx + k) % images.length, a = annotations[images[i].id];
    if (!a || (!a.upper && !a.lower && !a.reject)) { go(i); break; }
  }
}

// Each strip's top and bottom, in image pixels.
function strips(a, img) {
  const out = {}, yU = a.upper && a.upper.y * img.height, yL = a.lower && a.lower.y * img.height;
  if (a.upper) out.top = [0, yU];
  if (available(a, 'middle')) out.middle = [yU, yL];
  if (a.lower) out.bottom = [yL, img.height];
  return out;
}

function dimExcludedStrips(a, img) {
  const st = strips(a, img);
  noStroke(); fill(0, 175);
  for (const role in st) if (a.no && a.no.includes(role)) rect(0, st[role][0], img.width, st[role][1] - st[role][0]);
}

// All text is drawn with blendMode(DIFFERENCE): white text shows the inverse of whatever is behind it.
// Secondary text is white at half opacity.
function drawText(a, img) {
  push();
  blendMode(DIFFERENCE);
  noStroke();
  drawCaption(a, img);
  drawControls();
  blendMode(BLEND);
  pop();
  updateCheckboxes(a, img);
}

// Left edge: a checkbox for each strip the lines make, level with where that strip starts.
// Ticked = in the dataset. Untick it (or press T / M / B) to leave that strip out.
function updateCheckboxes(a, img) {
  const st = img ? strips(a, img) : {};
  for (const role of ROLES) {
    const cb = checkboxes[role];
    if (!st[role]) { cb.hide(); continue; }
    cb.show();
    cb.position(MARGIN, constrain(view.y + st[role][0] * view.s + MARGIN, MARGIN, height - 140) - 12);
    cb.checked(!a.reject && !(a.no && a.no.includes(role)));
    cb.elt.querySelector('input').disabled = !!a.reject;
  }
}

// Bottom left: position in the collection, then the artwork's title and artist.
function drawCaption(a, img) {
  const e = current(), state = img ? '' : imgCache[e.id]?.failed ? ' · couldn’t load this image: press → to skip' : ' · loading…';
  const y = height - MARGIN;
  textAlign(LEFT, BASELINE);
  fill(255); textStyle(NORMAL);
  text(shortLine([e.artist, e.date].filter(Boolean).join(', ')), MARGIN, y);
  textStyle(ITALIC);
  text(shortLine(e.title || ''), MARGIN, y - LEADING);
  textStyle(NORMAL); fill(255, 128);
  text(`${idx + 1}/${images.length}${a.reject ? ' · rejected' : ''}${state}`, MARGIN, y - 2 * LEADING);
}

// Bottom right: the keys, all at half opacity. The line you're drawing is shown in its color.
function drawControls() {
  const rows = [['u', 'upper line', 'upper'], ['l', 'lower line', 'lower'], ['⌫', 'delete line'],
    ['x', 'reject'], ['← →', 'prev/next'], ['n', 'next unannotated']];
  textAlign(RIGHT, BASELINE); textStyle(NORMAL);
  rows.forEach(([k, label, line], i) => {
    const y = height - MARGIN - (rows.length - 1 - i) * LEADING;
    fill(...(line === mode ? COLORS[line] : [255]), 128);
    text(`${k}  ${label}`, width - MARGIN, y);
  });
}
