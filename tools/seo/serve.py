#!/usr/bin/env python3
"""Minimal Cloudflare-Pages-like static server for site-deploy/ (extensionless HTML, .md as text/markdown)."""
import http.server, os, sys, functools
ROOT = sys.argv[1] if len(sys.argv) > 1 else 'site-deploy'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8799
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml'}
    def translate_path(self, path):
        p = super().translate_path(path.split('?')[0])
        if os.path.exists(p + '.html') and not p.endswith('.html'): return p + '.html'
        return p
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Strict-Transport-Security', 'max-age=31536000'); self.send_header('X-Content-Type-Options', 'nosniff'); self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT)).serve_forever()
