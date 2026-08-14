/**
 * Shared Rendering Helpers for Console Entries & Object Trees
 */

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
    // Extract column keys from object items
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
