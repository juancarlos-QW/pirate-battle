# Pirate Battle

Top-down 2D naval shooter built with React, TypeScript (strict) and PixiJS.

> Work in progress — full documentation (controls, gameplay config, network scenarios) will be added as features land.

## Requirements

- Node.js 20+ (developed with Node 24)
- npm 10+

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # optional
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without emitting |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run Playwright E2E tests (desktop + mobile Chromium) |
| `npm run test:e2e:update` | Update visual regression baselines |
| `npm run test:e2e:report` | Open the last HTML report |
