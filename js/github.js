const CONTENTS_BASE_URL = 'https://api.github.com/repos';
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

export class GitHubSettingsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GitHubSettingsError';
  }
}

export function encodeBase64(content) {
  return Buffer.from(`${content ?? ''}`, 'utf8').toString('base64');
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

    const decoded = Buffer.from(stripBase64Whitespace(payload.content), 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  async function listDirectory(path) {
    const payload = await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: { headers }
    });
    return assertDirectoryContents(path, payload);
  }

  async function putFile(path, content, message) {
    await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message,
          content: encodeBase64(content)
        })
      }
    });
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
    await putFile(`${path}/summary.md`, `${summary ?? ''}`, 'Add summary');
    await putFile(`${path}/manifest.json`, JSON.stringify(manifest ?? {}, null, 2), 'Add manifest');

    for (const [fileName, fileContent] of Object.entries(files ?? {})) {
      await putFile(`${path}/${fileName}`, fileContent, `Add ${fileName}`);
    }

    await putFile(`${path}/complete.json`, JSON.stringify(complete ?? {}, null, 2), 'Add complete marker');
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

  return {
    testConnection,
    putFile,
    getJson,
    listDirectory,
    uploadCheckin,
    findAssessmentFiles
  };
}
