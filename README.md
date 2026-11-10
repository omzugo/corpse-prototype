# Exquisite Corpse (phase 1 prototype)

Start the local server, then open http://localhost:8000 in a browser:

    python3 server.py

- **Annotator** (`annotator.html`): mark upper and lower seams. Saves on every click to `data/annotations.json`.
- **Compositor** (`compositor.html`): stacks seam-matched top / middle / bottom strips. S saves a PNG.
- **More images**: `python3 seed.py` fetches more public-domain candidates (edit the query lists at the top).

`data/annotations.json` is the valuable part. It carries over to the phase 2 rebuild. See `DECISIONS.md`.

## Live site

The compositor is published at https://omzugo.github.io/corpse-prototype/ (GitHub Pages, from the
`gh-pages` branch). To update it after annotating more images:

    sh publish_site.sh

That rebuilds `site/` with web-sized copies (1600px) of every image that can appear in a figure, and
pushes it. The annotator isn't published; it only runs on this computer.
