import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-500.css';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
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
let previewReady = false;
let previewInitialized = false;
let pendingPreviewUpdate = null;

preview.addEventListener('load', () => {
  previewReady = true;
  if (!pendingPreviewUpdate) return;
  const update = pendingPreviewUpdate;
  pendingPreviewUpdate = null;
  postPreviewUpdate(update);
});
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

function readCodeFromHash() {
  const values = { ...DEFAULTS };
  const hash = window.location.hash;
  if (!hash) return values;

  const plainProject = readProjectFromHash(hash);
  if (plainProject) return { ...values, ...plainProject };

  const params = new URLSearchParams(hash.slice(1));
  for (const key of Object.keys(values)) {
    const encoded = params.get(key);
    if (!encoded) continue;

    try {
      const decoded = decompressFromEncodedURIComponent(encoded);
      if (decoded !== null) values[key] = decoded;
    } catch {
      // A malformed hash should never prevent mylab from opening.
    }
  }

  return values;
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
  const previewMode = theme === 'dark' ? 'dark' : 'light';
  return `<!doctype html>
<html lang="en" class="${previewMode === 'dark' ? 'dark' : ''}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
    <style id="preview-style"></style>
  </head>
  <body></body>
  <script>
    const activateMarkupScripts = () => {
      for (const script of [...document.body.querySelectorAll('script')]) {
        const replacement = document.createElement('script');
        for (const attribute of script.attributes) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.textContent = script.textContent;
        script.replaceWith(replacement);
      }
    };

    const updatePreview = ({ html, css, js, dark }) => {
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('#preview-style').textContent = css;
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
      if (event.data?.source !== 'mylab-preview' || event.data.type !== 'update') return;
      updatePreview(event.data);
    });
  </script>
</html>`;
}

function getPreviewUpdate() {
  const code = getCode();
  const previewMode = theme === 'dark' ? 'dark' : 'light';
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

  preview.contentWindow.postMessage(
    { source: 'mylab-preview', type: 'update', ...update },
    '*',
  );
}

function updatePreview() {
  if (!previewInitialized) {
    previewInitialized = true;
    preview.srcdoc = buildPreviewDocument();
  }

  postPreviewUpdate(getPreviewUpdate());
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

function toggleTheme(event) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion) {
    theme = nextTheme;
    applyTheme();
    return;
  }

  const buttonRect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || buttonRect.left + buttonRect.width / 2;
  const y = event.clientY || buttonRect.top + buttonRect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const smallCircle = `circle(0px at ${x}px ${y}px)`;
  const largeCircle = `circle(${radius}px at ${x}px ${y}px)`;

  const transition = document.startViewTransition(() => {
    theme = nextTheme;
    applyTheme();
  });

  transition.ready.then(() => {
    const isDark = theme === 'dark';
    document.documentElement.animate(
      { clipPath: isDark ? [largeCircle, smallCircle] : [smallCircle, largeCircle] },
      {
        duration: 400,
        easing: 'ease-in',
        pseudoElement: isDark ? '::view-transition-old(root)' : '::view-transition-new(root)',
      },
    );
  });
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

function layoutEditorPanes() {
  if (!editorStack) return;

  const openSections = editorSections.filter((section) => section.classList.contains('is-open'));
  if (!openSections.length) return;

  const closedSpace = (editorSections.length - openSections.length) * EDITOR_HEADER_HEIGHT;
  const splitterSpace = editorSplitters.reduce((total, sectionSplitter) => total + sectionSplitter.offsetHeight, 0);
  const openSpace = Math.max(0, editorStack.clientHeight - closedSpace - splitterSpace);
  const openHeight = openSpace / openSections.length;

  for (const section of editorSections) {
    setEditorPaneSize(section, section.classList.contains('is-open') ? openHeight : EDITOR_HEADER_HEIGHT);
  }
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

function updateEditorSplit(splitterElement, clientY) {
  const previousSection = splitterElement.previousElementSibling;
  const nextSection = splitterElement.nextElementSibling;
  if (!previousSection?.matches('.editor-section') || !nextSection?.matches('.editor-section')) return;

  const previousRect = previousSection.getBoundingClientRect();
  const nextRect = nextSection.getBoundingClientRect();
  const totalHeight = previousRect.height + nextRect.height;
  const previousWasOpen = previousSection.classList.contains('is-open');
  const nextWasOpen = nextSection.classList.contains('is-open');
  const previousMinimum = previousWasOpen ? EDITOR_MIN_OPEN_HEIGHT : EDITOR_HEADER_HEIGHT;
  const nextMinimum = nextWasOpen ? EDITOR_MIN_OPEN_HEIGHT : EDITOR_HEADER_HEIGHT;
  const previousHeight = Math.min(
    Math.max(clientY - previousRect.top, previousMinimum),
    totalHeight - nextMinimum,
  );
  const nextHeight = totalHeight - previousHeight;

  if (!previousWasOpen && previousHeight > EDITOR_OPEN_THRESHOLD) previousSection.classList.add('is-open');
  if (!nextWasOpen && nextHeight > EDITOR_OPEN_THRESHOLD) nextSection.classList.add('is-open');

  setEditorPaneSize(previousSection, previousHeight);
  setEditorPaneSize(nextSection, nextHeight);
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
  splitter.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const isStacked = window.matchMedia('(max-width: 800px)').matches;
    if (isStacked) {
      const current = parseFloat(getComputedStyle(shell).gridTemplateRows.split(' ')[0]);
      const direction = event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0;
      if (direction) shell.style.gridTemplateRows = `${Math.min(Math.max(current + direction, 220), window.innerHeight - 360)}px 1px minmax(500px, 1fr)`;
    } else {
      const current = parseFloat(getComputedStyle(shell).getPropertyValue('--preview-size')) || window.innerWidth / 2;
      const direction = event.key === 'ArrowRight' ? 24 : event.key === 'ArrowLeft' ? -24 : 0;
      if (direction) shell.style.setProperty('--preview-size', `${Math.min(Math.max(current + direction, 260), window.innerWidth - 340)}px`);
    }
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

window.mylab = Object.freeze({
  buildProjectUrl,
  getProjectUrl: () => buildProjectUrl(getCode()),
});

applyTheme();
setupSections();
setupActions();
setupSplitter();
setupEditorSplitters();
window.setTimeout(() => ensureOpenEditors(), 3000);
updatePreview();
