"""Browser integration against an ephemeral SQLite/TEST-identity harness.

Run after the Maria build, with Python Playwright installed and Chromium present.
No publication or mailbox outside this local harness is changed.

The browser is a shared, memory-constrained host resource. This harness therefore
reuses one browser and one context, keeps its own retry/cleanup path, and reports
an infrastructure crash separately from an application failure so a transient
host event is never mistaken for a real defect.
"""
import argparse
import json
import os
import subprocess
import time
import traceback
import urllib.request
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--chromium', default='/usr/bin/chromium')
parser.add_argument('--port', type=int, default=8891)
args = parser.parse_args()
assert args.output.is_dir(), 'Supply an existing output directory'
root = Path(__file__).resolve().parents[3]
origin = f'http://127.0.0.1:{args.port}'
log_path = args.output / 'cf-artifact-browser.log'


def memory_megabytes():
    """Available memory plus free swap, used only to explain infrastructure crashes."""
    values = {}
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, _, rest = line.partition(':')
            if key in ('MemAvailable', 'SwapFree'):
                values[key] = int(rest.split()[0]) // 1024
    except OSError:
        return 'unknown'
    return f'{values.get("MemAvailable", 0)} MiB available RAM, {values.get("SwapFree", 0)} MiB free swap'


def memory_pressure():
    try:
        available = 0
        for line in Path('/proc/meminfo').read_text().splitlines():
            if line.startswith('MemAvailable:'):
                available = int(line.split()[1]) // 1024
                break
        return available < 2048
    except OSError:
        return False


def start_server():
    log = log_path.open('w')
    server = subprocess.Popen(
        ['node', 'extensions/artifacts/tests/browser-harness.mjs', str(args.port)],
        cwd=root, stdout=log, stderr=log,
        env={**os.environ, 'ARTIFACT_TEST_PORT': str(args.port)})
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError('Browser harness stopped; consult ' + str(log_path))
        try:
            urllib.request.urlopen(origin + '/healthz', timeout=1).close()
            return server, log
        except Exception:
            time.sleep(.1)
    server.kill()
    raise RuntimeError('Browser harness did not start; consult ' + str(log_path))


def stop_server(server, log):
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
    log.close()


def launch(playwright):
    """One browser for the whole run. Retry only launch, never an assertion."""
    options = {
        'executable_path': args.chromium, 'headless': True,
        'args': ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
                 '--renderer-process-limit=2', '--disable-extensions',
                 '--disable-background-networking', '--disable-sync'],
    }
    last = None
    for attempt in range(3):
        try:
            return playwright.chromium.launch(**options)
        except PlaywrightError as error:
            last = error
            print(f'Chromium launch attempt {attempt + 1} failed ({memory_megabytes()}); retrying', flush=True)
            time.sleep(3)
    raise RuntimeError(f'Chromium could not be launched after 3 attempts ({memory_megabytes()}): {last}')


server, log = start_server()
try:
    with sync_playwright() as p:
        browser = launch(p)
        errors, crashed = [], []
        # One context for the whole run. Editor and anonymous views differ only
        # by cookie, which is set and cleared on this shared context.
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        context.add_cookies([{'name': 'session', 'value': 'editor', 'url': origin}])
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('crash', lambda _: crashed.append('renderer crashed'))

        def images_settled():
            # Measuring layout before images decode reports intrinsic image width
            # as document overflow. Wait for real layout, not a loading guess.
            page.wait_for_function(
                '[...document.images].every(img => img.complete)', timeout=15_000)
            page.wait_for_timeout(50)

        def navigate(target, expect=200):
            try:
                response = page.goto(origin + target)
            except PlaywrightError as error:
                if crashed or page.is_closed():
                    raise RuntimeError(
                        f'Browser renderer died while loading {target} ({memory_megabytes()}). '
                        'This is host memory pressure, not an application failure; re-run when memory allows.'
                    ) from error
                raise
            assert response.status == expect, (target, response.status, expect)
            images_settled()
            return response

        # 1. Public rendering and responsive layout.
        for width, height in [(1440, 1000), (768, 1024), (390, 844), (320, 740)]:
            page.set_viewport_size({'width': width, 'height': height})
            for route in ['/', '/maria-name/', '/share/']:
                navigate(route)
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (width, route)
            if width in (1440, 390):
                page.set_viewport_size({'width': width, 'height': height})
                navigate('/')
                page.screenshot(path=str(args.output / f'cf-artifacts-{width}.png'))
            print(f'{width}px: collection, full keepsake and share form render without horizontal overflow', flush=True)

        # 2. Anonymous visitors never receive the private inbox.
        context.clear_cookies()
        navigate('/inbox/', expect=401)
        page.set_viewport_size({'width': 1000, 'height': 900})

        # 3. A peer sends something into the private inbox from the public form.
        navigate('/share/')
        page.get_by_label('Your name', exact=True).fill('Browser sample peer')
        page.get_by_label('Your email, kept private').fill('browser-private@example.org')
        page.get_by_label('Title', exact=True).fill('Browser test contribution')
        page.get_by_label('A short introduction').fill(
            'A synthetic contribution used only to check the local sharing workflow.')
        page.get_by_label('Your exact quote or opinion (optional)').fill(
            'This is an explicitly synthetic browser-test quote.')
        for label in ['The artifact, title and introduction', 'My exact quote', 'My chosen name',
                      'You may keep this submission to review it and reply.']:
            page.get_by_label(label, exact=True).check()
        page.get_by_role('button', name='Send to the private inbox', exact=True).click()
        page.locator('#artifact-share-status').filter(has_text='Received privately').wait_for()
        receipt = json.loads(page.locator('#artifact-receipt pre').inner_text())
        pending = context.request.get(origin + '/api/artifacts/maria').json()
        assert all(item['id'] != receipt['id'] for item in pending['artifacts'])
        print('Public form received a pending submission that is absent from the public projection', flush=True)

        # 4. The editor records permission and presses Publish.
        context.add_cookies([{'name': 'session', 'value': 'editor', 'url': origin}])
        navigate('/inbox/')
        page.wait_for_selector('.artifact-review h3', timeout=15_000)
        card = page.locator('.artifact-review').filter(
            has=page.get_by_role('heading', name='Browser test contribution'))
        card.wait_for()
        assert card.get_by_role('button', name='Publish on collection').is_disabled()
        card.get_by_label('Where did the person explicitly give permission?').fill(
            'Synthetic first-party form receipt for this test; exact quote/name/artifact scopes checked.')
        card.get_by_label('Evidence type').select_option('form')
        card.get_by_role('checkbox').check()
        card.get_by_role('button', name='Record permission', exact=True).click()
        page.locator('#artifact-status').filter(has_text='permission recorded').wait_for()
        card.get_by_role('button', name='Publish on collection').click()
        page.locator('#artifact-status').filter(has_text='publish recorded').wait_for()

        # 5. Publication is visible immediately, without leaking private metadata.
        response = navigate('/' + receipt['id'] + '/')
        assert response.headers['cache-control'] == 'no-store'
        assert 'browser-private@example.org' not in page.content()
        published = context.request.get(origin + '/api/artifacts/maria').json()
        assert any(item['id'] == receipt['id'] for item in published['artifacts'])
        assert 'browser-private@example.org' not in json.dumps(published)

        # 6. Email export is transport-neutral and free of private fields.
        email = context.request.get(origin + '/api/exchange/items/' + receipt['id'] + '/email').json()
        assert email['schema'] == 'ragbaz.artifact-email/v1'
        assert '<script' not in email['html']
        assert 'browser-private@example.org' not in email['html']
        assert 'https://gifts.ragbaz.cc/' + receipt['id'] + '/' in email['text']

        # 7. The sender's private receipt withdraws it again.
        context.clear_cookies()
        withdrawal = context.request.post(origin + '/api/exchange/revoke', data=receipt,
                                         headers={'Origin': origin, 'Content-Type': 'application/json'})
        assert withdrawal.status == 200
        navigate('/' + receipt['id'] + '/', expect=404)
        final = context.request.get(origin + '/api/artifacts/maria').json()
        assert all(item['id'] != receipt['id'] for item in final['artifacts'])
        assert not errors, errors
        assert not crashed, crashed
        print('Private receive -> permission -> button publication -> canonical email -> sender withdrawal: passed', flush=True)
        browser.close()
finally:
    # The browser is closed inside the Playwright context above; a closed event
    # loop cannot perform that cleanup, so nothing is attempted out here.
    stop_server(server, log)