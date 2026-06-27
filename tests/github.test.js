import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, encodeBase64 } from '../js/github.js';

const settings = {
  githubOwner: 'jcpeters08',
  dataRepo: 'halo-post-care-data',
  token: 'token'
};

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

describe('GitHub client', () => {
  it('encodes unicode content as base64 when Buffer is unavailable', () => {
    const originalBuffer = globalThis.Buffer;
    globalThis.Buffer = undefined;
    try {
      assert.equal(decodeBase64Utf8(encodeBase64('hello')), 'hello');
      assert.equal(decodeBase64Utf8(encodeBase64('redness 4')), 'redness 4');
    } finally {
      globalThis.Buffer = originalBuffer;
    }
  });

  it('decodes JSON via getJson without using Buffer', async () => {
    const originalBuffer = globalThis.Buffer;
    globalThis.Buffer = undefined;
    const expectedPayload = { checkin: 'state' };
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ content: encodeBase64(JSON.stringify(expectedPayload)) })
      };
    };

    try {
      const client = createGitHubClient(settings, fetchImpl);
      const payload = await client.getJson('checkins/2026-06-27/2030/manifest.json');
      assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data/contents/checkins%2F2026-06-27%2F2030%2Fmanifest.json');
      assert.deepEqual(payload, expectedPayload);
    } finally {
      globalThis.Buffer = originalBuffer;
    }
  });

  it('tests repo connection with authorization header', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ full_name: 'jcpeters08/halo-post-care-data' }) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    const result = await client.testConnection();
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  });

  it('puts file content through the Contents API', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ content: { path: 'checkins/x/summary.md' } }) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    await client.putFile('checkins/x/summary.md', '# Summary', 'Add summary');
    assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data/contents/checkins%2Fx%2Fsummary.md');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.message, 'Add summary');
    assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '# Summary');
  });

  it('writes complete marker last during uploadCheckin', async () => {
    const paths = [];
    const fetchImpl = async (url, options) => {
      paths.push(decodeURIComponent(url.split('/contents/')[1]));
      return { ok: true, json: async () => ({}) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    await client.uploadCheckin({
      path: 'checkins/2026-06-27/2030',
      files: { 'face.jpg': 'base64-photo' },
      manifest: { checkinPath: 'checkins/2026-06-27/2030' },
      summary: '# Summary',
      complete: { checkinPath: 'checkins/2026-06-27/2030', completedAt: '2026-06-27T20:31:00-05:00' }
    });
    assert.equal(paths.at(-1), 'checkins/2026-06-27/2030/complete.json');
  });

  it('uploads already-base64 photo files without re-encoding', async () => {
    const photoContent = 'aW1hZ2Utbm90LXJlcGVhdGVk';
    const calls = [];
    const fetchImpl = async (url, options) => {
      const path = decodeURIComponent(url.split('/contents/')[1]);
      calls.push({ path, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    };
    const client = createGitHubClient(settings, fetchImpl);

    await client.uploadCheckin({
      path: 'checkins/2026-06-27/2030',
      files: { 'face.jpg': photoContent },
      manifest: { checkinPath: 'checkins/2026-06-27/2030' },
      summary: '# Summary',
      complete: { checkinPath: 'checkins/2026-06-27/2030', completedAt: '2026-06-27T20:31:00-05:00' }
    });

    const photoCall = calls.find(({ path }) => path === 'checkins/2026-06-27/2030/face.jpg');
    assert.ok(!!photoCall);
    assert.equal(photoCall.body.content, photoContent);
  });
});
