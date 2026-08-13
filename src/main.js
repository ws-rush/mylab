import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
  decompressFromBase64,
} from 'lz-string';
import { buildProjectUrl, readProjectFromHash } from './project-url.js';
import './styles.css';

const LOGO_PATHS = {
  dark: '/logo.svg',
  light: '/logo-light.svg',
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
let codeTheme = 'default';
let theme = getInitialTheme();
let updateTimer;
let toastTimer;

const shell = document.querySelector('#app-shell');
const brandLogo = document.querySelector('.brand-logo');
const previewPane = document.querySelector('#preview-pane');
const preview = document.querySelector('#preview');
const toast = document.querySelector('#toast');
let previewInitialized = false;
const splitter = document.querySelector('#splitter');
const editorStack = document.querySelector('#editor-stack');
const editorSections = [...document.querySelectorAll('.editor-section')];
const editorSplitters = [...document.querySelectorAll('.editor-splitter')];

const EDITOR_HEADER_HEIGHT = 30;
const EDITOR_MIN_OPEN_HEIGHT = 120;
const EDITOR_OPEN_THRESHOLD = EDITOR_HEADER_HEIGHT + 8;

const initialCode = readCodeFromHash();
const codeValues = { ...initialCode };
document.querySelector('.editor-placeholder')?.replaceChildren(document.createTextNode(codeValues.html));

function getInitialTheme() {
  const saved = window.localStorage.getItem('mylab-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function syncCodeThemeOptions() {
  const options = codeThemeOptions[theme];
  if (!options.some((option) => option.value === codeTheme)) codeTheme = 'default';
  codeThemeSelect.replaceChildren(
    ...options.map(({ value, label }) => new Option(label, value)),
  );
  codeThemeSelect.value = codeTheme;
}

function applyEditorTheme() {
  document.documentElement.dataset.codeTheme = codeTheme;
  editorRuntime?.applyEditorTheme(theme, codeTheme);
}

function safeDecompress(encoded) {
  if (!encoded) return undefined;

  // URLSearchParams converts '+' to ' '. Restore '+' for LZ-string URI/Base64 character sets.
  const candidates = [encoded, encoded.replace(/ /g, '+')];

  for (const str of candidates) {
    try {
      const decoded = decompressFromEncodedURIComponent(str);
      if (decoded) return decoded;
    } catch {}
    try {
      const decoded = decompressFromBase64(str);
      if (decoded) return decoded;
    } catch {}
  }

  return undefined;
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
      runtime.applyEditorTheme(theme, codeTheme);
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
          updatePreview();
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
  document.documentElement.dataset.theme = theme;
  brandLogo?.setAttribute('src', LOGO_PATHS[theme]);
  window.localStorage.setItem('mylab-theme', theme);
  syncCodeThemeOptions();
  applyEditorTheme();

  if (previewInitialized) updatePreview();
}

function buildPreviewDocument() {
  const code = getCode();
  const previewMode = theme === 'dark' ? 'dark' : 'light';
  const html = code.html.replaceAll('src="/logo.svg"', `src="${LOGO_PATHS[previewMode]}"`);
  const css = code.css;
  const js = code.js;
  const dark = previewMode === 'dark';

  const foucGuard = `<style id="mylab-hide-fouc">
    html { opacity: 0 !important; visibility: hidden !important; }
    html.mylab-ready { opacity: 1 !important; visibility: visible !important; transition: opacity 0.15s ease-in-out !important; }
  </style>
  <script id="mylab-fouc-script">
    (function() {
      let revealed = false;
      let checkCount = 0;
      const initialStyleCount = document.head.querySelectorAll('style').length;

      const reveal = function() {
        if (revealed) return;
        revealed = true;
        document.documentElement.classList.add('mylab-ready');
        try {
          window.parent.postMessage({ source: 'mylab-preview', type: 'ready' }, '*');
        } catch (e) {}
      };

      const checkReady = function() {
        checkCount++;
        const hasTailwindScript = !!document.querySelector('script[src*="tailwindcss"]');
        const currentStyleCount = document.head.querySelectorAll('style').length;
        const tailwindStyleAdded = currentStyleCount > initialStyleCount || !!document.querySelector('style[id*="tailwind"]');

        if (hasTailwindScript && !tailwindStyleAdded && checkCount < 40) {
          setTimeout(checkReady, 25);
          return;
        }

        const hasVueScript = !!document.querySelector('script[src*="pocket-vue"]') || !!document.querySelector('script[src*="vue"]') || !!document.querySelector('script[src*="alpine"]');
        const vScopeContainers = document.querySelectorAll('[v-scope]');
        let vueMounted = true;
        if (hasVueScript && vScopeContainers.length > 0) {
          vueMounted = Array.from(vScopeContainers).some(function(el) {
            return el.children.length > 0 || el.textContent.trim().length > 0;
          });
        }

        if (hasVueScript && !vueMounted && checkCount < 40) {
          setTimeout(checkReady, 25);
          return;
        }

        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            setTimeout(reveal, 80);
          });
        });
      };

      if (document.readyState === 'complete') {
        checkReady();
      } else {
        window.addEventListener('load', checkReady, { once: true });
        setTimeout(checkReady, 1500);
      }
    })();
  </script>`;

  const isFullDoc = /^\s*<!doctype\s+/i.test(html) || /^\s*<html[\s>]/i.test(html);

  if (isFullDoc) {
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

    if (/<head/i.test(fullDoc)) {
      fullDoc = fullDoc.replace(/<head([^>]*)>/i, `<head$1>\n${foucGuard}`);
    } else {
      fullDoc = `${foucGuard}\n${fullDoc}`;
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

  return `<!doctype html>
<html lang="en" class="${dark ? 'dark' : ''}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${foucGuard}
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
    ${css && css.trim() ? `<style id="preview-style">\n${css}\n</style>` : '<style id="preview-style"></style>'}
  </head>
  <body>
    ${html}
    ${js && js.trim() ? `<script>\ntry {\n${js}\n} catch (error) { console.error(error); }\n</script>` : ''}
  </body>
</html>`;
}

// Add message listener for preview ready signal
window.addEventListener('message', (event) => {
  if (event.data?.source === 'mylab-preview' && event.data?.type === 'ready') {
    if (preview) preview.style.opacity = '1';
  }
});

function updatePreview() {
  previewInitialized = true;
  if (preview) {
    preview.style.transition = 'opacity 0.15s ease-in-out';
    preview.style.opacity = '0';
    preview.srcdoc = buildPreviewDocument();
  }
}


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
  const buttonRect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || buttonRect.left + buttonRect.width / 2;
  const y = event.clientY || buttonRect.top + buttonRect.height / 2;
  return { x, y };
}

function animateThemeTransition({ x, y }) {
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const small = `circle(0px at ${x}px ${y}px)`;
  const large = `circle(${radius}px at ${x}px ${y}px)`;
  const isDark = theme === 'dark';

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
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion) {
    theme = nextTheme;
    applyTheme();
    return;
  }

  // Event.currentTarget is cleared once this click handler returns, but the
  // View Transition is ready asynchronously. Capture the origin now.
  const origin = getTransitionOrigin(event);
  document.startViewTransition(() => {
    theme = nextTheme;
    applyTheme();
  }).ready.then(() => animateThemeTransition(origin));
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
  const closedSpace = (editorSections.length - openCount) * EDITOR_HEADER_HEIGHT;
  const splitterSpace = editorSplitters.reduce((total, splitter) => total + splitter.offsetHeight, 0);
  const openSpace = Math.max(0, editorStack.clientHeight - closedSpace - splitterSpace);
  return openSpace / openCount;
}

function applyEditorPaneLayout(openSections) {
  const openHeight = computeOpenSectionHeight(openSections.length);
  for (const section of editorSections) {
    setEditorPaneSize(section, isOpenSection(section) ? openHeight : EDITOR_HEADER_HEIGHT);
  }
}

function layoutEditorPanes() {
  if (!editorStack) return;
  const openSections = editorSections.filter(isOpenSection);
  if (openSections.length) applyEditorPaneLayout(openSections);
}

function requestEditorMeasures() {
  window.requestAnimationFrame(() => {
    for (const section of editorSections) {
      if (!section.classList.contains('is-open')) continue;
      editorRuntime?.requestEditorMeasure(section.dataset.editor);
    }
  });
}

function syncSectionAccessibility() {
  for (const section of editorSections) {
    section.querySelector('.section-header')?.setAttribute(
      'aria-expanded',
      String(section.classList.contains('is-open')),
    );
  }
}

function ensureOpenEditors() {
  for (const section of editorSections) {
    if (!section.classList.contains('is-open')) continue;
    ensureEditor(section.dataset.editor).then((view) => {
      if (view) view.requestMeasure();
    });
  }
}

function toggleSection(section) {
  const isOpen = section.classList.contains('is-open');
  const openSections = editorSections.filter((candidate) => candidate.classList.contains('is-open'));

  if (isOpen && openSections.length === 1) {
    const currentIndex = editorSections.indexOf(section);
    const nextSection = editorSections[(currentIndex + 1) % editorSections.length];
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

function setupEditorSplitters() {
  let draggingSplitter = null;

  for (const splitterElement of editorSplitters) {
    splitterElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      draggingSplitter = splitterElement;
      splitterElement.setPointerCapture(event.pointerId);
      editorStack.classList.add('is-editor-resizing');
      document.body.style.cursor = 'row-resize';
    });

    splitterElement.addEventListener('pointermove', (event) => {
      if (draggingSplitter === splitterElement) updateEditorSplit(splitterElement, event.clientY);
    });

    const stopDragging = () => {
      if (draggingSplitter !== splitterElement) return;
      draggingSplitter = null;
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

  window.addEventListener('resize', () => window.requestAnimationFrame(layoutEditorPanes));
}

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
  document.querySelectorAll('.editor-section').forEach((section) => {
    section.querySelector('.section-header').addEventListener('click', () => toggleSection(section));
  });
  editorStack.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.editor-placeholder')) ensureOpenEditors();
  });
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
        .then((runtime) => runtime.loadNamedEditorTheme(theme, codeTheme))
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
});

applyTheme();
setupSections();
setupActions();
setupSplitter();
setupEditorSplitters();
preview.addEventListener('load', () => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(ensureOpenEditors, { timeout: 2000 });
  } else {
    setTimeout(ensureOpenEditors, 200);
  }
}, { once: true });
updatePreview();

requestAnimationFrame(dismissAppSplash);
