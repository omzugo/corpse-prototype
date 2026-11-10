# Builds the live compositor site in site/ (published to GitHub Pages by publish_site.sh).
# Only images that can appear in a figure are included, as web-sized copies (WEB_SIDE px on the long
# side), so the site stays small. The annotator isn't included: it stays on this computer.
# Usage: python3 build_site.py
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
WEB_CACHE = os.path.join(HERE, "data", "web")  # web-sized copies, kept between builds
WEB_SIDE = 1600
PAGE_FILES = ["compositor.js", "common.js", "style.css"]


def can_supply(a, role):
    # Same rule as canSupply() in common.js.
    if not a or a.get("reject") or role in a.get("no", []):
        return False
    if role == "top":
        return "upper" in a
    if role == "bottom":
        return "lower" in a
    return "upper" in a and "lower" in a and a["lower"]["y"] - a["upper"]["y"] > 0.005


def web_copy(i):
    # A smaller copy of the image for the site, made once and reused.
    os.makedirs(WEB_CACHE, exist_ok=True)
    out = os.path.join(WEB_CACHE, i["id"] + ".jpg")
    if not os.path.exists(out):
        subprocess.run(["sips", "-Z", str(WEB_SIDE), "-s", "formatOptions", "80",
                        os.path.join(HERE, i["file"]), "--out", out], capture_output=True, check=True)
    return out


if __name__ == "__main__":
    images = json.load(open(os.path.join(HERE, "data", "images.json")))
    annotations = json.load(open(os.path.join(HERE, "data", "annotations.json")))
    used = [i for i in images if any(can_supply(annotations.get(i["id"]), r) for r in ("top", "middle", "bottom"))]

    shutil.rmtree(SITE, ignore_errors=True)
    os.makedirs(os.path.join(SITE, "data", "img"))
    for f in PAGE_FILES:
        shutil.copy(os.path.join(HERE, f), SITE)
    shutil.copy(os.path.join(HERE, "compositor.html"), os.path.join(SITE, "index.html"))  # the site's home page
    open(os.path.join(SITE, ".nojekyll"), "w").close()  # tell GitHub Pages to serve the files as they are

    site_images = []
    for i in used:
        shutil.copy(web_copy(i), os.path.join(SITE, "data", "img", i["id"] + ".jpg"))
        entry = {k: i[k] for k in ("id", "source", "title", "artist", "date", "medium", "page", "w", "h") if k in i}
        entry["file"] = f"data/img/{i['id']}.jpg"
        site_images.append(entry)
    json.dump(site_images, open(os.path.join(SITE, "data", "images.json"), "w"))
    json.dump({i["id"]: annotations[i["id"]] for i in used}, open(os.path.join(SITE, "data", "annotations.json"), "w"))

    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(SITE) for f in fs)
    print(f"{len(used)} images, {size / 1e6:.0f} MB in {SITE}")
