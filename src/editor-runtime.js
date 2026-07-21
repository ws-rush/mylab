import { minimalSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const editors = new Map();
const themeCompartments = new Map();
const loadedNamedThemes = new Map();
const namedThemePromises = new Map();
const themeState = { mode: 'dark', name: 'default' };

const languageLoaders = {
  html: () => import('@codemirror/lang-html').then(({ html }) => html({ autoCloseTags: true })),
  css: () => import('@codemirror/lang-css').then(({ css }) => css()),
  js: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript()),
};

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
    '&': { color: '#393a34', backgroundColor: '#fdfdfd' },
    '.cm-content': { caretColor: '#59873a' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#59873a' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { backgroundColor: '#d9f0df' },
    '.cm-gutters': { color: '#62645f', backgroundColor: '#f8f8f8' },
    '.cm-activeLine': { backgroundColor: '#f4f4f4' },
    '.cm-activeLineGutter': { backgroundColor: '#eeeeee' },
  },
  { dark: false },
);

const editorSurfacePalettes = {
  dark: {
    default: { background: '#121212', gutter: '#121212', foreground: '#d4cfbf', gutterForeground: '#b8b5ad', caret: '#d4cfbf', selection: '#242424' },
    contrast: { background: '#090909', gutter: '#090909', foreground: '#ffffff', gutterForeground: '#ffffff80', caret: '#ffffff', selection: '#343434' },
  },
  light: {
    default: { background: '#fdfdfd', gutter: '#fdfdfd', foreground: '#393a34', gutterForeground: '#62645f', caret: '#59873a', selection: '#d9f0df' },
    contrast: { background: '#ffffff', gutter: '#ffffff', foreground: '#202020', gutterForeground: '#20202080', caret: '#202020', selection: '#e1e9f5' },
  },
};

function editorTheme() {
  const namedTheme = loadedNamedThemes.get(`${themeState.mode}:${themeState.name}`);
  if (namedTheme) return namedTheme;

  if (themeState.mode === 'dark') {
    return themeState.name === 'contrast'
      ? [contrastDarkEditorTheme, syntaxHighlighting(contrastDarkHighlightStyle)]
      : [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)];
  }

  return themeState.name === 'contrast'
    ? [contrastLightEditorTheme, syntaxHighlighting(contrastLightHighlightStyle)]
    : [lightEditorTheme, syntaxHighlighting(lightHighlightStyle)];
}

function applySurfacePalette() {
  const palette = editorSurfacePalettes[themeState.mode][themeState.name] || editorSurfacePalettes[themeState.mode].default;
  document.documentElement.dataset.codeTheme = themeState.name;
  document.documentElement.style.setProperty('--code-background', palette.background);
  document.documentElement.style.setProperty('--code-gutter', palette.gutter);
  document.documentElement.style.setProperty('--code-foreground', palette.foreground);
  document.documentElement.style.setProperty('--code-gutter-foreground', palette.gutterForeground);
  document.documentElement.style.setProperty('--code-caret', palette.caret);
  document.documentElement.style.setProperty('--code-selection', palette.selection);
  document.documentElement.style.setProperty(
    '--code-active-line',
    palette.activeLine || (themeState.mode === 'dark' ? 'rgba(77, 77, 77, 0.16)' : 'rgba(201, 201, 201, 0.063)'),
  );
  document.documentElement.style.setProperty(
    '--code-active-border',
    themeState.mode === 'dark' ? 'rgba(58, 58, 58, 0.5)' : 'rgba(176, 176, 176, 0.19)',
  );
}

export function applyEditorTheme(mode, name) {
  themeState.mode = mode;
  themeState.name = name;
  applySurfacePalette();
  for (const [key, view] of editors) {
    view.dispatch({ effects: themeCompartments.get(key).reconfigure(editorTheme()) });
  }
}

export async function loadNamedEditorTheme(mode, name) {
  const themeKey = `${mode}:${name}`;
  if (loadedNamedThemes.has(themeKey)) return loadedNamedThemes.get(themeKey);

  let promise = namedThemePromises.get(themeKey);
  if (!promise) {
    promise = import('./editor-themes.js').then(({ createNamedEditorTheme }) => {
      const extension = createNamedEditorTheme(mode, name);
      if (!extension) return null;
      loadedNamedThemes.set(themeKey, extension);
      editorSurfacePalettes[mode][name] = extension.palette;
      return extension;
    });
    namedThemePromises.set(themeKey, promise);
  }

  const extension = await promise;
  if (themeState.mode === mode && themeState.name === name) applyEditorTheme(mode, name);
  return extension;
}

function loadLanguage(key, view, languageCompartment, delay) {
  window.setTimeout(() => {
    void languageLoaders[key]().then((languageExtension) => {
      if (editors.get(key) !== view) return;
      view.dispatch({ effects: languageCompartment.reconfigure(languageExtension) });
    }).catch((error) => {
      console.error(`Unable to load ${key} language`, error);
    });
  }, delay);
}

export function createEditor({ key, parent, doc, onChange }) {
  if (editors.has(key)) return editors.get(key);

  parent.querySelector('.editor-placeholder')?.remove();
  const themeCompartment = new Compartment();
  const languageCompartment = new Compartment();
  themeCompartments.set(key, themeCompartment);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        minimalSetup,
        lineNumbers(),
        foldGutter(),
        bracketMatching(),
        keymap.of([...foldKeymap, indentWithTab]),
        languageCompartment.of([]),
        themeCompartment.of(editorTheme()),
        EditorView.contentAttributes.of({ 'aria-label': `${key.toUpperCase()} code editor` }),
        EditorView.lineWrapping,
        highlightActiveLine(),
        highlightActiveLineGutter(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });

  editors.set(key, view);
  loadLanguage(key, view, languageCompartment, 0);
  return view;
}

export function setEditorValue(key, value) {
  const view = editors.get(key);
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === value) return;
  view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
}

export function getEditor(key) {
  return editors.get(key);
}

export function hasEditors() {
  return editors.size > 0;
}

export function requestEditorMeasure(key) {
  editors.get(key)?.requestMeasure();
}
