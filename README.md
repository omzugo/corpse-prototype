# Exquisite Corpse (phase 1 prototype)

Start the local server, then open http://localhost:8000 in a browser:

    python3 server.py

- **Annotator** (`annotator.html`): mark upper and lower seams. Saves on every click to `data/annotations.json`.
- **Compositor** (`compositor.html`): stacks seam-matched top / middle / bottom strips. S saves a PNG.
- **More images**: `python3 seed.py` fetches more public-domain candidates (edit the query lists at the top).

`data/annotations.json` is the valuable part. It carries over to the phase 2 rebuild. See `DECISIONS.md`.
