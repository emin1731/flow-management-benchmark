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

## Diff experiments

This repository models the handoff between two application spaces:

1. The form editor can make many changes without changing a version.
2. The flow manager receives a new form version, decides whether it is materially different, and reports changed categories, sections, and inputs.

The current fixtures are `form-template-v1.json` through `form-template-v4.json`. They represent snapshots received by the flow manager. The benchmark harness creates adjacent pairs (`v1 -> v2`, `v2 -> v3`, and `v3 -> v4`) but does not implement a comparison algorithm yet.

Run the empty benchmark:

```bash
npm run benchmark
```

Add an algorithm to `src/diff/algorithms/index.js` using this contract:

```js
{
	name: 'algorithm-name',
	compare(previous, current) {
		return {
			equal: true,
			changes: [],
			metadata: {},
		};
	},
}
```

The `changes` array is reserved for structured category, section, and input changes. `metadata` can hold algorithm-specific counters or measurements without changing the shared result shape.

The harness is split into:

- `src/diff/fixture-loader.js`: discovers snapshots and creates version pairs.
- `src/diff/algorithm.interface.js`: validates the algorithm and result contracts.
- `src/diff/runner.js`: executes algorithms and records duration and version metadata.
- `src/diff/report.js`: creates the serializable benchmark report.
