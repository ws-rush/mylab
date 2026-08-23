import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { buildProjectUrl, readProjectFromHash } from './project-url.js';
import { getPreviewConsoleInterceptorScript, setupConsoleUi, handleConsoleMessage, logStore } from './console.js';
import './styles.css';

const LOGO_PATHS = {
  dark: '/logo.svg',
  light: '/logo-light.svg',
};

const THEME_STORAGE_KEY = 'mylab-theme';

const THEME_ICONS = {
  system: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
  light: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>`,
  dark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`,
};

const DEFAULTS = {
  html: `<main class="hero" dir="rtl">
  <img class="logo" src="/logo.svg" alt="ملعب" />
  <p class="tagline">مساحة صغيرة للأفكار الكبيرة</p>
</main>`,
  css: `:root {
  font-family: Inter, 'Noto Sans Arabic', system-ui, sans-serif;
  --preview-text: #202020;
  --preview-bg: #ffffff;
  --preview-muted: #7b817d;
  color: var(--preview-text);
  background: var(--preview-bg);
}

:root.dark {
  --preview-text: #f5f5f5;
  --preview-bg: #090909;
  --preview-muted: #8b938d;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.hero {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 13px;
  width: min(100%, 460px);
  padding: 32px;
  text-align: center;
}

.hero::before {
  content: '';
  position: absolute;
  z-index: -1;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(228 59 68 / 12%), transparent 68%);
  pointer-events: none;
}

.logo {
  display: block;
  width: min(368px, 82vw);
  aspect-ratio: 3 / 1;
  height: auto;
  cursor: pointer;
  filter: drop-shadow(0 14px 26px rgb(228 59 68 / 8%));
  transform-origin: center;
  transition: filter 180ms ease;
}

.logo:hover {
  filter: drop-shadow(0 16px 30px rgb(228 59 68 / 18%));
}

.tagline {
  margin: 0;
  color: var(--preview-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
}

.stack-label {
  color: var(--preview-muted);
  font-family: Inter, system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
}`,
  js: `// Your JavaScript runs in the preview iframe.
const logo = document.querySelector('.logo');

logo?.addEventListener('click', () => {
  logo.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.05) rotate(-2deg)' },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
});`,
};

const editorPromises = new Map();
let editorRuntime;
let editorRuntimePromise;
const codeThemeSelect = document.querySelector('#editor-theme-select');
const codeThemeOptions = {
  dark: [
    { value: 'default', label: 'Dark' },
    { value: 'one-dark', label: 'One Dark' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'nord', label: 'Nord' },
    { value: 'contrast', label: 'High contrast' },
  ],
  light: [
    { value: 'default', label: 'Light' },
    { value: 'github', label: 'GitHub Light' },
    { value: 'solarized', label: 'Solarized Light' },
    { value: 'nord-light', label: 'Nord Light' },
    { value: 'sepia', label: 'Sepia' },
    { value: 'contrast', label: 'High contrast' },
  ],
};
function getSavedThemePreference() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'system' || saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {}
  return 'system';
}

function getSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function resolveTheme(preference) {
  if (preference === 'system') return getSystemTheme();
  return preference;
}

function getNextThemePreference(current) {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

function getThemeLabel(preference, resolved) {
  if (preference === 'system') {
    const resolvedLabel = resolved === 'dark' ? 'Dark' : 'Light';
    return `Theme: System (${resolvedLabel})`;
  }
  return preference === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}

let codeTheme = 'default';
let themePreference = getSavedThemePreference();
let resolvedTheme = resolveTheme(themePreference);
let updateTimer;
let toastTimer;

const shell = document.querySelector('#app-shell');
const brandLogo = document.querySelector('.brand-logo');
const themeButton = document.querySelector('#theme-button');
const previewPane = document.querySelector('#preview-pane');
const preview = document.querySelector('#preview');
const toast = document.querySelector('#toast');
let previewReady = false;
let previewInitialized = false;
let pendingPreviewUpdate = null;
let lastDocType = null;
const splitter = document.querySelector('#splitter');
const editorStack = document.querySelector('#editor-stack');

function getEditorSections() {
  return [...(editorStack?.querySelectorAll('.editor-section') || [])];
}

function getEditorSplitters() {
  return [...(editorStack?.querySelectorAll('.editor-splitter') || [])];
}

const EDITOR_HEADER_HEIGHT = 30;
const EDITOR_MIN_OPEN_HEIGHT = 120;
const EDITOR_OPEN_THRESHOLD = EDITOR_HEADER_HEIGHT + 8;

const initialCode = readCodeFromHash();
const codeValues = { ...initialCode };
document.querySelector('.editor-placeholder')?.replaceChildren(document.createTextNode(codeValues.html));

function updateThemeButton() {
  if (!themeButton) return;
  const label = getThemeLabel(themePreference, resolvedTheme);
  themeButton.innerHTML = THEME_ICONS[themePreference] || THEME_ICONS.system;
  themeButton.title = label;
  themeButton.setAttribute('aria-label', label);
}

function syncCodeThemeOptions() {
  const options = codeThemeOptions[resolvedTheme];
  if (!options.some((option) => option.value === codeTheme)) codeTheme = 'default';
  codeThemeSelect.replaceChildren(
    ...options.map(({ value, label }) => new Option(label, value)),
  );
  codeThemeSelect.value = codeTheme;
}

function applyEditorTheme() {
  document.documentElement.dataset.codeTheme = codeTheme;
  editorRuntime?.applyEditorTheme(resolvedTheme, codeTheme);
}

function safeDecompress(encoded) {
  try {
    const decoded = decompressFromEncodedURIComponent(encoded);
    return decoded === null ? undefined : decoded;
  } catch {
    // A malformed hash should never prevent mylab from opening.
    return undefined;
  }
}

function decodeCompressedHash(params, defaults) {
  const values = { ...defaults };
  for (const key of Object.keys(values)) {
    const encoded = params.get(key);
    const decoded = encoded ? safeDecompress(encoded) : undefined;
    if (decoded !== undefined) values[key] = decoded;
  }
  return values;
}

function readCodeFromHash() {
  const hash = window.location.hash;
  if (!hash) return { ...DEFAULTS };

  const plainProject = readProjectFromHash(hash);
  if (plainProject) return { ...DEFAULTS, ...plainProject };

  return decodeCompressedHash(new URLSearchParams(hash.slice(1)), DEFAULTS);
}

function getCode() {
  return Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, codeValues[key]]));
}

function writeCodeToHash() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(getCode())) {
    params.set(key, compressToEncodedURIComponent(value));
  }

  const nextUrl = `${window.location.pathname}${window.location.search}#${params.toString()}`;
  window.history.replaceState(null, '', nextUrl);
}

function scheduleHashUpdate() {
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(writeCodeToHash, 350);
}

function loadEditorRuntime() {
  if (editorRuntime) return Promise.resolve(editorRuntime);
  if (!editorRuntimePromise) {
    editorRuntimePromise = import('./editor-runtime.js').then((runtime) => {
      editorRuntime = runtime;
      runtime.applyEditorTheme(resolvedTheme, codeTheme);
      return runtime;
    });
  }
  return editorRuntimePromise;
}

function ensureEditor(key) {
  if (editorRuntime?.getEditor(key)) return Promise.resolve(editorRuntime.getEditor(key));

  let promise = editorPromises.get(key);
  if (!promise) {
    promise = loadEditorRuntime()
      .then((runtime) => runtime.createEditor({
        key,
        parent: document.querySelector(`#editor-${key}`),
        doc: codeValues[key],
        onChange: (value) => {
          codeValues[key] = value;
          scheduleHashUpdate();
          if (key === 'css' && previewReady) {
            try {
              preview?.contentWindow?.postMessage(
                { source: 'mylab-preview', type: 'set-css', css: value },
                '*',
              );
              return;
            } catch {}
          }
          schedulePreviewUpdate();
        },
      }))
      .catch((error) => {
        editorPromises.delete(key);
        console.error(`Unable to load ${key} editor`, error);
        showToast(`${key.toUpperCase()} editor unavailable`);
        return null;
      });
    editorPromises.set(key, promise);
  }
  return promise;
}

function setEditorValue(key, value) {
  codeValues[key] = value;
  document.querySelector(`#editor-${key} .editor-placeholder`)?.replaceChildren(document.createTextNode(value));
  editorRuntime?.setEditorValue(key, value);
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme;
  brandLogo?.setAttribute('src', LOGO_PATHS[resolvedTheme]);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  } catch {}
  updateThemeButton();
  syncCodeThemeOptions();
  applyEditorTheme();

  if (previewInitialized) updatePreview();
}

function buildSnippetPreviewDocument() {
  const code = getCode();
  const previewMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const html = code.html.replaceAll('src="/logo.svg"', `src="${LOGO_PATHS[previewMode]}"`);
  const css = code.css;
  const js = code.js;
  const dark = previewMode === 'dark';
  const interceptor = getPreviewConsoleInterceptorScript();

  return `<!doctype html>
<html lang="en" class="${dark ? 'dark' : ''}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${interceptor}
    <style>
      html,
      body {
        min-width: 100%;
        min-height: 100%;
        margin: 0;
      }

      html {
        color-scheme: light;
        color: #202020;
        background: #ffffff;
      }

      html.dark {
        color-scheme: dark;
        color: #ffffff;
        background: #050505;
      }
    </style>
    <style id="preview-style">${css || ''}</style>
  </head>
  <body>
    ${html || ''}
    ${js && js.trim() ? `<script id="mylab-user-js">\ntry {\n${js}\n} catch (error) { console.error(error); }\n</script>` : ''}
  </body>
  <script>
    const activateMarkupScripts = (container = document.body) => {
      for (const script of [...container.querySelectorAll('script:not(#mylab-user-js)')]) {
        if (script.src) {
          const replacement = document.createElement('script');
          for (const attribute of script.attributes) {
            replacement.setAttribute(attribute.name, attribute.value);
          }
          script.replaceWith(replacement);
        } else {
          try {
            new Function(script.textContent)();
          } catch (err) {
            console.error(err);
          }
          script.remove();
        }
      }
    };

    const updatePreview = ({ html, css, js, dark }) => {
      document.documentElement.classList.toggle('dark', dark);
      const style = document.querySelector('#preview-style');
      if (style) style.textContent = css;
      document.body.innerHTML = html;
      activateMarkupScripts();
      try {
        new Function(js)();
      } catch (error) {
        console.error(error);
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      if (!event.data || event.data.source !== 'mylab-preview') return;
      if (event.data.type === 'update') {
        updatePreview(event.data);
      } else if (event.data.type === 'set-css') {
        const style = document.querySelector('#preview-style');
        if (style) style.textContent = event.data.css;
      }
    });
  </script>
</html>`;
}

function getFullDocLiveUpdaterScript() {
  return `<script id="mylab-fulldoc-updater">
(function() {
  function activateScripts(container) {
    for (const script of [...container.querySelectorAll('script:not(#mylab-fulldoc-updater):not(#mylab-console-interceptor)')]) {
      if (script.src) {
        const replacement = document.createElement('script');
        for (const attribute of script.attributes) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
        script.replaceWith(replacement);
      } else {
        try {
          new Function(script.textContent)();
        } catch (err) {
          console.error(err);
        }
        script.remove();
      }
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    if (!event.data || event.data.source !== 'mylab-preview') return;

    if (event.data.type === 'set-css') {
      let style = document.getElementById('mylab-user-css');
      if (!style) {
        style = document.createElement('style');
        style.id = 'mylab-user-css';
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = event.data.css || '';
      return;
    }

    if (event.data.type === 'update-fulldoc') {
      const { bodyHtml, bodyAttrs, htmlAttrs, css, js, dark } = event.data;
      document.documentElement.classList.toggle('dark', dark);
      if (htmlAttrs) {
        for (const [k, v] of Object.entries(htmlAttrs)) {
          document.documentElement.setAttribute(k, v);
        }
      }
      let style = document.getElementById('mylab-user-css');
      if (style) style.textContent = css || '';

      if (bodyAttrs && document.body) {
        for (const [k, v] of Object.entries(bodyAttrs)) {
          document.body.setAttribute(k, v);
        }
      }

      if (document.body && bodyHtml !== undefined) {
        document.body.innerHTML = bodyHtml;
        activateScripts(document.body);
      }

      if (js && js.trim()) {
        try {
          new Function(js)();
        } catch (err) {
          console.error(err);
        }
      }
    }
  });
})();
</script>`;
}

function extractFullDocParts(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const headScripts = (headContent.match(/<(?:script|link)[^>]*>/gi) || []).join('\n');

  const bodyMatch = html.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  const bodyAttrsStr = bodyMatch ? bodyMatch[1] : '';
  const bodyHtml = bodyMatch ? bodyMatch[2] : html;

  const htmlMatch = html.match(/<html([^>]*)>/i);
  const htmlAttrsStr = htmlMatch ? htmlMatch[1] : '';

  return { headScripts, bodyHtml, bodyAttrsStr, htmlAttrsStr };
}

function parseAttributes(attrStr) {
  const attrs = {};
  if (!attrStr) return attrs;
  const regex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
  let match;
  while ((match = regex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2] !== undefined ? match[2] : '';
  }
  return attrs;
}

let lastHeadSignature = '';

function buildFullPreviewDocument() {
  const code = getCode();
  const previewMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const html = code.html.replaceAll('src="/logo.svg"', `src="${LOGO_PATHS[previewMode]}"`);
  const css = code.css;
  const js = code.js;
  const dark = previewMode === 'dark';

  let fullDoc = html;

  if (dark) {
    if (/<html[^>]*class=["'][^"']*dark[^"']*["']/i.test(fullDoc)) {
      // already has dark class
    } else if (/<html[^>]*class=["']/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<html([^>]*)class=["']([^"']*)["']/i, '<html$1class="$2 dark"');
    } else {
      fullDoc = fullDoc.replace(/<html/i, '<html class="dark"');
    }
  }

  const interceptor = getPreviewConsoleInterceptorScript();
  const updater = getFullDocLiveUpdaterScript();

  if (/<head/i.test(fullDoc)) {
    fullDoc = fullDoc.replace(/<head([^>]*)>/i, `<head$1>\n${interceptor}\n${updater}`);
  } else {
    fullDoc = `${interceptor}\n${updater}\n${fullDoc}`;
  }

  if (css && css.trim()) {
    const styleTag = `<style id="mylab-user-css">\n${css}\n</style>`;
    if (/<\/head>/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<\/head>/i, `${styleTag}\n</head>`);
    } else if (/<body/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<body/i, `${styleTag}\n<body`);
    } else {
      fullDoc = `${styleTag}\n${fullDoc}`;
    }
  } else {
    const styleTag = `<style id="mylab-user-css"></style>`;
    if (/<\/head>/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<\/head>/i, `${styleTag}\n</head>`);
    } else {
      fullDoc = `${styleTag}\n${fullDoc}`;
    }
  }

  if (js && js.trim()) {
    const scriptTag = `<script id="mylab-user-js">\ntry {\n${js}\n} catch(err) { console.error(err); }\n</script>`;
    if (/<\/body>/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<\/body>/i, `${scriptTag}\n</body>`);
    } else {
      fullDoc = `${fullDoc}\n${scriptTag}`;
    }
  }

  return fullDoc;
}

function buildPreviewDocument() {
  const code = getCode();
  const isFullDoc = /^\s*<!doctype\s+/i.test(code.html) || /^\s*<html[\s>]/i.test(code.html);
  return isFullDoc ? buildFullPreviewDocument() : buildSnippetPreviewDocument();
}

function getPreviewUpdate() {
  const code = getCode();
  const previewMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  return {
    ...code,
    html: code.html.replaceAll('src="/logo.svg"', `src="${LOGO_PATHS[previewMode]}"`),
    dark: previewMode === 'dark',
  };
}

function postPreviewUpdate(update) {
  if (!previewReady) {
    pendingPreviewUpdate = update;
    return;
  }

  try {
    preview?.contentWindow?.postMessage(
      { source: 'mylab-preview', type: 'update', ...update },
      '*',
    );
  } catch (e) {
    console.error('Error posting preview update:', e);
  }
}

let previewUpdateTimer;

function schedulePreviewUpdate(delay = 120) {
  window.clearTimeout(previewUpdateTimer);
  previewUpdateTimer = window.setTimeout(updatePreview, delay);
}

function updatePreview() {
  window.clearTimeout(previewUpdateTimer);
  const code = getCode();
  const isFullDoc = /^\s*<!doctype\s+/i.test(code.html) || /^\s*<html[\s>]/i.test(code.html);
  const docType = isFullDoc ? 'fulldoc' : 'snippet';
  logStore.onCodeReload();

  if (!previewInitialized || lastDocType !== docType) {
    previewInitialized = true;
    lastDocType = docType;
    previewReady = false;
    if (isFullDoc) {
      const { headScripts } = extractFullDocParts(code.html);
      lastHeadSignature = headScripts;
      if (preview) preview.srcdoc = buildFullPreviewDocument();
    } else {
      if (preview) {
        preview.srcdoc = buildSnippetPreviewDocument();
        postPreviewUpdate(getPreviewUpdate());
      }
    }
    return;
  }

  if (isFullDoc) {
    const { headScripts, bodyHtml, bodyAttrsStr, htmlAttrsStr } = extractFullDocParts(code.html);
    if (previewReady && headScripts === lastHeadSignature) {
      try {
        const bodyAttrs = parseAttributes(bodyAttrsStr);
        const htmlAttrs = parseAttributes(htmlAttrsStr);
        const previewMode = resolvedTheme === 'dark' ? 'dark' : 'light';
        preview?.contentWindow?.postMessage({
          source: 'mylab-preview',
          type: 'update-fulldoc',
          bodyHtml,
          bodyAttrs,
          htmlAttrs,
          css: code.css,
          js: code.js,
          dark: previewMode === 'dark',
        }, '*');
        return;
      } catch (err) {
        console.error('In-place full document update error:', err);
      }
    }
    lastHeadSignature = headScripts;
    if (preview) preview.srcdoc = buildFullPreviewDocument();
  } else {
    postPreviewUpdate(getPreviewUpdate());
  }
}

// Add message listener for console messages
window.addEventListener('message', (event) => {
  handleConsoleMessage(event);
});


function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

async function copyShareLink() {
  writeCodeToHash();
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Share link copied');
  } catch {
    window.prompt('Copy this share link:', url);
  }
}

function resetMylab() {
  if (!window.confirm('Reset all HTML, CSS, and JavaScript?')) return;
  for (const [key, value] of Object.entries(DEFAULTS)) setEditorValue(key, value);
  writeCodeToHash();
  updatePreview();
  showToast('mylab reset');
}

function getTransitionOrigin(event) {
  if (!event?.currentTarget) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  const buttonRect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || buttonRect.left + buttonRect.width / 2;
  const y = event.clientY || buttonRect.top + buttonRect.height / 2;
  return { x, y };
}

function animateThemeTransition({ x, y }) {
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const small = `circle(0px at ${x}px ${y}px)`;
  const large = `circle(${radius}px at ${x}px ${y}px)`;
  const isDark = resolvedTheme === 'dark';

  document.documentElement.animate(
    { clipPath: isDark ? [large, small] : [small, large] },
    {
      duration: 400,
      easing: 'ease-in',
      pseudoElement: isDark ? '::view-transition-old(root)' : '::view-transition-new(root)',
    },
  );
}

function toggleTheme(event) {
  const nextPreference = getNextThemePreference(themePreference);
  const nextResolvedTheme = resolveTheme(nextPreference);
  const hasVisualChange = nextResolvedTheme !== resolvedTheme;

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!hasVisualChange || typeof document.startViewTransition !== 'function' || prefersReducedMotion) {
    themePreference = nextPreference;
    resolvedTheme = nextResolvedTheme;
    applyTheme();
    return;
  }

  // Event.currentTarget is cleared once this click handler returns, but the
  // View Transition is ready asynchronously. Capture the origin now.
  const origin = getTransitionOrigin(event);
  themePreference = nextPreference;
  resolvedTheme = nextResolvedTheme;
  document.startViewTransition(() => {
    applyTheme();
  }).ready.then(() => animateThemeTransition(origin));
}

const systemThemeMediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function handleSystemThemeChange() {
  if (themePreference !== 'system') return;
  const nextResolvedTheme = getSystemTheme();
  if (nextResolvedTheme === resolvedTheme) {
    updateThemeButton();
    return;
  }

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion) {
    resolvedTheme = nextResolvedTheme;
    applyTheme();
    return;
  }

  const centerOrigin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  resolvedTheme = nextResolvedTheme;
  document.startViewTransition(() => {
    applyTheme();
  }).ready.then(() => animateThemeTransition(centerOrigin));
}

if (typeof systemThemeMediaQuery?.addEventListener === 'function') {
  systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange);
} else if (typeof systemThemeMediaQuery?.addListener === 'function') {
  systemThemeMediaQuery.addListener(handleSystemThemeChange);
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  previewPane.requestFullscreen?.().catch(() => showToast('Fullscreen is unavailable'));
}

function setEditorPaneSize(section, size) {
  section.style.flex = `0 0 ${Math.max(EDITOR_HEADER_HEIGHT, size)}px`;
}

function isOpenSection(section) {
  return section.classList.contains('is-open');
}

function computeOpenSectionHeight(openCount) {
  const sections = getEditorSections();
  const splitters = getEditorSplitters();
  const closedSpace = (sections.length - openCount) * EDITOR_HEADER_HEIGHT;
  const splitterSpace = splitters.reduce((total, splitter) => total + splitter.offsetHeight, 0);
  const openSpace = Math.max(0, editorStack.clientHeight - closedSpace - splitterSpace);
  return openSpace / openCount;
}

function applyEditorPaneLayout(openSections) {
  const openHeight = computeOpenSectionHeight(openSections.length);
  for (const section of getEditorSections()) {
    setEditorPaneSize(section, isOpenSection(section) ? openHeight : EDITOR_HEADER_HEIGHT);
  }
}

function layoutEditorPanes() {
  if (!editorStack) return;
  const openSections = getEditorSections().filter(isOpenSection);
  if (openSections.length) applyEditorPaneLayout(openSections);
}

function requestEditorMeasures() {
  window.requestAnimationFrame(() => {
    for (const section of getEditorSections()) {
      if (!section.classList.contains('is-open')) continue;
      const key = section.dataset.editor;
      if (key === 'html' || key === 'css' || key === 'js') {
        editorRuntime?.requestEditorMeasure(key);
      }
    }
  });
}

function syncSectionAccessibility() {
  for (const section of getEditorSections()) {
    section.querySelector('.section-header')?.setAttribute(
      'aria-expanded',
      String(section.classList.contains('is-open')),
    );
  }
}

function ensureOpenEditors() {
  for (const section of getEditorSections()) {
    if (!section.classList.contains('is-open')) continue;
    const key = section.dataset.editor;
    if (key === 'html' || key === 'css' || key === 'js') {
      ensureEditor(key).then((view) => {
        if (view) view.requestMeasure();
      });
    }
  }
}

function toggleSection(section) {
  const sections = getEditorSections();
  const isOpen = section.classList.contains('is-open');
  const openSections = sections.filter((candidate) => candidate.classList.contains('is-open'));

  if (isOpen && openSections.length === 1) {
    const currentIndex = sections.indexOf(section);
    const nextSection = sections[(currentIndex + 1) % sections.length];
    section.classList.remove('is-open');
    nextSection.classList.add('is-open');
  } else {
    section.classList.toggle('is-open', !isOpen);
  }

  syncSectionAccessibility();
  layoutEditorPanes();
  ensureOpenEditors();
  requestEditorMeasures();
}

function sectionMinimum(section) {
  return section.classList.contains('is-open') ? EDITOR_MIN_OPEN_HEIGHT : EDITOR_HEADER_HEIGHT;
}

function autoOpenSection(section, height) {
  if (!section.classList.contains('is-open') && height > EDITOR_OPEN_THRESHOLD) {
    section.classList.add('is-open');
  }
}

function updateEditorSplit(splitterElement, clientY) {
  const previousSection = splitterElement.previousElementSibling;
  const nextSection = splitterElement.nextElementSibling;
  if (!previousSection?.matches('.editor-section') || !nextSection?.matches('.editor-section')) return;

  const previousRect = previousSection.getBoundingClientRect();
  const totalHeight = previousRect.height + nextSection.getBoundingClientRect().height;
  const previousHeight = Math.min(
    Math.max(clientY - previousRect.top, sectionMinimum(previousSection)),
    totalHeight - sectionMinimum(nextSection),
  );

  autoOpenSection(previousSection, previousHeight);
  autoOpenSection(nextSection, totalHeight - previousHeight);

  setEditorPaneSize(previousSection, previousHeight);
  setEditorPaneSize(nextSection, totalHeight - previousHeight);
  syncSectionAccessibility();
  splitterElement.setAttribute('aria-valuenow', String(Math.round(previousHeight)));
  ensureOpenEditors();
  requestEditorMeasures();
}

function setupEditorSplitter(splitterElement) {
  if (!splitterElement || splitterElement.__hasSplitterBound) return;
  splitterElement.__hasSplitterBound = true;
  let draggingSplitter = false;

  splitterElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    draggingSplitter = true;
    splitterElement.setPointerCapture(event.pointerId);
    editorStack.classList.add('is-editor-resizing');
    document.body.style.cursor = 'row-resize';
  });

  splitterElement.addEventListener('pointermove', (event) => {
    if (draggingSplitter) updateEditorSplit(splitterElement, event.clientY);
  });

  const stopDragging = () => {
    if (!draggingSplitter) return;
    draggingSplitter = false;
    editorStack.classList.remove('is-editor-resizing');
    document.body.style.cursor = '';
  };

  splitterElement.addEventListener('pointerup', stopDragging);
  splitterElement.addEventListener('pointercancel', stopDragging);
  splitterElement.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0;
    if (!direction) return;
    event.preventDefault();
    const currentPosition = splitterElement.getBoundingClientRect().top;
    updateEditorSplit(splitterElement, currentPosition + direction);
  });
}

function setupEditorSplitters() {
  for (const splitterElement of getEditorSplitters()) {
    setupEditorSplitter(splitterElement);
  }
}

window.addEventListener('resize', () => window.requestAnimationFrame(layoutEditorPanes));

function updateSplit(clientX, clientY) {
  const isStacked = window.matchMedia('(max-width: 800px)').matches;
  if (isStacked) {
    const bounds = shell.getBoundingClientRect();
    const size = Math.min(Math.max(clientY - bounds.top, 220), bounds.height - 360);
    shell.style.gridTemplateRows = `${size}px 1px minmax(500px, 1fr)`;
    return;
  }

  const size = Math.min(Math.max(clientX, 260), window.innerWidth - 340);
  shell.style.setProperty('--preview-size', `${size}px`);
}

const ARROW_STEP = 24;

const splitAdjusters = {
  stacked: {
    keys: { ArrowDown: ARROW_STEP, ArrowUp: -ARROW_STEP },
    min: 220,
    get current() { return parseFloat(getComputedStyle(shell).gridTemplateRows.split(' ')[0]) || 220; },
    get max() { return window.innerHeight - 360; },
    apply(value) { shell.style.gridTemplateRows = `${value}px 1px minmax(500px, 1fr)`; },
  },
  side: {
    keys: { ArrowRight: ARROW_STEP, ArrowLeft: -ARROW_STEP },
    min: 260,
    get current() { return parseFloat(getComputedStyle(shell).getPropertyValue('--preview-size')) || window.innerWidth / 2; },
    get max() { return window.innerWidth - 340; },
    apply(value) { shell.style.setProperty('--preview-size', `${value}px`); },
  },
};

function adjustSplit(adjuster, key) {
  const direction = adjuster.keys[key];
  if (direction === undefined) return;
  adjuster.apply(Math.min(Math.max(adjuster.current + direction, adjuster.min), adjuster.max));
}

function setupSplitter() {
  let dragging = false;

  splitter.addEventListener('pointerdown', (event) => {
    dragging = true;
    splitter.setPointerCapture(event.pointerId);
    shell.classList.add('is-resizing');
    document.body.style.cursor = window.matchMedia('(max-width: 800px)').matches ? 'row-resize' : 'col-resize';
  });

  splitter.addEventListener('pointermove', (event) => {
    if (dragging) updateSplit(event.clientX, event.clientY);
  });

  const stopDragging = () => {
    dragging = false;
    shell.classList.remove('is-resizing');
    document.body.style.cursor = '';
  };

  splitter.addEventListener('pointerup', stopDragging);
  splitter.addEventListener('pointercancel', stopDragging);
  const arrowKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  splitter.addEventListener('keydown', (event) => {
    if (!arrowKeys.has(event.key)) return;
    event.preventDefault();
    const adjuster = window.matchMedia('(max-width: 800px)').matches ? splitAdjusters.stacked : splitAdjusters.side;
    adjustSplit(adjuster, event.key);
  });
}

function setupSections() {
  for (const section of getEditorSections()) {
    const header = section.querySelector('.section-header');
    if (header && !header.__hasSectionBound) {
      header.__hasSectionBound = true;
      header.addEventListener('click', (e) => {
        if (e.target.closest('.header-quick-actions') || (e.target.closest('button') && e.target.closest('button') !== header)) return;
        toggleSection(section);
      });
    }
  }
  if (!editorStack.__hasPlaceholderBound) {
    editorStack.__hasPlaceholderBound = true;
    editorStack.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.editor-placeholder')) ensureOpenEditors();
    });
  }
}

function setupActions() {
  document.querySelector('#share-button').addEventListener('click', copyShareLink);
  document.querySelector('#reset-button').addEventListener('click', resetMylab);
  document.querySelector('#fullscreen-button').addEventListener('click', toggleFullscreen);
  document.querySelector('#theme-button').addEventListener('click', toggleTheme);
  codeThemeSelect.addEventListener('change', () => {
    codeTheme = codeThemeSelect.value;
    applyEditorTheme();
    if (codeTheme !== 'default' && codeTheme !== 'contrast') {
      void loadEditorRuntime()
        .then((runtime) => runtime.loadNamedEditorTheme(resolvedTheme, codeTheme))
        .catch((error) => {
          console.error('Unable to load editor theme', error);
          showToast('Editor theme unavailable');
        });
    }
  });
}

function dismissAppSplash() {
  const splash = document.querySelector('#app-splash');
  const appShell = document.querySelector('#app-shell');
  appShell?.classList.add('is-loaded');
  if (splash) {
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 350);
  }
}

window.mylab = Object.freeze({
  buildProjectUrl,
  getProjectUrl: () => buildProjectUrl(getCode()),
  getThemePreference: () => themePreference,
  getResolvedTheme: () => resolvedTheme,
  layoutEditorPanes,
  toggleSection,
  setupSections,
  setupEditorSplitters,
  setupEditorSplitter,
  updatePreview,
  schedulePreviewUpdate,
  postPreviewUpdate,
  getPreviewUpdate,
  buildPreviewDocument,
  buildSnippetPreviewDocument,
  buildFullPreviewDocument,
});

applyTheme();
setupSections();
setupActions();
setupSplitter();
setupEditorSplitters();
preview?.addEventListener('load', () => {
  previewReady = true;
  if (pendingPreviewUpdate) {
    const update = pendingPreviewUpdate;
    pendingPreviewUpdate = null;
    postPreviewUpdate(update);
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(ensureOpenEditors, { timeout: 2000 });
  } else {
    setTimeout(ensureOpenEditors, 200);
  }
});
setupConsoleUi();
updatePreview();

requestAnimationFrame(dismissAppSplash);
