# Flow Management Benchmark

Express.js service using JavaScript, PostgreSQL, Sequelize, and Axios.

## Requirements

- Node.js 22 or newer
- npm
- Docker Desktop, if running PostgreSQL locally with Compose

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run dev
```

The API starts at `http://localhost:3000`.

## Endpoints

- `GET /` returns service metadata.
- `GET /health` returns `{ "status": "ok" }`.

## Scripts

- `npm run dev` starts the server with Nodemon.
- `npm start` starts the server.
- `npm test` runs the Jest test suite.
- `npm run lint` checks JavaScript with ESLint.
- `npm run format` formats the project with Prettier.
