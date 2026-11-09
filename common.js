// Shared helpers for annotator and compositor.
// Annotation format (data/annotations.json), all numbers are fractions 0..1 of the image's size:
// { "<imageId>": { "upper": { "y", "x1", "x2" },   <- a horizontal line: its height, left end, right end
//                  "lower": { "y", "x1", "x2" },
//                  "reject": true?,
//                  "no": ["top"]? } }              <- strips this image must not supply (e.g. a headless middle)
const ROLES = ['top', 'middle', 'bottom'];

// Older records stored each line as two points, { l: {x, y}, r: {x, y} }. Convert those as they're read,
// so a tab still running older code can't leave the file in a mix of formats.
function normalizeRecord(a) {
  if (!a) return a;
  for (const k of ['upper', 'lower']) {
    const s = a[k];
    if (s && s.l) a[k] = { y: (s.l.y + s.r.y) / 2, x1: Math.min(s.l.x, s.r.x), x2: Math.max(s.l.x, s.r.x) };
  }
  return a;
}

// Which strips the lines make possible, before any exclusions.
function available(a, role) {
  if (!a) return false;
  if (role === 'top') return !!a.upper;
  if (role === 'bottom') return !!a.lower;
  return !!(a.upper && a.lower) && a.lower.y - a.upper.y > 0.005;
}

function canSupply(a, role) {
  if (!a || a.reject || (a.no && a.no.includes(role))) return false;
  return available(a, role);
}

// Caption text, made safe to put in HTML.
function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A caption line cut to at most 35 characters, ending in "…" when shortened.
function shortLine(s) {
  return s.length <= 35 ? s : s.slice(0, 34).trimEnd() + '…';
}

// The same as HTML; hovering a shortened line shows it in full.
function fitLine(s) {
  if (s.length <= 35) return escapeHTML(s);
  return `<span class="cut" title="${escapeHTML(s)}">${escapeHTML(shortLine(s))}</span>`;
}

async function loadData() {
  const images = await (await fetch('data/images.json')).json();
  let annotations = {};
  const res = await fetch('data/annotations.json');
  if (res.ok) annotations = await res.json();
  for (const id in annotations) normalizeRecord(annotations[id]);
  return { images, annotations };
}

// Annotator and compositor tabs talk over this channel, so the compositor redraws as seams change.
const channel = new BroadcastChannel('annotations');

// Saves one image's record (or removes it when the record is empty), and tells other open tabs.
function saveAnnotation(id, record) {
  const empty = !record || !Object.keys(record).length;
  channel.postMessage({ id, record: empty ? null : record });
  return fetch('save', { method: 'POST', body: JSON.stringify({ id, record: empty ? null : record }) });
}

// A line in the image's own pixels: its height, the middle of its two ends, and its width.
function seamPx(seam, img) {
  return { y: seam.y * img.height, cx: (seam.x1 + seam.x2) / 2 * img.width, w: (seam.x2 - seam.x1) * img.width };
}

const imgCache = {};

// Free every cached image except the ones listed. Big paintings take ~36 MB each once decoded,
// so keeping everything you've browsed eventually stops the browser loading new ones.
function keepOnlyImages(ids) {
  const keep = new Set(ids);
  for (const id in imgCache) {
    if (keep.has(id)) continue;
    const img = imgCache[id].img;
    if (img && img.canvas) { img.canvas.width = 0; img.canvas.height = 0; } // release the pixels now
    delete imgCache[id];
  }
}
function getImage(entry, onReady) {
  if (imgCache[entry.id]) {
    if (imgCache[entry.id].ready && onReady) onReady(imgCache[entry.id].img);
    return imgCache[entry.id].ready ? imgCache[entry.id].img : null;
  }
  // Load with the browser's own <img>, then copy into a p5.Image. (p5's loadImage first fetches each
  // file just to sniff its type and never reads the rest; with big paintings those half-read downloads
  // pile up until the browser's six connections to the server are all stuck and nothing else loads.)
  const slot = imgCache[entry.id] = { ready: false, img: null };
  const el = new Image();
  el.onload = () => {
    if (imgCache[entry.id] !== slot) return; // dropped from the cache while loading
    const img = createImage(el.naturalWidth, el.naturalHeight);
    img.drawingContext.drawImage(el, 0, 0);
    img.modified = true;
    slot.ready = true; slot.img = img;
    if (onReady) onReady(img);
  };
  el.onerror = () => { slot.failed = true; };
  el.src = entry.file || entry.url;
  return null;
}
