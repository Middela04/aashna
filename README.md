# Aashna

**Aashna** is a duolingo-style mental wellness app culturally tailored for South Asian users. It combines a calming mobile-style interface with short learning modules, grounding tools, journaling, and reflections to support people between therapy sessions, not replace clinical care.

This application built around the idea of timely interventions that can help support a person when a human mental health provider is not avaiable. Mental health support feels more useful when it understands the emotional realities of family expectations, bicultural identity, academic pressure, grief, stigma, and self-compassion in a South Asian context.

## What the app does

- Guides users through a **daily check-in** with mood, stress, and support preferences
- Recommends the next support step based on that check-in
- Offers **interactive learning tracks** on themes like boundaries, family expectations, bicultural identity, academic stress, grief, and self-compassion
- Includes **regulation tools** such as box breathing, 4-7-8 breathing, progressive relaxation, body scan, and 5-senses grounding
- Supports **journaling, affirmations, boundary scripting, and personal toolkit building**
- Provides a **community feed** for anonymous sharing and themed spaces
- Persists user progress, profile data, lesson completion, and settings through a FastAPI backend

## Why this project exists

Aashna was built to explore what a culturally tailored mental wellness product could feel like for South Asian users. Many wellness apps are generic. This one intentionally centers experiences that are often underrepresented in product design, including:

- navigating family and community expectations
- living between cultures
- pressure around school and success
- therapy stigma
- grief, distance, and identity

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** FastAPI
- **Database:** SQLite via SQLAlchemy
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
aashna/
├── aashna.html            # main app shell
├── server.py              # FastAPI server and persistence layer
├── requirements.txt       # Python dependencies
├── aashna.db              # SQLite database
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

The app uses a single HTML shell (`aashna.html`) and dynamically loads screen fragments from `pages/` on startup. Client-side logic in `static/app.js` manages:

- screen navigation
- module rendering
- activity state
- XP, streaks, and badges
- community and journal state
- persistence to the backend

### Backend

`server.py` exposes a small FastAPI app that:

- serves the frontend and static assets
- manages demo-style login and session cookies
- stores user profiles in SQLite
- returns and saves profile state through `/api/profile`

### Persistence model

The backend stores three tables:

- `users`
- `profiles`
- `sessions`

Profile data includes progress, settings, journal entries, community activity, lesson completion, and other UI state. Daily streak tracking also uses browser `localStorage` on the frontend.

## API endpoints

The current backend exposes:

- `GET /` - serve the app
- `GET /api/profile` - fetch the signed-in user's saved profile
- `POST /api/profile` - save profile state
- `POST /api/login` - create or resume a demo user session
- `POST /api/register` - register a user and initialize a profile
- `POST /api/google-login` - demo Google-style login flow
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

## Data and demo behavior

- The app currently supports a lightweight **demo login flow**
- Entering a name and optional email on the landing screen is enough to begin
- If no email is provided, the frontend creates a demo-style email automatically
- User data is saved to the local SQLite database in `aashna.db`

## Design notes

This project intentionally leans into:

- a warm, phone-like interface
- emotionally supportive copy
- culturally specific lesson writing
- low-friction, approachable mental wellness interactions

The content design is as important to the product as the technical implementation.

## Important disclaimer

Aashna is **not** a replacement for therapy, emergency services, or crisis intervention. The product includes crisis-resource links and is positioned as a support tool between sessions or alongside care.

## Known limitations

- Authentication is currently demo-oriented and not production-hardened
- Profile data is stored as a large serialized object rather than a fully normalized schema
- The app is designed primarily for local/demo use right now
- Some support flows are simulated product experiences rather than integrations with real providers or messaging systems

## Future directions

- stronger production-grade authentication
- provider dashboards or shared progress summaries
- richer analytics around check-ins and module completion
- real-time community moderation and safety tooling
- deeper personalization and recommendation logic
- deployment configuration and environment-based setup

## Repository highlights

If you are jumping into the codebase, these are the best places to start:

- [`server.py`](server.py)
- [`static/app.js`](static/app.js)
- [`aashna.html`](aashna.html)
- [`pages/screen-landing.html`](pages/screen-landing.html)
- [`pages/screen-home.html`](pages/screen-home.html)

## Summary

Aashna is a thoughtful full-stack prototype for culturally grounded mental wellness support. It pairs a gentle user experience with structured learning, emotional regulation tools, and lightweight persistence in a way that feels product-focused rather than purely technical.
