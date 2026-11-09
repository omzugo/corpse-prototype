# Serves this folder at http://localhost:8000 and lets the annotator save
# data/annotations.json to disk (POST /save). Usage: python3 server.py
import http.server, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ANNOTATIONS = os.path.join(HERE, "data", "annotations.json")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/save":
            self.send_error(404)
            return
        # Body is one image's record: {"id": ..., "record": {...} or null}. Merging per image means
        # two open annotator tabs can't overwrite each other's work.
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        data = json.load(open(ANNOTATIONS)) if os.path.exists(ANNOTATIONS) else {}
        if "id" not in body:  # an annotator tab opened before this change sends the whole file: merge it
            data.update(body)
        elif body.get("record"):
            data[body["id"]] = body["record"]
        else:
            data.pop(body["id"], None)
        tmp = ANNOTATIONS + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f, indent=1)
        os.replace(tmp, ANNOTATIONS)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    print("http://localhost:8000")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
