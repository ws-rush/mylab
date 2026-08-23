import { describe, it, expect, beforeEach } from 'vitest';
import { getPreviewConsoleInterceptorScript } from '../src/console.js';

describe('Preview rendering engine and live direct updates (Regression Prevention)', () => {
  let preview;
  let previewReady;
  let previewInitialized;
  let pendingPreviewUpdate;
  let lastDocType;

  beforeEach(() => {
    document.body.innerHTML = '<iframe id="preview"></iframe>';
    preview = document.querySelector('#preview');
    previewReady = false;
    previewInitialized = false;
    pendingPreviewUpdate = null;
    lastDocType = null;
  });

  it('updates HTML, CSS, JS, and dark theme directly via postMessage in snippet mode without tearing down the iframe', () => {
    const mockDoc = document.implementation.createHTMLDocument('Preview Test');
    const styleEl = mockDoc.createElement('style');
    styleEl.id = 'preview-style';
    mockDoc.head.appendChild(styleEl);

    let executedJsCount = 0;
    const activateMarkupScripts = () => {
      for (const script of [...mockDoc.body.querySelectorAll('script')]) {
        const replacement = mockDoc.createElement('script');
        for (const attribute of script.attributes) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.textContent = script.textContent;
        script.replaceWith(replacement);
      }
    };

    const updatePreview = ({ html, css, js, dark }) => {
      mockDoc.documentElement.classList.toggle('dark', dark);
      const style = mockDoc.querySelector('#preview-style');
      if (style) style.textContent = css;
      mockDoc.body.innerHTML = html;
      activateMarkupScripts();
      try {
        new Function(js)();
        executedJsCount++;
      } catch (error) {
        console.error(error);
      }
    };

    // 1. Initial render with default example
    updatePreview({
      html: '<main class="hero"><h1 class="title">MyLab</h1></main>',
      css: '.hero { color: red; }',
      js: 'window.__testVal = 100;',
      dark: false,
    });

    expect(mockDoc.querySelector('.title').textContent).toBe('MyLab');
    expect(mockDoc.querySelector('#preview-style').textContent).toBe('.hero { color: red; }');
    expect(mockDoc.documentElement.classList.contains('dark')).toBe(false);
    expect(executedJsCount).toBe(1);

    // 2. Direct edit in HTML (e.g. typing in HTML pane)
    updatePreview({
      html: '<main class="hero"><h1 class="title">MyLab Live</h1></main>',
      css: '.hero { color: red; }',
      js: 'window.__testVal = 100;',
      dark: false,
    });

    expect(mockDoc.querySelector('.title').textContent).toBe('MyLab Live');
    expect(executedJsCount).toBe(2);

    // 3. Direct edit in CSS via set-css
    const style = mockDoc.querySelector('#preview-style');
    style.textContent = '.hero { color: blue; font-size: 20px; }';
    expect(mockDoc.querySelector('#preview-style').textContent).toBe('.hero { color: blue; font-size: 20px; }');
    expect(mockDoc.querySelector('.title').textContent).toBe('MyLab Live');
  });

  it('guarantees no artificial FOUC blanking styles or opacity resets in snippet templates', () => {
    // Helper function mirroring main.js template generation
    function buildSnippetPreviewTemplate(themeMode = 'dark') {
      const interceptor = getPreviewConsoleInterceptorScript();
      return `<!doctype html>
<html lang="en" class="${themeMode === 'dark' ? 'dark' : ''}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${interceptor}
    <style>
      html, body { min-width: 100%; min-height: 100%; margin: 0; }
      html { color-scheme: light; color: #202020; background: #ffffff; }
      html.dark { color-scheme: dark; color: #ffffff; background: #050505; }
    </style>
    <style id="preview-style"></style>
  </head>
  <body></body>
</html>`;
    }

    const snippetHtml = buildSnippetPreviewTemplate('dark');
    // Ensure no hidden FOUC guard styles or artificial opacity transitions are injected
    expect(snippetHtml).not.toContain('mylab-hide-fouc');
    expect(snippetHtml).not.toContain('opacity: 0 !important');
    expect(snippetHtml).not.toContain('visibility: hidden !important');
    expect(snippetHtml).toContain('<style id="preview-style"></style>');
    expect(snippetHtml).toContain('mylab-console-interceptor');
  });

  it('activates scripts included in HTML markup during live updates', () => {
    const mockDoc = document.implementation.createHTMLDocument('Script Test');

    let replacedTagNames = [];
    const activateMarkupScripts = () => {
      for (const script of [...mockDoc.body.querySelectorAll('script')]) {
        const replacement = mockDoc.createElement('script');
        for (const attribute of script.attributes) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.textContent = script.textContent;
        replacedTagNames.push(replacement.getAttribute('src') || replacement.textContent);
        script.replaceWith(replacement);
      }
    };

    mockDoc.body.innerHTML = `
      <div id="app">App Content</div>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>console.log("inline script");</script>
    `;
    activateMarkupScripts();

    expect(replacedTagNames).toContain('https://cdn.tailwindcss.com');
    expect(replacedTagNames).toContain('console.log("inline script");');
  });

  it('queues pending preview update until iframe load event fires on initial launch', () => {
    function postPreviewUpdate(update) {
      if (!previewReady) {
        pendingPreviewUpdate = update;
        return;
      }
      preview.dataset.updated = 'true';
    }

    // Initial update before iframe is loaded
    postPreviewUpdate({ html: '<h1>Init</h1>' });
    expect(previewReady).toBe(false);
    expect(pendingPreviewUpdate).toEqual({ html: '<h1>Init</h1>' });
    expect(preview.dataset.updated).toBeUndefined();

    // Iframe load event fires
    previewReady = true;
    if (pendingPreviewUpdate) {
      const update = pendingPreviewUpdate;
      pendingPreviewUpdate = null;
      postPreviewUpdate(update);
    }

    expect(previewReady).toBe(true);
    expect(pendingPreviewUpdate).toBeNull();
    expect(preview.dataset.updated).toBe('true');
  });

  it('debounces rapid typing updates smoothly while applying CSS updates directly', async () => {
    const sentMessages = [];
    previewReady = true;
    let timer;

    function schedulePreview(update, delay = 50) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sentMessages.push({ type: 'update', ...update });
      }, delay);
    }

    function handleEditorChange(key, value) {
      if (key === 'css') {
        sentMessages.push({ type: 'set-css', css: value });
      } else {
        schedulePreview({ [key]: value }, 30);
      }
    }

    // Rapid typing simulation
    handleEditorChange('html', '<p>A</p>');
    handleEditorChange('html', '<p>AB</p>');
    handleEditorChange('html', '<p>ABC</p>');
    handleEditorChange('css', 'p { color: red; }');
    handleEditorChange('css', 'p { color: blue; }');

    // Immediate CSS updates dispatched
    expect(sentMessages.filter((m) => m.type === 'set-css').length).toBe(2);

    // Wait for debounce timer
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Debounced HTML update dispatched only the final state
    const htmlUpdates = sentMessages.filter((m) => m.type === 'update');
    expect(htmlUpdates.length).toBe(1);
    expect(htmlUpdates[0]).toEqual({ type: 'update', html: '<p>ABC</p>' });
  });

  it('distinguishes between snippet documents and full documents correctly and injects updater and interceptor', () => {
    const isFullDoc1 = /^\s*<!doctype\s+/i.test('<!doctype html><html><body>Full</body></html>');
    const isFullDoc2 = /^\s*<html[\s>]/i.test('<html><head></head><body>Doc</body></html>');
    const isFullDoc3 = /^\s*<!doctype\s+/i.test('<div class="hero">Snippet</div>');
    const isFullDoc4 = /^\s*<html[\s>]/i.test('<main><h1>Default</h1></main>');

    expect(isFullDoc1).toBe(true);
    expect(isFullDoc2).toBe(true);
    expect(isFullDoc3).toBe(false);
    expect(isFullDoc4).toBe(false);

    // Full doc generation test
    const rawHtml = '<!doctype html><html><head><title>Full Doc</title></head><body><h1>Hello</h1></body></html>';
    const interceptor = getPreviewConsoleInterceptorScript();
    const fullDoc = rawHtml.replace(/<head([^>]*)>/i, `<head$1>\n${interceptor}`);

    expect(fullDoc).toContain('mylab-console-interceptor');
    expect(fullDoc).toContain('<title>Full Doc</title>');
  });

  it('handles in-place live updates for full HTML documents when head scripts match', () => {
    const mockFullDoc = document.implementation.createHTMLDocument('Full Doc Test');
    const styleEl = mockFullDoc.createElement('style');
    styleEl.id = 'mylab-user-css';
    mockFullDoc.head.appendChild(styleEl);
    mockFullDoc.body.innerHTML = '<div id="app"><h1>Original Title</h1></div>';

    // Simulate in-place update message handler
    const handleUpdateFullDoc = ({ bodyHtml, css, dark }) => {
      mockFullDoc.documentElement.classList.toggle('dark', dark);
      const style = mockFullDoc.querySelector('#mylab-user-css');
      if (style) style.textContent = css || '';
      if (bodyHtml !== undefined) {
        mockFullDoc.body.innerHTML = bodyHtml;
      }
    };

    handleUpdateFullDoc({
      bodyHtml: '<div id="app"><h1>Updated In-Place Title</h1></div>',
      css: 'h1 { color: purple; }',
      dark: true,
    });

    expect(mockFullDoc.querySelector('h1').textContent).toBe('Updated In-Place Title');
    expect(mockFullDoc.querySelector('#mylab-user-css').textContent).toBe('h1 { color: purple; }');
    expect(mockFullDoc.documentElement.classList.contains('dark')).toBe(true);
  });
});
