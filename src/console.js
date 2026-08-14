/**
 * In-Playground Console & Error Output Engine for MyLab
 * Intercepts console logs, syntax errors, and runtime exceptions from the preview iframe
 * and provides state management, serialization, and rendering for the playground console pane.
 */

export function getPreviewConsoleInterceptorScript() {
  return `<script id="mylab-console-interceptor">
(function() {
  function serializeValue(val, depth, seen) {
    if (depth === undefined) depth = 0;
    if (seen === undefined) seen = new WeakSet();

    if (val === null) return { type: 'null', value: 'null', preview: 'null' };
    if (val === undefined) return { type: 'undefined', value: 'undefined', preview: 'undefined' };
    if (typeof val === 'boolean') return { type: 'boolean', value: val, preview: String(val) };
    if (typeof val === 'number') return { type: 'number', value: val, preview: String(val) };
    if (typeof val === 'string') return { type: 'string', value: val, preview: val };
    if (typeof val === 'symbol') return { type: 'symbol', value: val.toString(), preview: val.toString() };
    if (typeof val === 'bigint') return { type: 'bigint', value: val.toString() + 'n', preview: val.toString() + 'n' };
    if (typeof val === 'function') {
      const fnName = val.name ? ' ' + val.name : '';
      return {
        type: 'function',
        name: val.name || 'anonymous',
        value: val.toString(),
        preview: 'ƒ' + fnName + '()'
      };
    }

    if (val instanceof Error) {
      return {
        type: 'error',
        name: val.name || 'Error',
        message: val.message || String(val),
        stack: val.stack || '',
        preview: (val.name || 'Error') + ': ' + (val.message || '')
      };
    }

    if (typeof Element !== 'undefined' && val instanceof Element) {
      const tag = val.tagName ? val.tagName.toLowerCase() : 'element';
      const id = val.id ? '#' + val.id : '';
      const cls = val.className && typeof val.className === 'string' ? '.' + val.className.trim().split(/\\s+/).join('.') : '';
      return {
        type: 'dom',
        tagName: tag,
        id: val.id || null,
        className: val.className || null,
        preview: '<' + tag + id + cls + '>'
      };
    }

    if (typeof val === 'object') {
      if (seen.has(val)) {
        return { type: 'circular', value: '[Circular]', preview: '[Circular]' };
      }
      seen.add(val);

      if (Array.isArray(val)) {
        const len = val.length;
        if (depth > 2) {
          return { type: 'array', length: len, preview: 'Array(' + len + ')' };
        }
        const items = val.slice(0, 30).map(function(item) {
          return serializeValue(item, depth + 1, seen);
        });
        const previewItems = val.slice(0, 3).map(function(item) {
          try { return typeof item === 'string' ? '"' + item + '"' : String(item); } catch(e) { return '?'; }
        }).join(', ');
        return {
          type: 'array',
          length: len,
          items: items,
          preview: '[' + previewItems + (len > 3 ? ', ...' : '') + ']'
        };
      }

      const constructorName = val.constructor ? val.constructor.name : 'Object';
      if (depth > 2) {
        return { type: 'object', constructorName: constructorName, preview: constructorName + ' { ... }' };
      }

      const entries = {};
      let keys = [];
      try {
        keys = Object.keys(val).slice(0, 30);
      } catch(e) {
        keys = [];
      }

      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        try {
          entries[k] = serializeValue(val[k], depth + 1, seen);
        } catch(e) {
          entries[k] = { type: 'string', value: '[Error reading property]', preview: '[Error]' };
        }
      }

      const previewKeys = keys.slice(0, 3).map(function(k) {
        let vPreview = '?';
        try {
          const v = val[k];
          vPreview = typeof v === 'string' ? '"' + v + '"' : typeof v === 'object' && v ? '{...}' : String(v);
        } catch(e) {}
        return k + ': ' + vPreview;
      }).join(', ');

      return {
        type: 'object',
        constructorName: constructorName,
        entries: entries,
        keyCount: Object.keys(val).length,
        preview: (constructorName !== 'Object' ? constructorName + ' ' : '') + '{ ' + previewKeys + (keys.length > 3 ? ', ...' : '') + ' }'
      };
    }

    return { type: typeof val, value: String(val), preview: String(val) };
  }

  function sendToParent(type, payload) {
    try {
      window.parent.postMessage(Object.assign({ source: 'mylab-preview', type: type }, payload), '*');
    } catch(e) {}
  }

  const origConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: (console.debug || console.log).bind(console),
    table: (console.table || console.log).bind(console),
    clear: (console.clear || function(){}).bind(console),
  };

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function(level) {
    console[level] = function() {
      const args = Array.prototype.slice.call(arguments);
      try { origConsole[level].apply(console, args); } catch(e) {}
      const serialized = args.map(function(arg) { return serializeValue(arg); });
      sendToParent('console-log', {
        level: level,
        timestamp: Date.now(),
        args: serialized
      });
    };
  });

  console.table = function() {
    const args = Array.prototype.slice.call(arguments);
    try { origConsole.table.apply(console, args); } catch(e) {}
    const data = args[0];
    const columns = args[1];
    let serializedData = null;
    try {
      serializedData = serializeValue(data);
    } catch(e) {}
    sendToParent('console-table', {
      level: 'table',
      timestamp: Date.now(),
      data: serializedData,
      columns: columns || null,
      args: args.map(function(arg) { return serializeValue(arg); })
    });
  };

  console.clear = function() {
    try { origConsole.clear(); } catch(e) {}
    sendToParent('console-clear', { timestamp: Date.now() });
  };

  window.addEventListener('error', function(event) {
    const isSyntax = event.error instanceof SyntaxError || (event.message && event.message.toLowerCase().includes('syntaxerror'));
    sendToParent('preview-error', {
      category: isSyntax ? 'syntax' : 'runtime',
      message: event.message || 'Unknown runtime error',
      filename: event.filename || 'preview.js',
      lineno: event.lineno || 1,
      colno: event.colno || 1,
      stack: event.error && event.error.stack ? event.error.stack : null,
      errorObj: event.error ? serializeValue(event.error) : null,
      timestamp: Date.now()
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    sendToParent('preview-error', {
      category: 'unhandledrejection',
      message: 'Unhandled Promise Rejection: ' + msg,
      stack: reason instanceof Error && reason.stack ? reason.stack : null,
      errorObj: reason ? serializeValue(reason) : null,
      timestamp: Date.now()
    });
  });
})();
</script>`;
}

export class LogStore {
  constructor() {
    this.entries = [];
    this.listeners = new Set();
    this.autoClearOnRun = true;
    this.filter = 'all';
    this.searchQuery = '';
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (e) {
        console.error('LogStore listener error:', e);
      }
    }
  }

  addEntry(entry) {
    const enriched = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: entry.timestamp || Date.now(),
      ...entry,
    };

    this.entries.push(enriched);
    if (this.entries.length > 500) {
      this.entries.shift();
    }
    this.notify();
  }

  clear() {
    this.entries = [];
    this.notify();
  }

  onCodeReload() {
    if (this.autoClearOnRun) {
      this.clear();
    }
  }

  getFilteredEntries() {
    return this.entries.filter((entry) => {
      if (this.filter === 'error') {
        const isErr = entry.level === 'error' || entry.category === 'syntax' || entry.category === 'runtime' || entry.category === 'unhandledrejection';
        if (!isErr) return false;
      } else if (this.filter === 'warn') {
        if (entry.level !== 'warn') return false;
      } else if (this.filter === 'log') {
        if (entry.level === 'warn' || entry.level === 'error' || entry.category) return false;
      }

      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const msg = (entry.message || (entry.args ? entry.args.map((a) => a.preview || a.value).join(' ') : '')).toLowerCase();
        if (!msg.includes(q)) return false;
      }

      return true;
    });
  }

  getCounts() {
    let errors = 0;
    let warnings = 0;
    let logs = 0;
    for (const e of this.entries) {
      if (e.level === 'error' || e.category === 'syntax' || e.category === 'runtime' || e.category === 'unhandledrejection') {
        errors++;
      } else if (e.level === 'warn') {
        warnings++;
      } else {
        logs++;
      }
    }
    return { errors, warnings, logs, total: this.entries.length };
  }
}

export function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderSerializedValue(item, isTopLevel = false) {
  if (!item) return '<span class="log-null">null</span>';

  switch (item.type) {
    case 'string':
      return isTopLevel
        ? `<span class="log-string-top">${escapeHtml(item.value)}</span>`
        : `<span class="log-string">"${escapeHtml(item.value)}"</span>`;
    case 'number':
      return `<span class="log-number">${item.value}</span>`;
    case 'boolean':
      return `<span class="log-boolean">${item.value}</span>`;
    case 'null':
      return `<span class="log-null">null</span>`;
    case 'undefined':
      return `<span class="log-undefined">undefined</span>`;
    case 'symbol':
      return `<span class="log-symbol">${escapeHtml(item.value)}</span>`;
    case 'bigint':
      return `<span class="log-bigint">${escapeHtml(item.value)}</span>`;
    case 'function':
      return `<span class="log-function" title="${escapeHtml(item.value)}">ƒ ${escapeHtml(item.name)}()</span>`;
    case 'dom':
      return `<span class="log-dom">&lt;${escapeHtml(item.tagName || 'element')}${item.id ? ' id="' + escapeHtml(item.id) + '"' : ''}${item.className ? ' class="' + escapeHtml(item.className) + '"' : ''}&gt;</span>`;
    case 'error':
      return `<span class="log-error-inline">${escapeHtml(item.name)}: ${escapeHtml(item.message)}</span>`;
    case 'array': {
      const items = item.items || [];
      const hasDetails = items.length > 0;
      return `
        <details class="log-tree-node ${hasDetails ? '' : 'is-empty'}">
          <summary class="log-tree-summary">
            <span class="log-tree-preview">Array(${item.length}) ${escapeHtml(item.preview || '')}</span>
          </summary>
          <div class="log-tree-body">
            ${items
              .map(
                (sub, idx) => `
              <div class="log-tree-row">
                <span class="log-tree-key">${idx}:</span>
                <span class="log-tree-val">${renderSerializedValue(sub, false)}</span>
              </div>
            `,
              )
              .join('')}
            <div class="log-tree-row log-tree-meta">
              <span class="log-tree-key">length:</span>
              <span class="log-tree-val"><span class="log-number">${item.length}</span></span>
            </div>
          </div>
        </details>
      `;
    }
    case 'object': {
      const entries = item.entries || {};
      const keys = Object.keys(entries);
      const hasDetails = keys.length > 0;
      return `
        <details class="log-tree-node ${hasDetails ? '' : 'is-empty'}">
          <summary class="log-tree-summary">
            <span class="log-tree-preview">${item.constructorName && item.constructorName !== 'Object' ? '<span class="log-constructor">' + escapeHtml(item.constructorName) + '</span> ' : ''}${escapeHtml(item.preview || '{...}')}</span>
          </summary>
          <div class="log-tree-body">
            ${keys
              .map(
                (k) => `
              <div class="log-tree-row">
                <span class="log-tree-key">${escapeHtml(k)}:</span>
                <span class="log-tree-val">${renderSerializedValue(entries[k], false)}</span>
              </div>
            `,
              )
              .join('')}
            ${item.keyCount > keys.length ? `<div class="log-tree-row log-tree-meta"><span class="log-tree-key">... (${item.keyCount - keys.length} more properties)</span></div>` : ''}
          </div>
        </details>
      `;
    }
    default:
      return `<span class="log-default">${escapeHtml(item.preview || item.value || '')}</span>`;
  }
}

export function renderTable(entry) {
  const data = entry.data;
  if (!data) return '<div class="log-text">Table data unavailable</div>';

  if (data.type === 'array' && data.items) {
    const items = data.items;
    const colSet = new Set();
    items.forEach((it) => {
      if (it.type === 'object' && it.entries) {
        Object.keys(it.entries).forEach((k) => colSet.add(k));
      }
    });
    const cols = entry.columns && entry.columns.length ? entry.columns : Array.from(colSet);

    return `
      <div class="table-scroll-wrap">
        <table class="console-table">
          <thead>
            <tr>
              <th class="table-index">(index)</th>
              ${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${items
              .map((it, idx) => {
                if (it.type === 'object' && it.entries) {
                  return `
                  <tr>
                    <td class="table-index">${idx}</td>
                    ${cols
                      .map((c) => {
                        const val = it.entries[c];
                        return `<td>${val ? renderSerializedValue(val, true) : '<span class="log-undefined">-</span>'}</td>`;
                      })
                      .join('')}
                  </tr>
                `;
                }
                return `
                <tr>
                  <td class="table-index">${idx}</td>
                  <td colspan="${Math.max(1, cols.length)}">${renderSerializedValue(it, true)}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return `<div class="log-args">${renderSerializedValue(data, true)}</div>`;
}

export function renderLogEntryHtml(entry) {
  const isErr = entry.level === 'error' || entry.category === 'syntax' || entry.category === 'runtime' || entry.category === 'unhandledrejection';
  const isWarn = entry.level === 'warn';
  const isTable = entry.level === 'table';

  const levelClass = isErr ? 'entry-error' : isWarn ? 'entry-warn' : isTable ? 'entry-table' : 'entry-log';

  let icon = '•';
  if (isErr) {
    icon = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1Zm0 10.5a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm.9-3.7H7.1l-.3-4.3h2.4Z"/></svg>`;
  } else if (isWarn) {
    icon = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M7.1 2.2a1 1 0 0 1 1.8 0l6.2 10.8a1 1 0 0 1-.9 1.5H1.8a1 1 0 0 1-.9-1.5ZM8 12a1 1 0 1 0-1-1 1 1 0 0 0 1 1Zm-.8-2h1.6l.3-3.5H7Z"/></svg>`;
  } else if (isTable) {
    icon = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11ZM2.5 2a.5.5 0 0 0-.5.5V5h12V2.5a.5.5 0 0 0-.5-.5h-11Zm12 4H9.5v8h4.5a.5.5 0 0 0 .5-.5V6Zm-7 8V6H2v7.5a.5.5 0 0 0 .5.5H7.5Z"/></svg>`;
  } else {
    icon = `<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><circle cx="8" cy="8" r="4.5"/></svg>`;
  }

  let contentHtml = '';

  if (isTable) {
    contentHtml = renderTable(entry);
  } else if (entry.category === 'syntax') {
    contentHtml = `
      <div class="syntax-error-block">
        <div class="syntax-error-title">SyntaxError: ${escapeHtml(entry.message)}</div>
        <div class="syntax-error-location">at ${escapeHtml(entry.filename || 'preview.js')}:${entry.lineno}:${entry.colno}</div>
        <div class="syntax-error-snippet">
          <span class="line-no">${entry.lineno} |</span> <span class="line-code">/* Script parse failure */</span>
          <div class="line-pointer"><span class="pointer-caret">^</span> Syntax error detected before script execution</div>
        </div>
      </div>
    `;
  } else if (entry.category === 'runtime' || entry.category === 'unhandledrejection') {
    contentHtml = `
      <div class="runtime-error-block">
        <div class="runtime-error-title">${escapeHtml(entry.message)}</div>
        ${entry.stack ? `<details class="stack-details"><summary>Stack Trace</summary><pre class="stack-pre">${escapeHtml(entry.stack)}</pre></details>` : ''}
      </div>
    `;
  } else if (entry.args && entry.args.length) {
    contentHtml = `
      <div class="log-args">
        ${entry.args.map((a, i) => renderSerializedValue(a, i === 0 && entry.args.length === 1)).join(' ')}
      </div>
    `;
  } else if (entry.message) {
    contentHtml = `<div class="log-text">${escapeHtml(entry.message)}</div>`;
  }

  return `
    <div class="console-entry ${levelClass}" data-id="${entry.id}">
      <span class="entry-icon">${icon}</span>
      <span class="entry-time">${formatTime(entry.timestamp)}</span>
      <div class="entry-content">${contentHtml}</div>
    </div>
  `;
}

export const logStore = new LogStore();

export function setupConsoleUi(root = document) {
  const section = root.querySelector('#editor-console-section');
  if (!section) return;

  const pills = section.querySelectorAll('.filter-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      logStore.filter = pill.dataset.filter;
      updateConsoleStream(section);
    });
  });

  const search = section.querySelector('#console-search');
  search?.addEventListener('input', (e) => {
    logStore.searchQuery = e.target.value;
    updateConsoleStream(section);
  });

  const autoClear = section.querySelector('#console-autoclear');
  autoClear?.addEventListener('change', (e) => {
    logStore.autoClearOnRun = e.target.checked;
  });

  const headerClearBtn = section.querySelector('#console-header-clear');
  headerClearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    logStore.clear();
  });

  const header = section.querySelector('.section-header');
  header?.addEventListener('keydown', (e) => {
    if (e.target === headerClearBtn) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.mylab?.toggleSection?.(section);
    }
  });

  logStore.subscribe(() => updateConsoleUi(section));
  updateConsoleUi(section);
}

export function updateConsoleUi(section) {
  if (!section) return;
  const counts = logStore.getCounts();

  const errBadge = section.querySelector('#console-badge-error');
  const warnBadge = section.querySelector('#console-badge-warn');
  const logBadge = section.querySelector('#console-badge-log');

  if (errBadge) {
    errBadge.textContent = counts.errors;
    errBadge.classList.toggle('is-hidden', counts.errors === 0);
  }
  if (warnBadge) {
    warnBadge.textContent = counts.warnings;
    warnBadge.classList.toggle('is-hidden', counts.warnings === 0);
  }
  if (logBadge) {
    logBadge.textContent = counts.logs;
    logBadge.classList.toggle('is-hidden', counts.logs === 0 && counts.errors > 0);
  }

  const countAll = section.querySelector('#console-count-all');
  const countLogs = section.querySelector('#console-count-logs');
  const countWarns = section.querySelector('#console-count-warns');
  const countErrors = section.querySelector('#console-count-errors');

  if (countAll) countAll.textContent = counts.total;
  if (countLogs) countLogs.textContent = counts.logs;
  if (countWarns) countWarns.textContent = counts.warnings;
  if (countErrors) countErrors.textContent = counts.errors;

  updateConsoleStream(section);
}

export function updateConsoleStream(section) {
  const stream = section?.querySelector('#console-log-stream');
  if (!stream) return;

  const entries = logStore.getFilteredEntries();
  if (entries.length === 0) {
    stream.innerHTML = `<div class="console-empty-state">No matching console messages.</div>`;
    return;
  }

  stream.innerHTML = entries.map(renderLogEntryHtml).join('');
  stream.scrollTop = stream.scrollHeight;
}

export function handleConsoleMessage(event) {
  const data = event.data;
  if (!data || data.source !== 'mylab-preview') return;

  switch (data.type) {
    case 'console-log':
      logStore.addEntry({
        level: data.level || 'log',
        timestamp: data.timestamp || Date.now(),
        args: data.args || [],
      });
      break;

    case 'console-table':
      logStore.addEntry({
        level: 'table',
        timestamp: data.timestamp || Date.now(),
        data: data.data,
        columns: data.columns,
        args: data.args || [],
      });
      break;

    case 'console-clear':
      logStore.clear();
      break;

    case 'preview-error':
      logStore.addEntry({
        level: 'error',
        category: data.category || 'runtime',
        message: data.message || 'Error executing preview script',
        filename: data.filename,
        lineno: data.lineno,
        colno: data.colno,
        stack: data.stack,
        errorObj: data.errorObj,
        timestamp: data.timestamp || Date.now(),
      });
      break;
  }
}
