// Segments: every strip in the dataset, cropped from its image, one tab per strip type.
// Click a strip to open its image in the annotator.
const ROW_H = 140;     // every strip is shown this tall, at its own proportions
const MAX_W = 480;     // very thin strips would be extremely wide: cap them, shrinking their height instead
let images = [], annotations = {};

async function start() {
  ({ images, annotations } = await loadData());
  show();
  window.addEventListener('hashchange', show);
  window.addEventListener('resize', show);
  // pick up annotation changes made in another tab when you come back to this one
  window.addEventListener('focus', async () => { ({ images, annotations } = await loadData()); show(); });
}

function show() {
  const tab = document.querySelector(`#tabs a[href="${location.hash}"]`) || document.querySelector('#tabs a');
  const role = tab.dataset.role;
  for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('active', a === tab);

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const e of images) {
    const a = annotations[e.id];
    if (!canSupply(a, role)) continue; // common.js: has the lines for this strip, and isn't excluded or rejected
    grid.appendChild(stripCell(e, a, role));
  }
}

// One strip: a box with the strip's proportions, showing just that band of the image's thumbnail.
function stripCell(e, a, role) {
  const [y0, y1] = role === 'top' ? [0, a.upper.y] : role === 'middle' ? [a.upper.y, a.lower.y] : [a.lower.y, 1];
  const grid = document.getElementById('grid'), pad = getComputedStyle(grid);
  const room = grid.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const maxW = Math.min(MAX_W, room); // never wider than the space beside the tabs
  let h = ROW_H, w = h * e.w / ((y1 - y0) * e.h);
  if (w > maxW) { h *= maxW / w; w = maxW; }
  const scale = w / e.w; // thumbnail pixels → screen pixels

  const cell = document.createElement('a');
  cell.className = 'strip';
  cell.href = 'annotator.html#' + encodeURIComponent(e.id);
  // the browser's own tooltip on hover: title, artist and date, medium, museum
  cell.title = [e.title, [e.artist, e.date].filter(Boolean).join(', '), e.medium,
    e.source === 'met' ? 'The Met' : 'Art Institute of Chicago'].filter(Boolean).join('\n');
  cell.style.width = w + 'px';
  cell.style.height = h + 'px';
  const img = document.createElement('img');
  img.src = e.thumb;
  img.loading = 'lazy'; // only load thumbnails as they scroll into view
  img.alt = '';
  img.style.width = w + 'px';
  img.style.top = -y0 * e.h * scale + 'px'; // slide the image up so the strip's band shows in the box
  cell.appendChild(img);
  return cell;
}

start();
