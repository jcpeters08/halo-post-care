import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'css/styles.css',
  'manifest.webmanifest',
  'sw.js',
  'icons/app-icon.svg',
  'js/app.js'
];

describe('project shell', () => {
  it('has all static app shell files', async () => {
    for (const file of requiredFiles) {
      const info = await stat(file);
      assert.equal(info.isFile(), true, `${file} should be a file`);
    }
  });

  it('does not add runtime dependencies', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });

  it('sets a CSP that limits network calls to GitHub API', async () => {
    const html = await readFile('index.html', 'utf8');
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /connect-src https:\/\/api\.github\.com/);
  });
});
