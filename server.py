#!/usr/bin/env python3
import json
import os
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from passlib.context import CryptContext
from sqlalchemy import Column, MetaData, String, Table, Text, create_engine, inspect, select, text

BASE_DIR = Path(__file__).parent
DB_FILE = BASE_DIR / 'khushii.db'


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


APP_ENV = os.getenv('APP_ENV', 'development').strip().lower()
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{DB_FILE}')
SESSION_COOKIE = os.getenv('SESSION_COOKIE_NAME', 'khushii_session')
SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE', 'lax')
SESSION_COOKIE_SECURE = env_flag('SESSION_COOKIE_SECURE', APP_ENV == 'production')
SESSION_COOKIE_MAX_AGE = int(os.getenv('SESSION_COOKIE_MAX_AGE', str(60 * 60 * 24 * 30)))
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '').strip()
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')
google_request = google_requests.Request()

engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {},
    future=True,
)
metadata = MetaData()

users = Table(
    'users', metadata,
    Column('email', String, primary_key=True),
    Column('name', String, nullable=False),
    Column('password_hash', String, nullable=False),
    Column('google_sub', String, nullable=True),
    Column('created_at', String, nullable=False),
)
profiles = Table(
    'profiles', metadata,
    Column('email', String, primary_key=True),
    Column('data', Text, nullable=False),
)
sessions = Table(
    'sessions', metadata,
    Column('session_id', String, primary_key=True),
    Column('email', String, nullable=False),
    Column('created_at', String, nullable=False),
)
metadata.create_all(engine)


def ensure_schema() -> None:
    columns = {col['name'] for col in inspect(engine).get_columns('users')}
    if 'google_sub' not in columns:
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE users ADD COLUMN google_sub VARCHAR'))


ensure_schema()

app = FastAPI()
app.mount('/static', StaticFiles(directory='static'), name='static')
app.mount('/pages', StaticFiles(directory='pages'), name='pages')


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def legacy_hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    if not hashed or hashed.startswith('!'):
        return False
    if len(hashed) == 64 and all(c in '0123456789abcdef' for c in hashed.lower()):
        return legacy_hash_password(password) == hashed
    return pwd_context.verify(password, hashed)


def needs_password_rehash(hashed: str) -> bool:
    if not hashed or hashed.startswith('!'):
        return True
    if len(hashed) == 64 and all(c in '0123456789abcdef' for c in hashed.lower()):
        return True
    return pwd_context.needs_update(hashed)


def unusable_password_hash() -> str:
    return '!' + uuid.uuid4().hex


def normalize_email(email: str) -> str:
    email = (email or '').strip().lower()
    if not email or '@' not in email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Valid email is required')
    return email


def normalize_name(name: Optional[str], fallback_email: str) -> str:
    cleaned = (name or '').strip()
    return cleaned[:80] if cleaned else fallback_email.split('@')[0]


def require_password(password: str) -> str:
    cleaned = (password or '').strip()
    if len(cleaned) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Password must be at least 8 characters')
    return cleaned


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite=SESSION_COOKIE_SAMESITE,
        secure=SESSION_COOKIE_SECURE,
        path='/',
        max_age=SESSION_COOKIE_MAX_AGE,
    )


def create_default_profile(email: str, name: Optional[str] = None) -> Dict[str, Any]:
    return {
        'name': name or email.split('@')[0],
        'email': email,
        'xp': 0,
        'sessionXp': 0,
        'streak': 0,
        'totalLessons': 0,
        'level': 1,
        'avi': '🌸',
        'moodDone': False,
        'unlockAll': False,
        'done': {},
        'activitiesDone': [],
        'journal': [],
        'affIdx': 0,
        'affLoved': [],
        'settings': {'notif': False},
        'modProgress': {'bounds': 3, 'bicul': 1, 'family': 0},
        'initialised': False,
        'createdAt': datetime.utcnow().isoformat() + 'Z',
    }


def get_email_for_session(session_id: str) -> Optional[str]:
    with engine.connect() as conn:
        row = conn.execute(select(sessions.c.email).where(sessions.c.session_id == session_id)).first()
        return row[0] if row else None


def get_profile(email: str) -> Dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(select(profiles.c.data).where(profiles.c.email == email)).first()
        if row and row[0]:
            profile = json.loads(row[0])
            profile.pop('anonPost', None)
            profile.pop('communityPosts', None)
            profile.pop('communityKey', None)
            profile.pop('likedPosts', None)
            return profile
        return create_default_profile(email)


def save_profile(email: str, profile: Dict[str, Any]) -> None:
    clean_profile = dict(profile)
    clean_profile.pop('anonPost', None)
    clean_profile.pop('communityPosts', None)
    clean_profile.pop('communityKey', None)
    clean_profile.pop('likedPosts', None)
    serialized = json.dumps(profile, ensure_ascii=False)
    with engine.begin() as conn:
        existing = conn.execute(select(profiles.c.email).where(profiles.c.email == email)).first()
        if existing:
            conn.execute(profiles.update().where(profiles.c.email == email).values(data=json.dumps(clean_profile, ensure_ascii=False)))
        else:
            conn.execute(profiles.insert().values(email=email, data=json.dumps(clean_profile, ensure_ascii=False)))


def create_session(email: str) -> str:
    session_id = uuid.uuid4().hex
    with engine.begin() as conn:
        conn.execute(sessions.insert().values(session_id=session_id, email=email, created_at=datetime.utcnow().isoformat() + 'Z'))
    return session_id


def require_current_email(request: Request) -> str:
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required')
    email = get_email_for_session(session_id)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required')
    return email


@app.get('/')
def index() -> FileResponse:
    return FileResponse(str(BASE_DIR / 'khushii.html'))


@app.get('/api/health')
def api_health():
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    return {'status': 'ok', 'environment': APP_ENV}


@app.get('/api/config')
def api_config():
    return {
        'googleEnabled': bool(GOOGLE_CLIENT_ID),
        'googleClientId': GOOGLE_CLIENT_ID,
    }


@app.get('/api/profile')
def api_get_profile(request: Request):
    email = require_current_email(request)
    return JSONResponse(get_profile(email))


@app.post('/api/profile')
def api_save_profile(request: Request, profile: Dict[str, Any]):
    email = require_current_email(request)
    save_profile(email, profile)
    return {'status': 'saved'}


@app.post('/api/register')
def api_register(req: RegisterRequest, response: Response):
    email = normalize_email(req.email)
    password = require_password(req.password)
    name = normalize_name(req.name, email)
    password_hash = hash_password(password)
    created_at = datetime.utcnow().isoformat() + 'Z'
    profile = create_default_profile(email, name)
    with engine.begin() as conn:
        existing = conn.execute(select(users.c.email).where(users.c.email == email)).first()
        if existing:
            existing_hash = existing._mapping['password_hash']
            existing_sub = existing._mapping.get('google_sub')
            if existing_sub and existing_hash.startswith('!'):
                conn.execute(
                    users.update()
                    .where(users.c.email == email)
                    .values(name=name, password_hash=password_hash)
                )
            else:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Account already exists')
        else:
            conn.execute(users.insert().values(email=email, name=name, password_hash=password_hash, google_sub=None, created_at=created_at))
            conn.execute(profiles.insert().values(email=email, data=json.dumps(profile, ensure_ascii=False)))
    session_id = create_session(email)
    set_session_cookie(response, session_id)
    return {'status': 'registered', 'email': email, 'name': name}


@app.post('/api/login')
def api_login(req: LoginRequest, response: Response):
    email = normalize_email(req.email)
    password = require_password(req.password)
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.email == email)).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect email or password')
        user = row._mapping
        if not verify_password(password, user['password_hash']):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect email or password')
        if needs_password_rehash(user['password_hash']):
            conn.execute(
                users.update()
                .where(users.c.email == email)
                .values(password_hash=hash_password(password))
            )
    session_id = create_session(email)
    set_session_cookie(response, session_id)
    return {'status': 'logged_in', 'email': email}


@app.post('/api/google-login')
def api_google_login(req: GoogleLoginRequest, response: Response):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='Google sign-in is not configured')
    credential = (req.credential or '').strip()
    if not credential:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Google credential is required')
    try:
        google_profile = id_token.verify_oauth2_token(credential, google_request, GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Google credential') from exc
    if not google_profile.get('email_verified'):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Google account email is not verified')
    email = normalize_email(google_profile.get('email', ''))
    google_sub = (google_profile.get('sub') or '').strip()
    if not google_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Google account identifier missing')
    name = normalize_name(google_profile.get('name'), email)
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.email == email)).first()
        if not row:
            conn.execute(
                users.insert().values(
                    email=email,
                    name=name,
                    password_hash=unusable_password_hash(),
                    google_sub=google_sub,
                    created_at=datetime.utcnow().isoformat() + 'Z',
                )
            )
            conn.execute(profiles.insert().values(email=email, data=json.dumps(create_default_profile(email, name), ensure_ascii=False)))
        else:
            existing_sub = row._mapping.get('google_sub')
            if existing_sub and existing_sub != google_sub:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='This email is linked to a different Google account')
            conn.execute(
                users.update()
                .where(users.c.email == email)
                .values(name=name, google_sub=google_sub)
            )
    session_id = create_session(email)
    set_session_cookie(response, session_id)
    return {'status': 'google_logged_in', 'email': email, 'name': name}


@app.get('/api/logout')
def api_logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        with engine.begin() as conn:
            conn.execute(sessions.delete().where(sessions.c.session_id == session_id))
    response.delete_cookie(SESSION_COOKIE, path='/', samesite=SESSION_COOKIE_SAMESITE, secure=SESSION_COOKIE_SECURE)
    return {'status': 'logged_out'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
