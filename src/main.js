import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-500.css';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { tags } from '@lezer/highlight';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
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

const editors = new Map();
const themeCompartments = new Map();
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
let previewTimer;

const shell = document.querySelector('#app-shell');
const brandLogo = document.querySelector('.brand-logo');
const previewPane = document.querySelector('#preview-pane');
const preview = document.querySelector('#preview');
const previewState = document.querySelector('#preview-state');
const toast = document.querySelector('#toast');
const splitter = document.querySelector('#splitter');

const initialCode = readCodeFromHash();

const languageExtensions = {
  html: () => html({ autoCloseTags: true }),
  css: () => css(),
  js: () => javascript(),
};

function getInitialTheme() {
  const saved = window.localStorage.getItem('mylab-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#758575' },
  { tag: [tags.string, tags.special(tags.string)], color: '#d48372' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#6394bf' },
  { tag: tags.variableName, color: '#c2b36e' },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: '#4d9375' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: '#cb7676' },
  { tag: [tags.propertyName, tags.className, tags.typeName], color: '#dd8e6e' },
  { tag: [tags.tagName, tags.labelName], color: '#73a7b8' },
  { tag: [tags.punctuation, tags.bracket, tags.angleBracket], color: '#858585' },
  { tag: tags.meta, color: '#bd976a' },
]);

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#a0ada0' },
  { tag: [tags.string, tags.special(tags.string)], color: '#b56959' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#296aa3' },
  { tag: tags.variableName, color: '#59873a' },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: '#1c6b48' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: '#ab5959' },
  { tag: [tags.propertyName, tags.className, tags.typeName], color: '#b58451' },
  { tag: [tags.tagName, tags.labelName], color: '#1c6b48' },
  { tag: [tags.punctuation, tags.bracket], color: '#8e8f8b' },
  { tag: tags.angleBracket, color: '#666666' },
  { tag: tags.meta, color: '#b07d48' },
]);

const contrastDarkHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#9aa89a' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ff9f8f' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#7db9ff' },
  { tag: tags.variableName, color: '#f1d76b' },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: '#71d69b' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: '#ff8f9b' },
  { tag: [tags.propertyName, tags.className, tags.typeName], color: '#ffb18b' },
  { tag: [tags.tagName, tags.labelName], color: '#8dd8ed' },
  { tag: [tags.punctuation, tags.bracket, tags.angleBracket], color: '#b9b9b9' },
  { tag: tags.meta, color: '#e6b777' },
]);

const contrastLightHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#718371' },
  { tag: [tags.string, tags.special(tags.string)], color: '#9d3f31' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#145a9e' },
  { tag: tags.variableName, color: '#396c20' },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: '#075b38' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: '#8d2d38' },
  { tag: [tags.propertyName, tags.className, tags.typeName], color: '#855719' },
  { tag: [tags.tagName, tags.labelName], color: '#075b38' },
  { tag: [tags.punctuation, tags.bracket], color: '#5c605b' },
  { tag: tags.angleBracket, color: '#444844' },
  { tag: tags.meta, color: '#874b0e' },
]);

const contrastDarkEditorTheme = EditorView.theme(
  {
    '&': { color: '#ffffff', backgroundColor: '#090909' },
    '.cm-content': { caretColor: '#ffffff' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffffff' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: '#343434' },
    '.cm-gutters': { color: '#ffffff80', backgroundColor: '#090909' },
  },
  { dark: true },
);

const contrastLightEditorTheme = EditorView.theme(
  {
    '&': { color: '#202020', backgroundColor: '#ffffff' },
    '.cm-content': { caretColor: '#202020' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#202020' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: '#e1e9f5' },
    '.cm-gutters': { color: '#20202080', backgroundColor: '#ffffff' },
  },
  { dark: false },
);

const darkEditorTheme = EditorView.theme(
  {
    '&': { color: '#d4cfbf', backgroundColor: '#121212' },
    '.cm-content': { caretColor: '#d4cfbf' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#d4cfbf' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: '#242424' },
    '.cm-gutters': { color: '#dedcd530', backgroundColor: '#121212' },
    '.cm-activeLine': { backgroundColor: '#4d4d4d29' },
    '.cm-activeLineGutter': { backgroundColor: '#4d4d4d29' },
  },
  { dark: true },
);

const lightEditorTheme = EditorView.theme(
  {
    '&': { color: 'rgba(57, 58, 52, 0.5)', backgroundColor: '#fdfdfd' },
    '.cm-content': { caretColor: '#59873a' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#59873a' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: '#d9f0df' },
    '.cm-gutters': { color: '#a0a1a7', backgroundColor: '#f8f8f8' },
    '.cm-activeLine': { backgroundColor: '#f4f4f4' },
    '.cm-activeLineGutter': { backgroundColor: '#eeeeee' },
  },
  { dark: false },
);

function makePaletteTheme(palette, isDark) {
  const highlightStyle = HighlightStyle.define([
    { tag: tags.comment, color: palette.comment },
    { tag: [tags.string, tags.special(tags.string)], color: palette.string },
    { tag: [tags.number, tags.bool, tags.atom], color: palette.number },
    { tag: tags.variableName, color: palette.variable },
    { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: palette.keyword },
    { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: palette.definition },
    { tag: [tags.propertyName, tags.className, tags.typeName], color: palette.property },
    { tag: [tags.tagName, tags.labelName], color: palette.tag },
    { tag: [tags.punctuation, tags.bracket], color: palette.punctuation },
    { tag: tags.angleBracket, color: palette.angleBracket || palette.punctuation },
    { tag: tags.meta, color: palette.meta },
  ]);

  const extensions = [
    EditorView.theme(
      {
        '&': { color: palette.foreground, backgroundColor: palette.background },
        '.cm-content': { color: palette.foreground, caretColor: palette.caret },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.caret },
        '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: palette.selection },
        '.cm-gutters': { color: palette.gutterForeground, backgroundColor: palette.gutter },
        '.cm-activeLine': { backgroundColor: palette.activeLine },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      },
      { dark: isDark },
    ),
    syntaxHighlighting(highlightStyle),
  ];
  extensions.palette = palette;
  return extensions;
}

const namedEditorThemes = {
  dark: {
    'one-dark': makePaletteTheme({ background: '#282c34', gutter: '#282c34', foreground: '#abb2bf', gutterForeground: '#abb2bf80', caret: '#528bff', selection: '#3e4451', activeLine: '#2c313c', comment: '#5c6370', string: '#98c379', number: '#d19a66', variable: '#e06c75', keyword: '#c678dd', definition: '#61afef', property: '#e06c75', tag: '#e06c75', punctuation: '#abb2bf', meta: '#61afef' }, true),
    dracula: makePaletteTheme({ background: '#282a36', gutter: '#282a36', foreground: '#f8f8f2', gutterForeground: '#f8f8f280', caret: '#f8f8f2', selection: '#44475a', activeLine: '#343746', comment: '#6272a4', string: '#f1fa8c', number: '#bd93f9', variable: '#f8f8f2', keyword: '#ff79c6', definition: '#50fa7b', property: '#66d9ef', tag: '#ff79c6', punctuation: '#f8f8f2', meta: '#8be9fd' }, true),
    monokai: makePaletteTheme({ background: '#272822', gutter: '#272822', foreground: '#f8f8f2', gutterForeground: '#f8f8f280', caret: '#f8f8f0', selection: '#49483e', activeLine: '#30312a', comment: '#75715e', string: '#e6db74', number: '#ae81ff', variable: '#f8f8f2', keyword: '#f92672', definition: '#a6e22e', property: '#66d9ef', tag: '#f92672', punctuation: '#f8f8f2', meta: '#fd971f' }, true),
    nord: makePaletteTheme({ background: '#2e3440', gutter: '#2e3440', foreground: '#d8dee9', gutterForeground: '#d8dee980', caret: '#88c0d0', selection: '#434c5e', activeLine: '#353c4a', comment: '#616e88', string: '#a3be8c', number: '#b48ead', variable: '#d8dee9', keyword: '#81a1c1', definition: '#88c0d0', property: '#8fbcbb', tag: '#81a1c1', punctuation: '#d8dee9', meta: '#5e81ac' }, true),
  },
  light: {
    github: makePaletteTheme({ background: '#ffffff', gutter: '#ffffff', foreground: '#24292f', gutterForeground: '#57606a80', caret: '#0969da', selection: '#ddf4ff', activeLine: '#f6f8fa', comment: '#6e7781', string: '#0a3069', number: '#0550ae', variable: '#953800', keyword: '#cf222e', definition: '#8250df', property: '#0550ae', tag: '#116329', punctuation: '#57606a', meta: '#8250df' }, false),
    solarized: makePaletteTheme({ background: '#fdf6e3', gutter: '#fdf6e3', foreground: '#657b83', gutterForeground: '#657b8380', caret: '#586e75', selection: '#eee8d5', activeLine: '#f5efdc', comment: '#93a1a1', string: '#2aa198', number: '#d33682', variable: '#268bd2', keyword: '#859900', definition: '#cb4b16', property: '#b58900', tag: '#268bd2', punctuation: '#586e75', meta: '#6c71c4' }, false),
    'nord-light': makePaletteTheme({ background: '#eceff4', gutter: '#eceff4', foreground: '#2e3440', gutterForeground: '#4c566a80', caret: '#5e81ac', selection: '#d8dee9', activeLine: '#e5e9f0', comment: '#8fbcbb', string: '#a3be8c', number: '#b48ead', variable: '#bf616a', keyword: '#5e81ac', definition: '#8fbcbb', property: '#d08770', tag: '#5e81ac', punctuation: '#4c566a', meta: '#b48ead' }, false),
    sepia: makePaletteTheme({ background: '#fbf3e4', gutter: '#fbf3e4', foreground: '#4a4036', gutterForeground: '#7b6f6380', caret: '#9c5b2e', selection: '#f0dfc5', activeLine: '#f7ead8', comment: '#8b8178', string: '#a44735', number: '#7b4c9a', variable: '#587744', keyword: '#8f3f71', definition: '#9c5b2e', property: '#8f672f', tag: '#7b4c9a', punctuation: '#6d6258', meta: '#8f672f' }, false),
  },
};

const editorSurfacePalettes = {
  dark: {
    default: { background: '#121212', gutter: '#121212', foreground: 'rgba(212, 207, 191, 0.5)', gutterForeground: 'rgba(222, 220, 213, 0.19)', caret: '#d4cfbf', selection: '#242424' },
    contrast: { background: '#090909', gutter: '#090909', foreground: '#ffffff', gutterForeground: '#ffffff80', caret: '#ffffff', selection: '#343434' },
    ...Object.fromEntries(Object.entries(namedEditorThemes.dark).map(([key]) => [key, null])),
  },
  light: {
    default: { background: '#fdfdfd', gutter: '#fdfdfd', foreground: 'rgba(57, 58, 52, 0.5)', gutterForeground: 'rgba(57, 58, 52, 0.5)', caret: '#59873a', selection: '#d9f0df' },
    contrast: { background: '#ffffff', gutter: '#ffffff', foreground: '#202020', gutterForeground: '#20202080', caret: '#202020', selection: '#e1e9f5' },
    ...Object.fromEntries(Object.entries(namedEditorThemes.light).map(([key]) => [key, null])),
  },
};

for (const mode of Object.keys(namedEditorThemes)) {
  for (const [key, themeExtension] of Object.entries(namedEditorThemes[mode])) {
    editorSurfacePalettes[mode][key] = themeExtension.palette;
  }
}

function editorTheme() {
  const namedTheme = namedEditorThemes[theme]?.[codeTheme];
  if (namedTheme) return namedTheme;

  if (theme === 'dark') {
    return codeTheme === 'contrast'
      ? [contrastDarkEditorTheme, syntaxHighlighting(contrastDarkHighlightStyle)]
      : [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)];
  }

  return codeTheme === 'contrast'
    ? [contrastLightEditorTheme, syntaxHighlighting(contrastLightHighlightStyle)]
    : [lightEditorTheme, syntaxHighlighting(lightHighlightStyle)];
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
  const palette = editorSurfacePalettes[theme][codeTheme] || editorSurfacePalettes[theme].default;
  document.documentElement.dataset.codeTheme = codeTheme;
  document.documentElement.style.setProperty('--code-background', palette.background);
  document.documentElement.style.setProperty('--code-gutter', palette.gutter);
  document.documentElement.style.setProperty('--code-foreground', palette.foreground);
  document.documentElement.style.setProperty('--code-gutter-foreground', palette.gutterForeground);
  document.documentElement.style.setProperty('--code-caret', palette.caret);
  document.documentElement.style.setProperty('--code-selection', palette.selection);
  document.documentElement.style.setProperty(
    '--code-active-line',
    palette.activeLine || (theme === 'dark' ? 'rgba(77, 77, 77, 0.16)' : 'rgba(201, 201, 201, 0.063)'),
  );
  document.documentElement.style.setProperty(
    '--code-active-border',
    theme === 'dark' ? 'rgba(58, 58, 58, 0.5)' : 'rgba(176, 176, 176, 0.19)',
  );

  for (const [key, view] of editors) {
    view.dispatch({ effects: themeCompartments.get(key).reconfigure(editorTheme()) });
  }
}

function readCodeFromHash() {
  const values = { ...DEFAULTS };
  const hash = window.location.hash.slice(1);
  if (!hash) return values;

  const params = new URLSearchParams(hash);
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
  return Object.fromEntries([...editors].map(([key, view]) => [key, view.state.doc.toString()]));
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

function schedulePreviewUpdate() {
  window.clearTimeout(previewTimer);
  previewState.classList.add('is-busy');
  previewState.classList.remove('is-error');
  previewState.lastChild.textContent = 'Updating';
  previewTimer = window.setTimeout(updatePreview, 180);
}

function createEditor(key, parent, value) {
  const themeCompartment = new Compartment();
  themeCompartments.set(key, themeCompartment);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        languageExtensions[key](),
        themeCompartment.of(editorTheme()),
        EditorView.lineWrapping,
        highlightActiveLine(),
        highlightActiveLineGutter(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          scheduleHashUpdate();
          schedulePreviewUpdate();
        }),
      ],
    }),
  });

  editors.set(key, view);
  return view;
}

function setEditorValue(key, value) {
  const view = editors.get(key);
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === value) return;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value },
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  brandLogo?.setAttribute('src', LOGO_PATHS[theme]);
  window.localStorage.setItem('mylab-theme', theme);
  syncCodeThemeOptions();
  applyEditorTheme();

  if (editors.size) updatePreview();
}

function escapeClosingTag(value, tag) {
  return value.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

function buildPreviewDocument({ html: markup, css: stylesheet, js: script }) {
  const safeCss = escapeClosingTag(stylesheet, 'style');
  const safeScript = escapeClosingTag(script, 'script');
  const previewMode = theme === 'dark' ? 'dark' : 'light';
  const previewMarkup = markup.replaceAll('src="/logo.svg"', `src="${LOGO_PATHS[previewMode]}"`);
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
    <style>${safeCss}</style>
  </head>
  <body>
    ${previewMarkup}
    <script>
      const reportPreviewError = (error) => parent.postMessage({
        source: 'mylab-preview',
        type: 'error',
        message: error?.message || String(error),
      }, '*');
      window.addEventListener('error', (event) => reportPreviewError(event.error || event.message));
      window.addEventListener('unhandledrejection', (event) => reportPreviewError(event.reason));
      try {
        ${safeScript}
      } catch (error) {
        reportPreviewError(error);
      }
    <\\/script>
  </body>
</html>`;
}

function updatePreview() {
  preview.srcdoc = buildPreviewDocument(getCode());
  previewState.classList.remove('is-busy', 'is-error');
  previewState.lastChild.textContent = 'Ready';
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

function toggleSection(section) {
  const open = section.classList.toggle('is-open');
  const header = section.querySelector('.section-header');
  header.setAttribute('aria-expanded', String(open));

  if (open) {
    const key = section.dataset.editor;
    window.requestAnimationFrame(() => editors.get(key)?.requestMeasure());
  }
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
}

function setupActions() {
  document.querySelector('#share-button').addEventListener('click', copyShareLink);
  document.querySelector('#reset-button').addEventListener('click', resetMylab);
  document.querySelector('#fullscreen-button').addEventListener('click', toggleFullscreen);
  document.querySelector('#theme-button').addEventListener('click', toggleTheme);
  codeThemeSelect.addEventListener('change', () => {
    codeTheme = codeThemeSelect.value;
    applyEditorTheme();
  });
}

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'mylab-preview' || event.data.type !== 'error') return;
  previewState.classList.remove('is-busy');
  previewState.classList.add('is-error');
  previewState.lastChild.textContent = 'Preview error';
});

for (const key of Object.keys(DEFAULTS)) {
  createEditor(key, document.querySelector(`#editor-${key}`), initialCode[key]);
}

applyTheme();
setupSections();
setupActions();
setupSplitter();
updatePreview();
