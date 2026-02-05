# Red Lantern Cheque Printer

A Vite + React + TypeScript app for creating, printing, and storing cheques using Firebase Firestore.

## Key Features

- Payee autocomplete with fast local cache + live Firestore search.
- Inline “Last cheques for this payee” preview under the Payee field.
- One‑tap Print + Save workflow.
- WhatsApp share that auto‑saves a cheque when it prompts for cheque number.
- Full Print History with search (name/cheque no) and date range filters.
- Offline queue (stores pending items locally and syncs when online).

## Prerequisites

- Node.js (LTS recommended)
- npm (comes with Node.js)

## Install

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

Vite will print the local dev server URL in the terminal.

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Lint

```bash
npm run lint
```

## Firebase Configuration

This project uses Firestore. The Firebase web config is loaded from Vite environment variables.

1. Copy the example env file and fill in your Firebase Web App config values:

```bash
cp .env.example .env
```

2. In the Firebase Console, create a Web App (if you do not already have one) and copy the config values into `.env`.

Note: `.env` contains secrets. Make sure it is not committed to version control.

## Firestore Indexes (Required)

The history and “recent cheques” queries require composite indexes. Create both:

1. `cheques` collection:
   - `payTo` (Ascending)
   - `createdAt` (Descending)
2. `cheques` collection:
   - `payToLower` (Ascending)
   - `createdAt` (Descending)

Firestore will show a console link to create each index the first time the query runs.

## Data Model

Collections used:

- `payees`
  - `name` (string)
  - `nameLower` (string, normalized)
  - `createdAt` (timestamp)
- `cheques`
  - `payTo` (string)
  - `payToLower` (string, normalized)
  - `date` (string, DDMMYYYY)
  - `amountInNumbers` (string)
  - `amountInWords` (string)
  - `chequeNo` (string)
  - `issuedAt` (ISO string, when saved/printed)
  - `issuedDay` (string, Mon/Tue/etc.)
  - `createdAt` (timestamp)

The app backfills missing `nameLower`, `payToLower`, `issuedAt`, and `issuedDay` on startup.

## Deployment

This app is a standard Vite build.

1. Build the app:

```bash
npm run build
```

2. Deploy the `dist/` folder to your host of choice.

Common options:
- Vercel: create a new project, set the build command to `npm run build` and output directory to `dist`.
- Netlify: set the build command to `npm run build` and publish directory to `dist`.
- Firebase Hosting: run `firebase init hosting`, set the public directory to `dist`, and deploy with `firebase deploy`.

Make sure your host is configured with the same `.env` values used locally.

## Architecture Overview

- `src/App.tsx` renders the UI and manages Firestore reads/writes.
- `src/firebase.ts` initializes Firebase and exports a Firestore instance.

Data flow:
- Form input updates local state.
- Payees and cheques are synced from Firestore (with local cache and offline queue).
- History and recent cheques are read from Firestore and rendered in the UI.

## Project Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck and build for production
- `npm run preview` — preview the production build locally
- `npm run lint` — run ESLint
