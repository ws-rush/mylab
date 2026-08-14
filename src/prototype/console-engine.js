/**
 * Console & Error Interceptor Engine for MyLab Playground Prototype
 * Captures console methods (log, info, warn, error, debug, table, clear),
 * runtime errors, syntax errors, and unhandled promise rejections.
 */

// Serializer helper for iframe communication
export function getPreviewInterceptorScript() {
  return `
<script id="mylab-console-interceptor">
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
      const fnStr = val.toString();
      const fnName = val.name ? ' ' + val.name : '';
      return {
        type: 'function',
        name: val.name || 'anonymous',
        value: fnStr,
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

      // Plain or custom object
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

  // Intercept standard console methods
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

  // Top-level error and syntax error capture
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

  // Unhandled promise rejection capture
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

// In-memory Log Store for Parent Shell
class LogStore {
  constructor() {
    this.entries = [];
    this.listeners = new Set();
    this.unreadErrors = 0;
    this.unreadWarnings = 0;
    this.unreadLogs = 0;
    this.autoClearOnRun = true;
    this.filter = 'all'; // all, log, warn, error
    this.searchQuery = '';
    this.fatalError = null;
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

    if (entry.level === 'error' || entry.category === 'syntax' || entry.category === 'runtime' || entry.category === 'unhandledrejection') {
      this.unreadErrors++;
      if (entry.category === 'syntax' || entry.isFatal) {
        this.fatalError = enriched;
      }
    } else if (entry.level === 'warn') {
      this.unreadWarnings++;
    } else {
      this.unreadLogs++;
    }

    this.entries.push(enriched);
    if (this.entries.length > 500) {
      this.entries.shift();
    }
    this.notify();
  }

  clear() {
    this.entries = [];
    this.unreadErrors = 0;
    this.unreadWarnings = 0;
    this.unreadLogs = 0;
    this.fatalError = null;
    this.notify();
  }

  clearFatalError() {
    this.fatalError = null;
    this.notify();
  }

  onCodeReload() {
    if (this.autoClearOnRun) {
      this.clear();
    }
  }

  getFilteredEntries() {
    return this.entries.filter((entry) => {
      // Level filter
      if (this.filter === 'error') {
        const isErr = entry.level === 'error' || entry.category === 'syntax' || entry.category === 'runtime' || entry.category === 'unhandledrejection';
        if (!isErr) return false;
      } else if (this.filter === 'warn') {
        if (entry.level !== 'warn') return false;
      } else if (this.filter === 'log') {
        if (entry.level === 'warn' || entry.level === 'error' || entry.category) return false;
      }

      // Search query
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const msg = (entry.message || (entry.args ? entry.args.map(a => a.preview || a.value).join(' ') : '')).toLowerCase();
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

export const logStore = new LogStore();
