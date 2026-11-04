#!/usr/bin/env python3
"""Local dev server for the game. Usage: python3 serve.py [port]

Same as `python3 -m http.server`, except it tells browsers not to cache. Without
that, a browser can mix an old index.html with new scripts after an edit, and the
game fails to start, leaving an empty terminal.
"""

import http.server
import os
import sys
from functools import partial


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    root = os.path.dirname(os.path.abspath(__file__))
    handler = partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving http://localhost:{port}/")
        server.serve_forever()
