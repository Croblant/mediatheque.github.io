#!/usr/bin/env python3
"""
Serveur local pour RealSheet : fichiers statiques + relais /api/proxy.php?url=...
Usage : python3 serve.py [port]   puis ouvrir http://localhost:8000/app/realsheet.html
"""
import sys
if sys.version_info[0] < 3:
    sys.exit("Python 3 requis. Lancez :  python3 serve.py 8000   (Windows : py -3 serve.py 8000)")
import urllib.error, http.server, ipaddress, os, socket, sys, urllib.parse, urllib.request
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
MAX = 5 * 1024 * 1024
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/api/proxy.php' or u.path.startswith('/api/proxy.php/'):
            return self.proxy(urllib.parse.parse_qs(u.query).get('url', [''])[0])
        return super().do_GET()
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != '/api/getkey.php':
            return self.send_error(404)
        try:
            n = min(int(self.headers.get('Content-Length', 0)), 65536)
            body = self.rfile.read(n)
            req = urllib.request.Request('https://realsheet.net/api/getkey.php', data=body, method='POST',
                headers={'Content-Type': self.headers.get('Content-Type', 'application/x-www-form-urlencoded'),
                         'User-Agent': 'Mozilla/5.0 (compatible; RealSheet)'})
            try:
                resp = urllib.request.urlopen(req, timeout=15)
            except urllib.error.HTTPError as e:
                resp = e
            data, code = resp.read(MAX), resp.getcode() if hasattr(resp, 'getcode') else resp.code
        except Exception as e:
            print('[getkey] ECHEC : %r' % (e,))
            return self.send_error(502, 'Echec du relais getkey : ' + type(e).__name__)
        print('[getkey] realsheet.net a repondu HTTP %s (%d octets) : %r' % (code, len(data), data[:150]))
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def proxy(self, url):
        try:
            p = urllib.parse.urlparse(url)
            if p.scheme not in ('http', 'https') or not p.hostname: return self.send_error(400, 'URL invalide')
            for info in socket.getaddrinfo(p.hostname, None):
                ip = ipaddress.ip_address(info[4][0])
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return self.send_error(403, 'Adresse refusee')
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; RealSheet)'})
            data = urllib.request.urlopen(req, timeout=15).read(MAX + 1)
            if len(data) > MAX: return self.send_error(502, 'Fichier trop gros')
        except Exception as e:
            print('[proxy] ECHEC %s : %r' % (url, e))
            return self.send_error(502, 'Echec du telechargement : ' + type(e).__name__)
        print('[proxy] OK %s (%d octets)' % (url, len(data)))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)
os.chdir(os.path.dirname(os.path.abspath(__file__)))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H)
print("Serveur RealSheet demarre. Laissez cette fenetre ouverte (Ctrl+C pour arreter).")
print("Forum : http://localhost:%d/forum/forum.html" % PORT)
print("App   : http://localhost:%d/app/realsheet.html" % PORT)
try:
    srv.serve_forever()
except KeyboardInterrupt:
    print("\nArret.")
