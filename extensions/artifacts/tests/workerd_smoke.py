"""Real local Workers runtime/asset smoke; no deployment or live D1 changes."""
import argparse
from pathlib import Path
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
assert args.output.is_dir()
root = Path(__file__).resolve().parents[3]
origin = 'http://127.0.0.1:8892'
log = (args.output / 'cf-artifact-workerd.log').open('w')
server = subprocess.Popen([
    str(root / 'node_modules/.bin/wrangler'), 'dev', '--local', '--ip', '127.0.0.1',
    '--port', '8892', '--config', 'build/maria-gifts/wrangler.json',
    '--persist-to', str(args.output / 'cf-artifact-workerd-state'),
], cwd=root, stdout=log, stderr=log, start_new_session=True, env={**os.environ, 'CI': '1'})

def request(path, method='GET', data=None):
    req = urllib.request.Request(origin + path, method=method, data=data,
        headers={'Content-Type': 'application/json', 'Origin': origin} if data else {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

try:
    for _ in range(160):
        if server.poll() is not None:
            raise RuntimeError('Wrangler exited; consult the workerd log')
        try:
            if request('/healthz')[0] == 200:
                break
        except Exception:
            pass
        time.sleep(.15)
    else:
        raise RuntimeError('Local Worker did not start')
    status, headers, body = request('/')
    assert status == 200 and b'artifact-card' in body
    assert "default-src 'none'" in headers['Content-Security-Policy']
    status, _, body = request('/maria-name/')
    assert status == 200 and b'og:image' in body and b'maria-name-og.png' in body
    for asset, mimes in [('artifacts.css', ['text/css']), ('artifact-share.js', ['application/javascript', 'text/javascript']), ('name-window.svg', ['image/svg+xml']), ('maria-name-og.png', ['image/png'])]:
        status, headers, body = request('/assets/' + asset)
        assert status == 200 and any(mime in headers['Content-Type'] for mime in mimes), (asset, status, headers['Content-Type'])
        assert body
    assert request('/maria-name/', method='HEAD')[2] == b''
    assert request('/not-an-artifact/')[0] == 404
    assert request('/inbox/')[0] == 503
    assert request('/api/exchange/submit', method='POST', data=b'{}')[0] == 503
    assert request('/maria-name/', method='POST', data=b'{}')[0] == 405
    print('Real workerd: collection, singleton permalink, raster OG, CSS/JS/SVG assets, HEAD, 404/405, and missing-authority refusals passed.')
finally:
    try:
        os.killpg(server.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(server.pid, signal.SIGKILL)
        server.wait()
    log.close()
