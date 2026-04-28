# Vector — Sand Trading & Logistics Platform

A multi-role B2B platform for live sand trading, dispatch, and billing. Buyers, traders, suppliers, drivers, and admins each get a dedicated dashboard backed by Supabase, with Gemini AI handling smart-matching, assignment suggestions, and document extraction.

## What it does

| Role | What they can do |
|---|---|
| **Buyer** | Browse listings, place orders, track dispatch in real time |
| **Trader** | Match buyers and suppliers, set margins, manage active deals |
| **Supplier** | List inventory, receive orders, confirm dispatch |
| **Driver / Truck-driver** | Receive assignments, update trip status |
| **Admin** | Oversee users, run analytics, generate monthly bills, seed/reset data |

## Key features

- **Role-based auth & routing** — Supabase Auth + middleware-enforced route protection across six roles
- **AI assistants (Gemini)** — smart buyer-supplier matching, assignment suggestions, document extraction (OCR for invoices/dockets)
- **Document generation** — PDF e-challans (`pdf-lib`) and Excel monthly bills (`exceljs` / `xlsx`)
- **Maps integration** — Google Maps Places autocomplete for dispatch locations
- **Margin analysis** — per-deal P&L surfaced to traders and admins

## Tech stack

- **Framework:** Next.js 16 (App Router) · React 19 · TypeScript
- **Database & Auth:** Supabase (Postgres, RLS policies, edge functions)
- **AI:** Google Gemini (`@google/generative-ai`)
- **Styling:** Tailwind CSS v4
- **Maps:** Google Maps JS API
- **Documents:** pdf-lib · exceljs · xlsx

## Run locally

**Prerequisites:** Node.js 20+, a Supabase project, a Gemini API key, a Google Maps JS API key.

```bash
git clone https://github.com/MadhuramAgarwal/vector.git
cd vector
npm install
```

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_GEMINI_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

Apply the Supabase schema (in the Supabase SQL editor):

1. `supabase/schema.sql`
2. Files in `supabase/migrations/` in order
3. `supabase/RUN_SEED_DATA.sql` (optional — demo data)

Then:

```bash
npm run dev
```

Open <http://localhost:3000>.

## Project structure

```
app/
  buyer/  trader/  supplier/  driver/  truck-driver/  admin/   Role dashboards
  api/                                                          Server actions
  login/  page.tsx  layout.tsx                                  Auth + shell
lib/
  supabase/             SSR + browser clients
  createNotification.ts Notification helper
proxy.ts                Auth middleware (route gate by role)
supabase/               Schema, migrations, seed scripts, edge functions
```

## API routes

`app/api/` exposes server endpoints for: margin analysis, Excel export, document extraction, e-challan generation, monthly bill generation, smart matching, assignment suggestions, buyer suggestions, and data reset.
