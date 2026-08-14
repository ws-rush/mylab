import { describe, it, expect, beforeEach } from 'vitest';
import {
  LogStore,
  getPreviewConsoleInterceptorScript,
  renderLogEntryHtml,
  renderSerializedValue,
  renderTable,
  escapeHtml,
  formatTime,
  handleConsoleMessage,
  setupConsoleUi,
  logStore,
} from '../src/console.js';

describe('In-Playground Console & Error Output', () => {
  beforeEach(() => {
    logStore.clear();
    logStore.filter = 'all';
    logStore.searchQuery = '';
    logStore.autoClearOnRun = true;
  });

  it('generates the preview console and error interceptor script', () => {
    const script = getPreviewConsoleInterceptorScript();
    expect(script).toContain('id="mylab-console-interceptor"');
    expect(script).toContain('serializeValue');
    expect(script).toContain('mylab-preview');
    expect(script).toContain('window.addEventListener(\'error\'');
    expect(script).toContain('window.addEventListener(\'unhandledrejection\'');
  });

  it('escapes html entities safely', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('formats timestamps accurately', () => {
    const date = new Date(2026, 7, 14, 12, 34, 56, 789);
    const formatted = formatTime(date.getTime());
    expect(formatted).toBe('12:34:56.789');
  });

  it('LogStore manages entries, filters, search, and subscribers', () => {
    const store = new LogStore();
    let notified = 0;
    const unsub = store.subscribe(() => notified++);

    store.addEntry({ level: 'log', message: 'Hello world' });
    store.addEntry({ level: 'warn', message: 'Warning alert' });
    store.addEntry({ level: 'error', message: 'Fatal crash' });

    expect(notified).toBe(3);
    expect(store.entries.length).toBe(3);

    const counts = store.getCounts();
    expect(counts.total).toBe(3);
    expect(counts.logs).toBe(1);
    expect(counts.warnings).toBe(1);
    expect(counts.errors).toBe(1);

    // Filter by errors
    store.filter = 'error';
    expect(store.getFilteredEntries().length).toBe(1);
    expect(store.getFilteredEntries()[0].message).toBe('Fatal crash');

    // Filter by warnings
    store.filter = 'warn';
    expect(store.getFilteredEntries().length).toBe(1);
    expect(store.getFilteredEntries()[0].message).toBe('Warning alert');

    // Search query
    store.filter = 'all';
    store.searchQuery = 'hello';
    expect(store.getFilteredEntries().length).toBe(1);
    expect(store.getFilteredEntries()[0].message).toBe('Hello world');

    // Clear
    store.clear();
    expect(store.entries.length).toBe(0);
    expect(notified).toBe(4);

    unsub();
  });

  it('auto-clears entries on code reload when autoClearOnRun is enabled', () => {
    const store = new LogStore();
    store.addEntry({ level: 'log', message: 'Run 1' });
    expect(store.entries.length).toBe(1);

    store.onCodeReload();
    expect(store.entries.length).toBe(0);

    store.autoClearOnRun = false;
    store.addEntry({ level: 'log', message: 'Run 2' });
    store.onCodeReload();
    expect(store.entries.length).toBe(1);
  });

  it('renders primitive serialized values', () => {
    expect(renderSerializedValue({ type: 'string', value: 'hello' }, true)).toContain('hello');
    expect(renderSerializedValue({ type: 'number', value: 42 }, false)).toContain('42');
    expect(renderSerializedValue({ type: 'boolean', value: true }, false)).toContain('true');
    expect(renderSerializedValue({ type: 'null', value: 'null' }, false)).toContain('null');
    expect(renderSerializedValue({ type: 'undefined', value: 'undefined' }, false)).toContain('undefined');
    expect(renderSerializedValue({ type: 'symbol', value: 'Symbol(foo)' }, false)).toContain('Symbol(foo)');
    expect(renderSerializedValue({ type: 'bigint', value: '999n' }, false)).toContain('999n');
    expect(renderSerializedValue({ type: 'function', name: 'myFn', value: 'function myFn(){}' }, false)).toContain('ƒ myFn()');
    expect(renderSerializedValue({ type: 'dom', tagName: 'div', id: 'app', className: 'box' }, false)).toContain('&lt;div id="app" class="box"&gt;');
  });

  it('renders nested arrays and objects with expandable details trees', () => {
    const arrayVal = {
      type: 'array',
      length: 2,
      preview: '["apple", 42]',
      items: [
        { type: 'string', value: 'apple', preview: 'apple' },
        { type: 'number', value: 42, preview: '42' },
      ],
    };
    const renderedArr = renderSerializedValue(arrayVal);
    expect(renderedArr).toContain('Array(2)');
    expect(renderedArr).toContain('apple');
    expect(renderedArr).toContain('42');

    const objVal = {
      type: 'object',
      constructorName: 'User',
      preview: 'User { name: "Alice", id: 10 }',
      keyCount: 2,
      entries: {
        name: { type: 'string', value: 'Alice', preview: 'Alice' },
        id: { type: 'number', value: 10, preview: '10' },
      },
    };
    const renderedObj = renderSerializedValue(objVal);
    expect(renderedObj).toContain('User');
    expect(renderedObj).toContain('name:');
    expect(renderedObj).toContain('Alice');
  });

  it('renders console.table tabular layout', () => {
    const tableEntry = {
      level: 'table',
      timestamp: Date.now(),
      data: {
        type: 'array',
        length: 2,
        items: [
          {
            type: 'object',
            entries: {
              name: { type: 'string', value: 'Alpha' },
              score: { type: 'number', value: 95 },
            },
          },
          {
            type: 'object',
            entries: {
              name: { type: 'string', value: 'Beta' },
              score: { type: 'number', value: 88 },
            },
          },
        ],
      },
      columns: ['name', 'score'],
    };

    const tableHtml = renderTable(tableEntry);
    expect(tableHtml).toContain('<table class="console-table">');
    expect(tableHtml).toContain('<th>name</th>');
    expect(tableHtml).toContain('<th>score</th>');
    expect(tableHtml).toContain('Alpha');
    expect(tableHtml).toContain('Beta');
  });

  it('renders SyntaxError callouts with location and caret pointer', () => {
    const syntaxEntry = {
      id: 'err1',
      level: 'error',
      category: 'syntax',
      message: "Unexpected token '}'",
      filename: 'preview.js',
      lineno: 7,
      colno: 3,
      timestamp: Date.now(),
    };

    const html = renderLogEntryHtml(syntaxEntry);
    expect(html).toContain('entry-error');
    expect(html).toContain("SyntaxError: Unexpected token '}'");
    expect(html).toContain('at preview.js:7:3');
    expect(html).toContain('Syntax error detected before script execution');
  });

  it('handles postMessage events from preview iframe', () => {
    logStore.clear();

    // 1. console-log
    handleConsoleMessage({
      data: {
        source: 'mylab-preview',
        type: 'console-log',
        level: 'log',
        timestamp: Date.now(),
        args: [{ type: 'string', value: 'Testing logger', preview: 'Testing logger' }],
      },
    });
    expect(logStore.entries.length).toBe(1);
    expect(logStore.entries[0].level).toBe('log');

    // 2. preview-error
    handleConsoleMessage({
      data: {
        source: 'mylab-preview',
        type: 'preview-error',
        category: 'runtime',
        message: 'Cannot read properties of null',
        stack: 'TypeError at preview.js:10:5',
        timestamp: Date.now(),
      },
    });
    expect(logStore.entries.length).toBe(2);
    expect(logStore.entries[1].category).toBe('runtime');

    // 3. console-clear
    handleConsoleMessage({
      data: {
        source: 'mylab-preview',
        type: 'console-clear',
      },
    });
    expect(logStore.entries.length).toBe(0);
  });

  it('interacts with DOM elements via setupConsoleUi', () => {
    document.body.innerHTML = `
      <section class="editor-section is-open" data-editor="console" id="editor-console-section">
        <div class="section-header console-header" role="button" tabindex="0">
          <div class="header-left">
            <span class="badge badge-error is-hidden" id="console-badge-error">0</span>
            <span class="badge badge-warn is-hidden" id="console-badge-warn">0</span>
            <span class="badge badge-log is-hidden" id="console-badge-log">0</span>
          </div>
          <div class="header-quick-actions">
            <button class="header-clear-btn" id="console-header-clear" type="button">Clear</button>
          </div>
        </div>
        <div class="editor-container console-container" id="editor-console">
          <div class="console-toolbar">
            <div class="filter-pills">
              <button class="filter-pill is-active" data-filter="all" type="button">All <span class="pill-count" id="console-count-all">0</span></button>
              <button class="filter-pill" data-filter="log" type="button">Logs <span class="pill-count" id="console-count-logs">0</span></button>
              <button class="filter-pill" data-filter="warn" type="button">Warn <span class="pill-count" id="console-count-warns">0</span></button>
              <button class="filter-pill" data-filter="error" type="button">Errors <span class="pill-count" id="console-count-errors">0</span></button>
            </div>
            <input type="text" class="console-search" id="console-search" />
            <input type="checkbox" id="console-autoclear" checked />
          </div>
          <div class="console-log-stream" id="console-log-stream"></div>
        </div>
      </section>
    `;

    setupConsoleUi(document);

    logStore.addEntry({
      level: 'error',
      category: 'runtime',
      message: 'Uncaught TypeError: test',
      timestamp: Date.now(),
    });

    const badgeErr = document.querySelector('#console-badge-error');
    expect(badgeErr.textContent).toBe('1');
    expect(badgeErr.classList.contains('is-hidden')).toBe(false);

    const stream = document.querySelector('#console-log-stream');
    expect(stream.innerHTML).toContain('Uncaught TypeError: test');

    // Click header clear button
    const clearBtn = document.querySelector('#console-header-clear');
    clearBtn.click();

    expect(logStore.entries.length).toBe(0);
    expect(badgeErr.classList.contains('is-hidden')).toBe(true);
    expect(stream.innerHTML).toContain('No matching console messages.');
  });
});
