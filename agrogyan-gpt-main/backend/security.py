from contextlib import contextmanager
"""Revocable opaque sessions; identity is never accepted from the browser."""
import hashlib
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse

from fastapi import HTTPException, Request

SESSION_DB = Path(os.getenv('SESSION_DB_PATH', str(Path(__file__).parent / 'knowledge' / 'sessions.sqlite3')))
COOKIE = 'agro_session'
_lock = Lock()
_limits = defaultdict(deque)

@contextmanager
def connection():
    db = sqlite3.connect(SESSION_DB, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, user_id INTEGER, role TEXT, expires REAL)')
    try:
        with db:
            yield db
    finally:
        db.close()

def issue_session(response, user_id, role):
    token = secrets.token_urlsafe(32)
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user_id, role, time.time()+43200))
    response.set_cookie(COOKIE, token, httponly=True, secure=os.getenv('COOKIE_SECURE', 'false') == 'true', samesite='lax', max_age=43200, path='/')

def revoke(request, response):
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE digest=?', (hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path='/')

async def authorize(request: Request):
    path = request.url.path
    if request.method == 'OPTIONS':
        return
    if path in {'/login', '/ask', '/auth/send-registration-otp', '/auth/verify-registration-otp'}:
        key = (request.client.host if request.client else 'unknown', path)
        now = time.monotonic()
        with _lock:
            # Expire inactive keys, keeping the limiter bounded on public deployments.
            for old in list(_limits):
                if not _limits[old] or _limits[old][-1] < now-60:
                    del _limits[old]
            queue = _limits[key]
            while queue and queue[0] < now-60:
                queue.popleft()
            if len(queue) >= (30 if path == '/ask' else 6):
                raise HTTPException(429, 'Too many requests. Please wait a minute.', headers={'Retry-After': '60'})
            queue.append(now)
    token = request.cookies.get(COOKIE, '')
    if request.headers.get('authorization', '').startswith('Bearer '):
        token = request.headers['authorization'][7:]
    identity = None
    if token:
        with connection() as db:
            identity = db.execute('SELECT user_id, role FROM sessions WHERE digest=? AND expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    request.state.identity = identity
    if request.method not in {'GET', 'HEAD'} and request.headers.get('origin'):
        origin = request.headers['origin']
        allowed = {str(request.base_url).rstrip('/'), *os.getenv('CORS_ORIGINS', '').split(',')}
        # Local development frontend may use a separate port.
        parsed = urlparse(origin)
        local = parsed.hostname in {'localhost', '127.0.0.1'} and request.url.hostname in {'localhost', '127.0.0.1'}
        if origin not in allowed and not local:
            raise HTTPException(403, 'Untrusted request origin')
    public_writes = {'/login', '/register', '/auth/send-registration-otp', '/auth/verify-registration-otp', '/ask', '/ai/explain-simply', '/upload-image/', '/ai/crop-doctor', '/ai/document-insights'}
    protected = (path.startswith('/admin/') or path.startswith(('/profile/', '/farm-profile', '/ai/chat-memory/')) or path in {'/questions/feed', '/shop/orders', '/market-alerts', '/dashboard-overview', '/ops/live-sync', '/ops/feed-status', '/auth/me'} or (request.method not in {'GET', 'HEAD'} and path not in public_writes))
    if protected and not identity:
        raise HTTPException(401, 'Please log in')
    if path.startswith('/admin/') or path == '/shop/orders/status':
        if not identity or identity[1] != 'admin':
            raise HTTPException(403, 'Admin access required')
    claimed = request.query_params.get('user_id')
    if 'user_id' in request.path_params:
        claimed = request.path_params['user_id']
    if 'application/json' in request.headers.get('content-type', '') and request.method not in {'GET', 'HEAD'}:
        try:
            payload = await request.json()
            if isinstance(payload, dict) and payload.get('user_id') is not None:
                claimed = payload['user_id']
        except ValueError:
            pass
    if request.method == 'POST' and path == '/upload-image/':
        form = await request.form()
        claimed = form.get('user_id') or None
    if claimed is not None:
        if not identity:
            raise HTTPException(401, 'Please log in')
        if str(claimed) != str(identity[0]):
            raise HTTPException(403, 'You can only access your own account')
    # User-scoped list handlers must never fall through to their all-users branch.
    if path in {'/shop/orders', '/market-alerts', '/dashboard-overview', '/ops/live-sync', '/ops/feed-status'} and request.method == 'GET' and claimed is None:
        raise HTTPException(422, 'user_id is required')
