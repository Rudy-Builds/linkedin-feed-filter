#!/usr/bin/env python3
"""Serve the extension files plus the mock feed, for testing without LinkedIn.

    python3 test/serve.py            # http://localhost:8765/feed/  (mock feed + in-page tests)
                                     # http://localhost:8765/popup-preview.html  (popup UI)

Then in the browser console on /feed/:   await window.runLfTests()
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/feed", "/feed/", "/feed/index.html"):
            return self._send_file(os.path.join(ROOT, "test", "mock-feed.html"))
        if path == "/popup-preview.html":
            with open(os.path.join(ROOT, "popup.html"), encoding="utf-8") as f:
                html = f.read().replace(
                    '<script src="defaults.js">',
                    '<script src="/test/shim.js"></script><script src="defaults.js">')
            return self._send_bytes(html.encode("utf-8"), "text/html; charset=utf-8")
        return super().do_GET()

    def _send_file(self, file_path):
        with open(file_path, "rb") as f:
            self._send_bytes(f.read(), "text/html; charset=utf-8")

    def _send_bytes(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving on http://localhost:{PORT}/feed/", flush=True)
        httpd.serve_forever()
