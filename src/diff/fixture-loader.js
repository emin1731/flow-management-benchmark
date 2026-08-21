const fs = require('node:fs');
const path = require('node:path');

const VERSION_FILE_PATTERN = /^form-template-v(\d+)\.json$/;

const loadFixture = (filePath) => {
  const contents = fs.readFileSync(filePath, 'utf8');
  const fixture = JSON.parse(contents);

  if (!fixture.data || !Array.isArray(fixture.data.sortedKeys)) {
    throw new TypeError(`${filePath} is missing data.sortedKeys.`);
  }

  return fixture;
};

const discoverFixtures = (fixturesDirectory) => {
  return fs
    .readdirSync(fixturesDirectory)
    .map((fileName) => {
      const match = fileName.match(VERSION_FILE_PATTERN);
      return match ? { fileName, version: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.version - right.version)
    .map(({ fileName, version }) => ({
      version,
      fileName,
      filePath: path.join(fixturesDirectory, fileName),
      form: loadFixture(path.join(fixturesDirectory, fileName)),
    }));
};

const createVersionPairs = (fixtures) => {
  return fixtures.slice(1).map((current, index) => ({
    from: fixtures[index],
    to: current,
  }));
};

module.exports = { createVersionPairs, discoverFixtures, loadFixture };
