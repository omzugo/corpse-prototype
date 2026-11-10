# Fetches candidate public-domain figure images from the Met and the Art Institute of Chicago
# and writes data/images.json. Prototype code: run once, re-run to add more.
# Usage: python3 seed.py          (fetch more images)
#        python3 seed.py --hires  (upgrade existing images to high resolution)
#        python3 seed.py --thumbs (make small copies for the segments grid)
import json, os, random, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "images.json")

# Already fetched (2026-11-07): Met "marble statue", "standing figure", "full-length portrait", "kouros",
# "bronze statuette"; AIC "full-length portrait", "standing figure", "standing woman", "statue".
# Round 2 (2026-11-08): any form, not just bodies. Met "bat", "owl", "heron", "horse", "lion", "fish",
# "church", "tower", "vase", "candlestick", "tree", "armor"; AIC "bat", "bird", "dog", "cathedral",
# "lighthouse", "tree", "vase", "column", "still life", "landscape", "saint", "chair".
# Round 3 (2026-11-09): portrait and animal paintings only. Met (European Paintings) and AIC (paintings)
# "portrait", "portrait of a woman", "portrait of a man", "young woman" / "self-portrait", "boy", "girl",
# "dog", "horse", "cat", "cow" / "cattle", "sheep", "deer", "bird", "lion", "rooster" / "rabbit".
# Round 4 (2026-11-09): figurines. Met "figurine", "statuette", "terracotta figure", "bronze figure",
# "ivory figure", "porcelain figure"; AIC (sculpture) "figurine", "statuette", "figure", "standing figure",
# "seated figure", "tomb figure".
# Round 5: 20 more figurines, high resolution only.
MET_QUERIES = ["seated figure", "standing female figure"]
AIC_QUERIES = ["female figure", "male figure"]
PER_QUERY = 5
MET_DEPARTMENT = None          # e.g. 11 for European Paintings; None searches the whole museum
AIC_ARTWORK_TYPE = "Sculpture" # e.g. "Painting"; None for any kind of artwork
MIN_LONG_SIDE = 2000           # skip images whose original is smaller than this


def get(url, tries=3):
    # The Met's firewall returns 403 when requests come too fast, so back off and retry.
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "exquisite-corpse-prototype"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 403 or attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def met(images, seen):
    for q in MET_QUERIES:
        params = {"q": q, "hasImages": "true", "limit": 60}
        if MET_DEPARTMENT:
            params["departmentId"] = MET_DEPARTMENT
        url = "https://collectionapi.metmuseum.org/public/collection/v1.1/search?" + urllib.parse.urlencode(params)
        try:
            ids = get(url).get("objectIDs") or []
        except Exception as e:
            print(f"met '{q}' search failed: {e}")
            continue
        added = 0
        for oid in ids:
            if added >= PER_QUERY:
                break
            key = f"met-{oid}"
            if key in seen:
                continue
            try:
                o = get(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}")
            except Exception:
                continue
            time.sleep(0.3)
            if not o.get("isPublicDomain") or not o.get("primaryImageSmall"):
                continue
            images.append({
                "id": key,
                "source": "met",
                "title": o.get("title", ""),
                "artist": o.get("artistDisplayName", ""),
                "date": o.get("objectDate", ""),
                "medium": o.get("medium", ""),
                "url": o["primaryImageSmall"],
                "page": o.get("objectURL", ""),
            })
            seen.add(key)
            added += 1
        print(f"met '{q}': +{added}")


def aic(images, seen):
    for q in AIC_QUERIES:
        params = {"q": q, "limit": 60,
                  "fields": "id,title,artist_title,date_display,medium_display,image_id,is_public_domain,thumbnail"}
        if AIC_ARTWORK_TYPE:
            params["query[term][artwork_type_title.keyword]"] = AIC_ARTWORK_TYPE
        url = "https://api.artic.edu/api/v1/artworks/search?" + urllib.parse.urlencode(params)
        added = 0
        for o in get(url)["data"]:
            if added >= PER_QUERY:
                break
            key = f"aic-{o['id']}"
            if key in seen or not o.get("is_public_domain") or not o.get("image_id"):
                continue
            t = o.get("thumbnail") or {}  # AIC reports the original's size here
            if max(t.get("width") or 0, t.get("height") or 0) < MIN_LONG_SIDE:
                continue
            images.append({
                "id": key,
                "source": "aic",
                "title": o.get("title", ""),
                "artist": o.get("artist_title") or "",
                "date": o.get("date_display", ""),
                "medium": o.get("medium_display", ""),
                "url": f"https://www.artic.edu/iiif/2/{o['image_id']}/full/843,/0/default.jpg",
                "page": f"https://www.artic.edu/artworks/{o['id']}",
            })
            seen.add(key)
            added += 1
        print(f"aic '{q}': +{added}")


def download(images):
    # Cache every image locally: the Met's image server doesn't reliably allow browser loading.
    folder = os.path.join(HERE, "data", "img")
    os.makedirs(folder, exist_ok=True)
    for i in images:
        path = os.path.join(folder, i["id"] + ".jpg")
        if not os.path.exists(path):
            try:
                req = urllib.request.Request(i["url"], headers={"User-Agent": "exquisite-corpse-prototype"})
                with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                    f.write(r.read())
            except Exception as e:
                print("failed", i["id"], e)
                continue
        i["file"] = f"data/img/{i['id']}.jpg"


MAX_SIDE = 3000


def hires_url(i):
    # Largest image each museum will give us. AIC refuses some sizes per image, so try a few.
    if i["source"] == "aic":
        image_id = i["url"].split("/iiif/2/")[1].split("/")[0]
        return [f"https://www.artic.edu/iiif/2/{image_id}/full/{w},/0/default.jpg" for w in (3000, 2400, 1686)]
    o = get(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{i['id'][4:]}")
    time.sleep(0.3)
    return [o["primaryImage"]] if o.get("primaryImage") else []


def upgrade(images):
    # Replace each cached image with a high-resolution copy, longest side capped at MAX_SIDE.
    # Annotations are stored as fractions of the image, so they stay valid.
    for n, i in enumerate(images):
        if i.get("hires"):
            continue
        path = os.path.join(HERE, i["file"])
        try:
            urls = hires_url(i)
        except Exception as e:
            print("no hires url", i["id"], e)
            continue
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "exquisite-corpse-prototype"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
            except Exception:
                continue
            tmp = path + ".tmp.jpg"
            open(tmp, "wb").write(data)
            subprocess.run(["sips", "-Z", str(MAX_SIDE), tmp], capture_output=True)  # macOS resize
            os.replace(tmp, path)
            i["hires"] = True
            break
        print(f"{n + 1}/{len(images)} {i['id']} {'ok' if i.get('hires') else 'kept low-res'}", flush=True)
        if n % 10 == 0:
            json.dump(images, open(OUT, "w"), indent=1)
    json.dump(images, open(OUT, "w"), indent=1)


def big_enough(i):
    # Drop new images whose best available copy is still small (the Met doesn't report sizes up front).
    path = os.path.join(HERE, i["file"])
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], capture_output=True, text=True).stdout
    w, h = (int(n) for n in re.findall(r"pixel(?:Width|Height): (\d+)", out))
    if max(w, h) >= MIN_LONG_SIDE:
        return True
    os.remove(path)
    print("too small, dropped", i["id"], f"{w}x{h}")
    return False


THUMB_SIDE = 800


def thumbnails(images):
    # Small copies for the segments grid (data/thumb/), plus each image's size (w, h) so the grid can
    # crop strips without loading the full image first. Skips thumbnails that are already there.
    folder = os.path.join(HERE, "data", "thumb")
    os.makedirs(folder, exist_ok=True)
    for i in images:
        thumb = os.path.join(folder, i["id"] + ".jpg")
        if not os.path.exists(thumb):
            subprocess.run(["sips", "-Z", str(THUMB_SIDE), os.path.join(HERE, i["file"]), "--out", thumb], capture_output=True)
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", thumb], capture_output=True, text=True).stdout
        i["w"], i["h"] = (int(n) for n in re.findall(r"pixel(?:Width|Height): (\d+)", out))
        i["thumb"] = f"data/thumb/{i['id']}.jpg"
    json.dump(images, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    images = json.load(open(OUT)) if os.path.exists(OUT) else []
    if "--hires" in sys.argv:  # upgrade existing images only
        upgrade(images)
        sys.exit()
    if "--thumbs" in sys.argv:  # make thumbnails for existing images only
        thumbnails(images)
        sys.exit()
    seen = {i["id"] for i in images}
    old = len(images)
    met(images, seen)
    aic(images, seen)
    new = images[old:]
    download(new)
    new = [i for i in new if "file" in i]
    random.shuffle(new)  # mix subjects so the annotator doesn't show 12 owls in a row
    images = images[:old] + new  # existing images keep their order
    json.dump(images, open(OUT, "w"), indent=1)
    upgrade(images)
    images = [i for i in images[:old]] + [i for i in images[old:] if big_enough(i)]
    json.dump(images, open(OUT, "w"), indent=1)
    thumbnails(images)
    print(f"+{len(images) - old} new, {len(images)} images in {OUT}")
