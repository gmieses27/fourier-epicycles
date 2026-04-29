#!/usr/bin/env python3
import http.server, socketserver, webbrowser

PORT = 8080
HOST = "127.0.0.1"

handler = http.server.SimpleHTTPRequestHandler
handler.log_message = lambda self, fmt, *args: None  # silence per-request logs

with socketserver.TCPServer((HOST, PORT), handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"Serving at {url}")
    webbrowser.open(url)
    httpd.serve_forever()
