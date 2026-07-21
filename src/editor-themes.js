import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const namedThemePalettes = {
  dark: {
    'one-dark': { background: '#282c34', gutter: '#282c34', foreground: '#abb2bf', gutterForeground: '#abb2bf80', caret: '#528bff', selection: '#3e4451', activeLine: '#2c313c', comment: '#5c6370', string: '#98c379', number: '#d19a66', variable: '#e06c75', keyword: '#c678dd', definition: '#61afef', property: '#e06c75', tag: '#e06c75', punctuation: '#abb2bf', meta: '#61afef' },
    dracula: { background: '#282a36', gutter: '#282a36', foreground: '#f8f8f2', gutterForeground: '#f8f8f280', caret: '#f8f8f2', selection: '#44475a', activeLine: '#343746', comment: '#6272a4', string: '#f1fa8c', number: '#bd93f9', variable: '#f8f8f2', keyword: '#ff79c6', definition: '#50fa7b', property: '#66d9ef', tag: '#ff79c6', punctuation: '#f8f8f2', meta: '#8be9fd' },
    monokai: { background: '#272822', gutter: '#272822', foreground: '#f8f8f2', gutterForeground: '#f8f8f280', caret: '#f8f8f0', selection: '#49483e', activeLine: '#30312a', comment: '#75715e', string: '#e6db74', number: '#ae81ff', variable: '#f8f8f2', keyword: '#f92672', definition: '#a6e22e', property: '#66d9ef', tag: '#f92672', punctuation: '#f8f8f2', meta: '#fd971f' },
    nord: { background: '#2e3440', gutter: '#2e3440', foreground: '#d8dee9', gutterForeground: '#d8dee980', caret: '#88c0d0', selection: '#434c5e', activeLine: '#353c4a', comment: '#616e88', string: '#a3be8c', number: '#b48ead', variable: '#d8dee9', keyword: '#81a1c1', definition: '#88c0d0', property: '#8fbcbb', tag: '#81a1c1', punctuation: '#d8dee9', meta: '#5e81ac' },
  },
  light: {
    github: { background: '#ffffff', gutter: '#ffffff', foreground: '#24292f', gutterForeground: '#57606a80', caret: '#0969da', selection: '#ddf4ff', activeLine: '#f6f8fa', comment: '#6e7781', string: '#0a3069', number: '#0550ae', variable: '#953800', keyword: '#cf222e', definition: '#8250df', property: '#0550ae', tag: '#116329', punctuation: '#57606a', meta: '#8250df' },
    solarized: { background: '#fdf6e3', gutter: '#fdf6e3', foreground: '#657b83', gutterForeground: '#657b8380', caret: '#586e75', selection: '#eee8d5', activeLine: '#f5efdc', comment: '#93a1a1', string: '#2aa198', number: '#d33682', variable: '#268bd2', keyword: '#859900', definition: '#cb4b16', property: '#b58900', tag: '#268bd2', punctuation: '#586e75', meta: '#6c71c4' },
    'nord-light': { background: '#eceff4', gutter: '#eceff4', foreground: '#2e3440', gutterForeground: '#4c566a80', caret: '#5e81ac', selection: '#d8dee9', activeLine: '#e5e9f0', comment: '#8fbcbb', string: '#a3be8c', number: '#b48ead', variable: '#bf616a', keyword: '#5e81ac', definition: '#8fbcbb', property: '#d08770', tag: '#5e81ac', punctuation: '#4c566a', meta: '#b48ead' },
    sepia: { background: '#fbf3e4', gutter: '#fbf3e4', foreground: '#4a4036', gutterForeground: '#7b6f6380', caret: '#9c5b2e', selection: '#f0dfc5', activeLine: '#f7ead8', comment: '#8b8178', string: '#a44735', number: '#7b4c9a', variable: '#587744', keyword: '#8f3f71', definition: '#9c5b2e', property: '#8f672f', tag: '#7b4c9a', punctuation: '#6d6258', meta: '#8f672f' },
  },
};

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

export function createNamedEditorTheme(mode, name) {
  const palette = namedThemePalettes[mode]?.[name];
  return palette ? makePaletteTheme(palette, mode === 'dark') : null;
}
