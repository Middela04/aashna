# Khushii

**Khushii** is a duolingo-style mental wellness app culturally tailored for South Asian users. It combines a calming mobile-style interface with short learning modules, grounding tools, journaling, and reflections to support people between therapy sessions, not replace clinical care.

This application built around the idea of timely interventions that can help support a person when a human mental health provider is not avaiable. Mental health support feels more useful when it understands the emotional realities of family expectations, bicultural identity, academic pressure, grief, stigma, and self-compassion in a South Asian context.

## What the app does

- Guides users through a **daily check-in** with mood, stress, and support preferences
- Recommends the next support step based on that check-in
- Offers **interactive learning tracks** on themes like boundaries, family expectations, bicultural identity, academic stress, grief, and self-compassion
- Includes **regulation tools** such as box breathing, 4-7-8 breathing, progressive relaxation, body scan, and 5-senses grounding
- Supports **journaling, affirmations, boundary scripting, and personal toolkit building**
- Persists user progress, profile data, lesson completion, and settings through a FastAPI backend

## Why this project exists

Khushii was built to explore what a culturally tailored mental wellness product could feel like for South Asian users. Many wellness apps are generic. This one intentionally centers experiences that are often underrepresented in product design, including:

- navigating family and community expectations
- living between cultures
- pressure around school and success
- therapy stigma
- grief, distance, and identity

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** FastAPI
- **Database:** SQLite locally, Postgres-ready via SQLAlchemy
- **App shape:** single-page app shell with screen fragments loaded from `pages/`

## Core experience

### 1. Daily check-in
Users start with a quick check-in that captures mood, stress, what is weighing on them, and what kind of support they want.

### 2. Personalized routing
The app routes users toward the most relevant next step:

- calming tools when stress is high
- journaling when reflection is the goal
- text support when they want to vent
- specific learning modules when their response points to family, academic, identity, grief, or self-compassion themes

### 3. Course-based growth
Users earn XP, levels, streaks, and badges as they complete lessons and activities. Modules blend:

- quiz lessons
- reflection prompts
- scenario-based choices grounded in lived experience

### 4. In-the-moment support
The activities area gives users immediate tools they can use without working through a full lesson, inspired by the current research on JITAIs (just-in-time adaptive interventions).

## Current modules

- **Maintaining Boundaries**
- **Biculturalism & Identity**
- **Family Expectations**
- **Academic Stress**
- **Grief & Loss**
- **Self-Compassion**

Each module contains a mix of reflection, scenario, and quiz content.

## Project structure

```text
project-root/
├── khushii.html           # main app shell
├── server.py              # FastAPI server and persistence layer
├── requirements.txt       # Python dependencies
├── khushii.db             # SQLite database
├── static/
│   ├── app.js             # client-side state, routing, rendering, logic
│   └── style.css          # app styling
├── pages/                 # individual screen fragments loaded into the SPA
│   ├── screen-landing.html
│   ├── screen-home.html
│   ├── screen-checkin.html
│   ├── ...
├── split_pages.py         # helper used to split screens out of the main HTML file
└── README.md
```

## How it works

### Frontend

The app uses a single HTML shell (`khushii.html`) and dynamically loads screen fragments from `pages/` on startup. Client-side logic in `static/app.js` manages:

- screen navigation
- module rendering
- activity state
- XP, streaks, and badges
- journal state
- persistence to the backend

### Backend

`server.py` exposes a small FastAPI app that:

- serves the frontend and static assets
- manages email/password auth, Google sign-in, and secure session cookies
- stores user profiles in SQLite locally and supports hosted Postgres via `DATABASE_URL`
- returns and saves profile state through `/api/profile`

### Persistence model

The backend stores three tables:

- `users`
- `profiles`
- `sessions`

Profile data includes progress, settings, journal entries, lesson completion, and other UI state. Daily streak tracking also uses browser `localStorage` on the frontend.

## API endpoints

The current backend exposes:

- `GET /` - serve the app
- `GET /api/health` - health check for deployment
- `GET /api/config` - frontend runtime config, including whether Google sign-in is enabled
- `GET /api/profile` - fetch the signed-in user's saved profile
- `POST /api/profile` - save profile state
- `POST /api/login` - sign in with email and password
- `POST /api/register` - create an account and initialize a profile
- `POST /api/google-login` - sign in with a verified Google credential
- `GET /api/logout` - clear the current session

## Running locally

### 1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Start the server

```bash
python3 server.py
```

The app will be available at:

```text
http://localhost:8000
```

## Authentication

- Email/password accounts are supported locally and in production
- Google sign-in is enabled when `GOOGLE_CLIENT_ID` is configured
- Sessions are stored server-side and sent as secure cookies in production
- User data is saved to the local SQLite database in `khushii.db` unless `DATABASE_URL` points to Postgres

## Environment variables

Copy `.env.example` and set the values you need:

- `DATABASE_URL` - local SQLite or hosted Postgres connection string
- `GOOGLE_CLIENT_ID` - required to enable Google sign-in
- `APP_ENV` - use `production` on Render
- `SESSION_COOKIE_SECURE` - `true` in production

## Deployment target

This repo is now set up to target:

- `Render` for the FastAPI app
- `Neon` for the production Postgres database

Use [`render.yaml`](render.yaml) as the starting point for the Render service, then set:

- `DATABASE_URL` to your Neon Postgres URL
- `GOOGLE_CLIENT_ID` to your Google OAuth web client ID

## Design notes

This project intentionally leans into:

- a warm, phone-like interface
- emotionally supportive copy
- culturally specific lesson writing
- low-friction, approachable mental wellness interactions

The content design is as important to the product as the technical implementation.

## Important disclaimer

Khushii is **not** a replacement for therapy, emergency services, or crisis intervention. The product includes crisis-resource links and is positioned as a support tool between sessions or alongside care.

## Known limitations

- Profile data is stored as a large serialized object rather than a fully normalized schema
- Some support flows are simulated product experiences rather than integrations with real providers or messaging systems
- Community is currently on hold and not part of the active product surface

## Future directions

- provider dashboards or shared progress summaries
- richer analytics around check-ins and module completion
- real-time community moderation and safety tooling
- deeper personalization and recommendation logic
- deployment configuration and environment-based setup

## Repository highlights

If you are jumping into the codebase, these are the best places to start:

- [`server.py`](server.py)
- [`static/app.js`](static/app.js)
- [`khushii.html`](khushii.html)
- [`pages/screen-landing.html`](pages/screen-landing.html)
- [`pages/screen-home.html`](pages/screen-home.html)

## Summary

Khushii is a thoughtful full-stack prototype for culturally grounded mental wellness support. It pairs a gentle user experience with structured learning, emotional regulation tools, and lightweight persistence in a way that feels product-focused rather than purely technical.
