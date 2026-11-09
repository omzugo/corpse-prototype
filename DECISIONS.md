# Decisions log

Phase 1 prototype notes. This becomes the spec for the phase 2 rebuild (the one you write yourself).
Newest entries at the bottom.

## Settled before building (2026-11-07)
- Three full-width horizontal strips stacked vertically: head / torso / legs.
- No image processing of any kind. Alignment is the art.
- Two seams per figure: **neck** and **waist**. Each seam = 2 clicks, where the left and right contour cross the cut line.
- Alignment = scale + horizontal shift only, no rotation (rotating a full-width strip leaves empty corners).
- The torso sets the canvas at its own size. Head and legs are scaled so their seam width equals the torso's, then shifted so the seam centers line up.

## Found while building the prototype
- **Met images must be cached locally.** The Met image server doesn't reliably let browser pages load its images. `seed.py` downloads everything into `data/img/`.
- **The Met's old search endpoint was retired on 2026-10-01.** Use `/public/collection/v1.1/search` (paginated).
- **A headless torso has a neck seam but can't supply a head.** Added a per-image "not a head / torso / legs" flag (keys 1 2 3 in the annotator).
- **Seam definition needs to be consistent** (written when seams were still neck/waist). Testing showed it's easy to click shoulder width on one image and neck width on another. Working rule: neck seam = the neck itself, at its narrowest. Waist seam = the hips' widest point, at the top of the thighs. Revisit after real annotation.
- **Gaps happen.** When a scaled strip is narrower than the canvas, the empty part is left dark and the compositor flags it as "% gap". The "matched" shuffle avoids gaps and heavy upscaling.

## Any form, not just bodies (2026-11-08)
- **Not always human.** A bat for a top, a church for a middle, legs for a bottom. Humans are fine, just not required. Sculpture and painting mix freely.
- **Renamed to stay neutral:** strips are **top / middle / bottom**, seams are **upper / lower** (keys U and L). Existing annotations were converted from neck/waist.
- **What a seam means now:** the two points where the form's contour crosses the cut line, whatever the form is. A church's upper seam might be where the tower meets the roof.
- **Collection round 2:** animals, buildings, vases, trees, still lifes, landscapes, chairs. 275 images, shuffled so subjects are mixed in the annotator.

## Lessons from Triad (the earlier version in ~/Desktop/Coding/Triad)
- Keep: neutral top / middle / bottom bands, any object in any band, full-width strips, Met + public domain, no generative fill.
- Borrowed: the thin dark **fold line** between bands, as an optional toggle (F in the compositor). Off by default.
- Don't repeat: matching by computer vision (CLIP embeddings, color histograms, edge density). It produced bands that sit next to each other but never actually connect at the fold. The hand-placed seams replace all of it.
- Triad also cropped the middle band as fixed slices (e.g. 30–70% of the image). Here the band is set by your two seams instead.

## Open questions to answer by annotating
- Are neck + waist the right two seams, or is a knee seam (a fourth strip) worth it?
- Does the torso need to set the canvas, or should the widest strip?
- What's the minimum annotation: do facing direction or tilt matter for good matches?
- How long does the legs strip need to be? It currently runs to the bottom of the source image.

## Precision, resolution, choosing strips (2026-11-09)
- **Imprecise clicks were a zoom problem.** The annotator now has scroll-to-zoom (centered on the cursor), drag to pan, and draggable seam points. Points are drawn as rings with a center dot so the exact spot stays visible.
- **Pixelation was a source problem.** We'd been downloading 843px images. `seed.py --hires` replaces them with the largest each museum allows (Met originals; Art Institute up to 2400px wide), capped at 2400px on the long side. Annotations are fractions of the image, so nothing had to be redone.
- **Choosing which strips an image supplies.** The old 1/2/3 toggles were hard to read. Now each strip is labeled right on the image ("TOP ✓" / "TOP excluded", with excluded strips darkened), with matching chips in the top bar. Click a chip or press T / M / B. A greyed chip means that strip needs another seam first.
  - Shortcut worth knowing: an image with only an upper seam can only ever be a top, and an image with only a lower seam can only be a bottom. Exclusion is only needed when both seams are set.
- **Saving is per image now.** Each save sends one image's record and the server merges it into the file, so two open annotator tabs can't overwrite each other.
- **Pixel loupe.** A color-picker-style magnifier follows the cursor in the annotator: 15×15 real image pixels, grid lines, the target pixel outlined in the middle, and a readout with its x/y and color. Clicks and dragged points snap to the center of that outlined pixel, so what the loupe shows is exactly where the point lands.
- **Editing from the compositor.** Click any strip in the compositor to open that image in the annotator (always the same second tab). Every save is broadcast between tabs, so with the two windows side by side the composite redraws on each click, keeping the same three images.
- **A bare compositor.** No text on the default view: white background, the figure alone. Artwork details (title, artist and date, medium, museum, strip, scale) show in the browser's own tooltip on hover. Click a strip to open the artwork's museum page (Met or Art Institute of Chicago, which is where the images come from). ⌘-click to edit its seams. The key list is hidden behind **?**.
- **Annotator redesign (from your mockups).** Black page; 12px Times New Roman; 24px margins. Artwork title (italic) and date in the bottom left, keys in the bottom right with the current line (u upper / l lower) highlighted in that line's color. A checkbox per strip on the left edge, level with where the strip starts; unchecking darkens the strip and keeps it out of the dataset.
- **Lines are strictly horizontal.** The second click only sets where the line ends; its height comes from the first click. Seam lines have no end dots: faint dashes across the window, solid color between the contour points. Drag a line to move it up/down, drag an end to move it sideways. Older slanted seams are shown level at their average height and saved level once edited. Seam colors: upper light blue, lower orange.
- **The loupe is just the zoom square**, centered on the cursor (it replaces the cursor over the image). No coordinates or color readout.
- **Collection round 3: portrait and animal paintings, high resolution.** 206 new paintings (Met European Paintings department + Art Institute paintings), every one 3000px on its long side. Searches skip anything whose original is under 2000px. New images go at the end of the list so existing order and annotations are untouched. 481 images total.
- **Image loading fix.** p5's `loadImage` fetches every file twice: once only to sniff its type, without reading the rest of the download. With 3000px paintings those half-read downloads used up Chrome's six connections to the local server and loading froze. Images now load through the browser's own `<img>` and are copied into a p5 image. The annotator also keeps only the current image and its neighbors in memory.
- **Compositor credits and locking.** All three artworks' credits stay stacked in the bottom left (top, middle, bottom), each title an italic link to its museum page. Clicking a strip locks or unlocks it (shown as "locked" under its credit), so Space only replaces the unlocked strips. ⌘-click still opens the annotator.

## Annotator refactor, toward the phase 2 rebuild (2026-11-09)
- **Lines are stored as `{ y, x1, x2 }`** (fractions of the image) instead of two points. All 387 existing lines were converted; the original file is `data/annotations.backup-before-refactor-2026-11-09.json`. Both pages also convert the old shape when reading, in case an unreloaded tab saves one.
- **Zoom draws in image coordinates.** One `translate()` + `scale()` puts the image, lines and preview on screen; the only conversion left is mouse → image pixels. Scroll zooms around the cursor.
- **One kind of handle.** You only grab line ends: sideways moves that end, up/down moves the whole line. Panning is hold Space and drag.
- **All text is drawn on the canvas** with `blendMode(DIFFERENCE)`, instead of HTML laid over it. The strip checkboxes are drawn too (click them or press T / M / B). Lost: hovering a shortened caption line no longer shows it in full.
- **The file is laid out in the build order** (1 show and move through images · 2 zoom and pan · 3 draw a line · 4 drag ends · 5 save · 6 loupe · 7 strips, keys, text). Shared plumbing (loading, saving, image cache, the compositor link) stays in `common.js` as given code.
- About 295 lines of code (plus comments), down from about 340 plus the HTML/CSS overlays. Less of a cut than hoped: the loupe (~45 lines) and the text drawing (~60) are the biggest pieces left.

## Segments grid (2026-11-09)
- **`segments.html`**: every strip in the dataset, cropped from its image, under three tabs (Tops / Middles / Bottoms). White page, no text besides the tabs. Strips sit in rows at one height (140px) and their own proportions, with plain 24px gaps; very thin, wide strips are capped in width and shrink in height instead. Click a strip to annotate its image. Only strips the compositor would use appear (lines present, not excluded, not rejected).
- **Thumbnails.** The grid uses 800px copies in `data/thumb/` (`python3 seed.py --thumbs`; new fetches make them automatically), and each image's size is stored in `images.json` (`w`, `h`) so strips can be cropped before anything loads.

## Compositor simplified, toward the phase 2 rebuild (2026-11-09)
- **Layout from the annotations alone.** Each image's proportions are in `images.json`, so the figure is worked out before any image loads; only the three images on screen are loaded (first figure in ~50 ms instead of loading every annotated image).
- **Full width only.** No cropped view, no `W`; the figure is as wide as its widest strip.
- **Random picks.** Space picks a random top, middle and bottom (locked strips stay; it avoids reusing one artwork when it can). The 400-try matching score, and `R`, are gone. Not checked any more: heavy upscaling, so a tiny top under a big middle can look soft.
- **Removed:** fold lines (F), seam guides (G), the S key (the download button does it), the ? key panel, and the live link from the annotator (the compositor re-reads annotations when you come back to its tab).
- **Kept:** click to lock, ⌘-click to annotate, credits with links, download (full resolution, transparent beside narrower strips), day/night, 24px margins.
- About 126 lines of code, down from 186, laid out in build order (1 pick · 2 line up the seams · 3 draw · 4 new figures and locking · 5 credits · 6 download and day/night).
