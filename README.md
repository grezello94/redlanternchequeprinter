# Red Lantern Cheque

A Vite + React + TypeScript app for creating and storing cheques using Firebase Firestore.

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

- `src/App.tsx` is the main screen container and renders the app layout.
- `src/components/ChequeForm.tsx` handles form entry, validation, and Firestore writes.
- `src/firebase.ts` initializes Firebase and exports a Firestore instance.

Data flow:
- Form input goes through `ChequeForm` and writes to Firestore.
- The main app queries Firestore for recent cheques and renders the list.

## Project Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck and build for production
- `npm run preview` — preview the production build locally
- `npm run lint` — run ESLint
