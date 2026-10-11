# DSAForge

**Track → Revise → Recall → Master.** A LeetCode-style DSA revision app — not a
code judge. You solve on LeetCode, DSAForge schedules the *recall*.

MERN: **React (Vite)** + **Express (Node)** + **MongoDB (Mongoose)**.

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | Streak, heatmap, due queue, weak topics, today's set |
| **Daily Practice** | 3 frozen questions/day (topic-diverse), one-click ✓ Solved |
| **My Questions** | Full bank — filters, facets, import, edit |
| **DSA Topics** | Topics grouped by sheet **phase** (Phase 1–4), memory grades |
| **Today's Revision** | Statement → *My recalled approach* → reveal → Again/Hard/Good/Easy |
| **Habit & Performance** | Streak, heatmap, retention, topic breakdown |
| **Interview Mode** | 5-question mock, 5:00 countdown, auto-finish, weak-area report |
| **Settings** | Profile, timezone, daily target, data export |

No code editor anywhere — the flow is pure recall + self-rating, and the SRS
engine (SM-2-ish intervals per rating) does the scheduling.

## Run locally

```bash
# Backend  → http://localhost:5000/api
cd backend && npm install && npm run dev

# Frontend → http://localhost:5173
cd frontend && npm install && npm run dev
```

Configure `backend/.env` from `backend/.env.example` (`MONGO_URI`, `JWT_SECRET`,
`CLIENT_URL`). Frontend API base lives in `frontend/.env` (`VITE_API_URL`).

**Demo login:** `demo@dsaforge.app` / `demo1234`

## Import your own sheet

`backend/scripts/resetAndImport.js` wipes the demo bank (a JSON backup is taken
first into `backend/scripts/backup/`), then imports `backend/scripts/dsa-union.txt`
— pipe-separated `phase|topic|title`, 382 questions across 19 topics.

```bash
cd backend
node scripts/resetAndImport.js --dry   # preview
node scripts/resetAndImport.js         # backup + wipe + import
```

JSON/CSV import through **My Questions → Import** maps `phase`, `topics`,
`difficulty`, `link`, `approach`, `notes`, `status`.

## Notes

- `tools/` holds a ~300 MB zig bundle used by the (now unused) code-runner API —
  it is git-ignored; the app runs fine without it.
- Stats, streaks and revision history are per-user and live in MongoDB.
