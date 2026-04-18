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
from sqlalchemy import Column, MetaData, String, Table, Text, create_engine, select

BASE_DIR = Path(__file__).parent
DB_FILE = BASE_DIR / 'aashna.db'
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{DB_FILE}')
SESSION_COOKIE = 'aashna_session'

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

app = FastAPI()
app.mount('/static', StaticFiles(directory='static'), name='static')
app.mount('/pages', StaticFiles(directory='pages'), name='pages')


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str = ''


class GoogleLoginRequest(BaseModel):
    email: str


class ProfileRequest(BaseModel):
    profile: Dict[str, Any]


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


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
        'anonPost': True,
        'done': {},
        'activitiesDone': [],
        'journal': [],
        'communityPosts': {},
        'communityKey': 'desi',
        'affIdx': 0,
        'affLoved': [],
        'likedPosts': [],
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
            return json.loads(row[0])
        return create_default_profile(email)


def save_profile(email: str, profile: Dict[str, Any]) -> None:
    serialized = json.dumps(profile, ensure_ascii=False)
    with engine.begin() as conn:
        existing = conn.execute(select(profiles.c.email).where(profiles.c.email == email)).first()
        if existing:
            conn.execute(profiles.update().where(profiles.c.email == email).values(data=serialized))
        else:
            conn.execute(profiles.insert().values(email=email, data=serialized))


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
    return FileResponse(str(BASE_DIR / 'aashna.html'))


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
    email = req.email.strip() or f'demo-{uuid.uuid4().hex[:6]}@example.com'
    password = req.password.strip() or uuid.uuid4().hex
    name = req.name.strip() if (req.name or '').strip() else email.split('@')[0]
    password_hash = hash_password(password)
    created_at = datetime.utcnow().isoformat() + 'Z'
    profile = create_default_profile(email, name)
    with engine.begin() as conn:
        existing = conn.execute(select(users.c.email).where(users.c.email == email)).first()
        if existing:
            conn.execute(users.update().where(users.c.email == email).values(name=name, password_hash=password_hash))
        else:
            conn.execute(users.insert().values(email=email, name=name, password_hash=password_hash, created_at=created_at))
            conn.execute(profiles.insert().values(email=email, data=json.dumps(profile, ensure_ascii=False)))
    session_id = create_session(email)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite='lax', path='/')
    return {'status': 'registered'}


@app.post('/api/login')
def api_login(req: LoginRequest, response: Response):
    email = req.email.lower().strip() or f'demo-{uuid.uuid4().hex[:6]}@example.com'
    password = req.password.strip() or uuid.uuid4().hex
    name = email.split('@')[0]
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.email == email)).first()
        if not row:
            conn.execute(users.insert().values(email=email, name=name, password_hash=hash_password(password), created_at=datetime.utcnow().isoformat() + 'Z'))
            conn.execute(profiles.insert().values(email=email, data=json.dumps(create_default_profile(email, name), ensure_ascii=False)))
        else:
            conn.execute(users.update().where(users.c.email == email).values(name=name))
    session_id = create_session(email)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite='lax', path='/')
    return {'status': 'logged_in'}


@app.post('/api/google-login')
def api_google_login(req: GoogleLoginRequest, response: Response):
    email = req.email.lower().strip()
    name = email.split('@')[0]
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.email == email)).first()
        if not row:
            password_hash = hash_password(uuid.uuid4().hex)
            conn.execute(users.insert().values(email=email, name=name, password_hash=password_hash, created_at=datetime.utcnow().isoformat() + 'Z'))
            conn.execute(profiles.insert().values(email=email, data=json.dumps(create_default_profile(email, name), ensure_ascii=False)))
    session_id = create_session(email)
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite='lax', path='/')
    return {'status': 'google_logged_in'}


@app.get('/api/logout')
def api_logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        with engine.begin() as conn:
            conn.execute(sessions.delete().where(sessions.c.session_id == session_id))
    response.delete_cookie(SESSION_COOKIE, path='/')
    return {'status': 'logged_out'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
