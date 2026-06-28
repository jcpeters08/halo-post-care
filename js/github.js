const CONTENTS_BASE_URL = 'https://api.github.com/repos';
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

const textEncoder = typeof TextEncoder === 'function'
  ? new TextEncoder()
  : null;
const textDecoder = typeof TextDecoder === 'function'
  ? new TextDecoder()
  : null;

export class GitHubSettingsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GitHubSettingsError';
  }
}

export function encodeBase64(content) {
  const bytes = stringToUtf8Bytes(`${content ?? ''}`);
  return encodeBytesToBase64(bytes);
}

function stringToUtf8Bytes(value) {
  if (textEncoder) {
    return textEncoder.encode(value);
  }

  if (typeof Buffer === 'undefined' || typeof Buffer.from !== 'function') {
    throw new Error('TextEncoder unavailable');
  }

  return Buffer.from(value, 'utf8');
}

function encodeBytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }

  throw new Error('No base64 encoder available');
}

function decodeBase64ToString(value) {
  const input = stripBase64Whitespace(`${value ?? ''}`);
  if (!input) {
    return '';
  }

  if (typeof atob === 'function' && textDecoder) {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return textDecoder.decode(bytes);
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(input, 'base64').toString('utf8');
  }

  throw new Error('No base64 decoder available');
}

function assertGitHubSettings(settings) {
  const missing = [];
  if (!settings?.githubOwner) missing.push('githubOwner');
  if (!settings?.dataRepo) missing.push('dataRepo');
  if (!settings?.token) missing.push('token');
  if (missing.length > 0) {
    throw new GitHubSettingsError(`Missing GitHub settings: ${missing.join(', ')}`);
  }
}

function buildApiError(response, body) {
  const githubMessage = body && typeof body === 'object' && typeof body.message === 'string'
    ? body.message
    : null;
  const message = githubMessage ? `${response.status}: ${githubMessage}` : `${response.status}: ${response.statusText || 'Request failed'}`;
  const error = new Error(message);
  error.status = response.status;
  if (githubMessage) {
    error.githubMessage = githubMessage;
  }
  return error;
}

function stripBase64Whitespace(value) {
  return value.replace(/\s+/g, '');
}

async function request(fetchImpl, requestInfo) {
  const response = await fetchImpl(requestInfo.url, requestInfo.options);
  const body = response.ok ? await response.json() : await response.json().catch(() => null);
  if (!response.ok) {
    throw buildApiError(response, body);
  }
  return body;
}

function assertDirectoryContents(path, payload) {
  if (!Array.isArray(payload)) {
    throw new Error(`Expected directory listing array for ${path}`);
  }
  return payload;
}

function getEntryPath(entry, fallbackPath) {
  return entry?.path || entry?.name || fallbackPath;
}

function getEntryType(entry) {
  return entry?.type || '';
}

function getEntryName(entry) {
  return entry?.name || '';
}

function isFile(entry, name) {
  return getEntryType(entry) === 'file' && (!name || getEntryName(entry) === name);
}

function isDirectory(entry) {
  return getEntryType(entry) === 'dir';
}

function buildContentsUrl(owner, repo, path) {
  return `${CONTENTS_BASE_URL}/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
}

function buildRepoUrl(owner, repo) {
  return `${CONTENTS_BASE_URL}/${owner}/${repo}`;
}

export function createGitHubClient(settings, fetchImpl = fetch) {
  assertGitHubSettings(settings);
  const { githubOwner, dataRepo, token } = settings;

  const headers = {
    ...API_HEADERS,
    Authorization: `Bearer ${token}`
  };

  async function getJson(path) {
    const payload = await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: { headers }
    });
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Expected JSON object payload for ${path}`);
    }
    if (!payload.content) {
      throw new Error(`GitHub API did not return file content for ${path}`);
    }

    const decoded = decodeBase64ToString(payload.content);
    return JSON.parse(decoded);
  }

  async function getFileBase64(path) {
    const payload = await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: { headers }
    });
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Expected file payload for ${path}`);
    }
    if (typeof payload.content !== 'string') {
      throw new Error(`GitHub API did not return file content for ${path}`);
    }

    return stripBase64Whitespace(payload.content);
  }

  async function listDirectory(path) {
    const payload = await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: { headers }
    });
    return assertDirectoryContents(path, payload);
  }

  async function putFile(path, content, message) {
    return putFileBase64(path, encodeBase64(content), message);
  }

  async function getExistingFileSha(path) {
    try {
      const payload = await request(fetchImpl, {
        url: buildContentsUrl(githubOwner, dataRepo, path),
        options: { headers }
      });

      return typeof payload?.sha === 'string' ? payload.sha : '';
    } catch (error) {
      if (error?.status === 404) {
        return '';
      }
      throw error;
    }
  }

  async function putFileBase64(path, base64Content, message, options = {}) {
    const sha = options.allowUpdate ? await getExistingFileSha(path) : '';
    await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message,
          content: base64Content,
          ...(sha ? { sha } : {})
        })
      }
    });
  }

  async function putUploadFile(path, content, message) {
    return putFileBase64(path, encodeBase64(content), message, { allowUpdate: true });
  }

  async function putUploadFileBase64(path, base64Content, message) {
    return putFileBase64(path, base64Content, message, { allowUpdate: true });
  }

  async function testConnection() {
    const response = await request(fetchImpl, {
      url: buildRepoUrl(githubOwner, dataRepo),
      options: { headers }
    });
    return {
      ok: true,
      ...response
    };
  }

  async function uploadCheckin({
    path,
    files,
    manifest,
    summary,
    complete
  }) {
    await putUploadFile(`${path}/summary.md`, `${summary ?? ''}`, 'Add summary');
    await putUploadFile(`${path}/manifest.json`, JSON.stringify(manifest ?? {}, null, 2), 'Add manifest');

    for (const [fileName, fileContent] of Object.entries(files ?? {})) {
      await putUploadFileBase64(`${path}/${fileName}`, `${fileContent}`, `Add ${fileName}`);
    }

    await putUploadFile(`${path}/complete.json`, JSON.stringify(complete ?? {}, null, 2), 'Add complete marker');
  }

  async function findAssessmentFiles() {
    const checkins = await listDirectory('checkins');
    const completeAssessmentPaths = [];

    for (const dateEntry of checkins.filter(isDirectory)) {
      const datePath = getEntryPath(dateEntry, `checkins/${getEntryName(dateEntry)}`);
      const dateEntries = await listDirectory(datePath);

      for (const timeEntry of dateEntries.filter(isDirectory)) {
        const timePath = getEntryPath(timeEntry, `${datePath}/${getEntryName(timeEntry)}`);
        const checkinEntries = await listDirectory(timePath);

        const hasComplete = checkinEntries.some((entry) => isFile(entry, 'complete.json'));
        if (!hasComplete) continue;

        const hasAssessment = checkinEntries.some((entry) => isFile(entry, 'assessment.json'));
        if (hasAssessment) {
          completeAssessmentPaths.push(`${timePath}/assessment.json`);
        }
      }
    }

    return completeAssessmentPaths;
  }

  async function findCompletedCheckins() {
    const checkins = await listDirectory('checkins');
    const completedPaths = [];

    for (const dateEntry of checkins.filter(isDirectory)) {
      const datePath = getEntryPath(dateEntry, `checkins/${getEntryName(dateEntry)}`);
      const dateEntries = await listDirectory(datePath);

      for (const timeEntry of dateEntries.filter(isDirectory)) {
        const timePath = getEntryPath(timeEntry, `${datePath}/${getEntryName(timeEntry)}`);
        const checkinEntries = await listDirectory(timePath);
        if (checkinEntries.some((entry) => isFile(entry, 'complete.json'))) {
          completedPaths.push(timePath);
        }
      }
    }

    return completedPaths;
  }

  return {
    testConnection,
    putFile,
    getJson,
    getFileBase64,
    listDirectory,
    uploadCheckin,
    findAssessmentFiles,
    findCompletedCheckins
  };
}
