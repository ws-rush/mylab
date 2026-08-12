const PROJECT_KEYS = ['html', 'css', 'js'];
const PROJECT_URL_VERSION = '1';

/**
 * Build an agent-friendly mylab link. Source is stored in the URL fragment,
 * so it is not sent to the server and can be decoded by the static app.
 */
export function buildProjectUrl(project = {}, baseUrl = 'https://mylab.byrush.me/play') {
  const url = new URL(baseUrl, 'https://mylab.byrush.me');
  const params = new URLSearchParams({
    v: PROJECT_URL_VERSION,
    html: String(project.html ?? ''),
    css: String(project.css ?? ''),
    js: String(project.js ?? ''),
  });

  url.hash = params.toString();
  return url.href;
}

/**
 * Read the plain-text URL format used by buildProjectUrl.
 * Returns null for the legacy compressed share-link format.
 */
export function readProjectFromHash(hash) {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (params.get('v') !== PROJECT_URL_VERSION) return null;

  const project = Object.fromEntries(
    PROJECT_KEYS.filter((key) => params.has(key)).map((key) => [key, params.get(key) ?? '']),
  );

  return Object.keys(project).length ? project : null;
}
