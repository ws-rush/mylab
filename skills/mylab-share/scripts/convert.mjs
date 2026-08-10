#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compressToEncodedURIComponent } from './lz-string.mjs';

const PLAY_URL = 'https://mylab.wsm.one/play';
const OPTION_NAMES = new Set(['html', 'css', 'js']);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage: convert.mjs --html=PAGE.html [--css=FIRST.css,SECOND.css] [--js=FIRST.js,SECOND.js]

Print a compact shareable mylab URL for one HTML file and optional CSS and JavaScript files.`);
  process.exitCode = 1;
}

function parseArguments(arguments_) {
  const options = { html: [], css: [], js: [] };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const equalsMatch = /^--(html|css|js)=(.*)$/u.exec(argument);
    const name = equalsMatch?.[1] ?? (argument.startsWith('--') ? argument.slice(2) : '');

    if (!OPTION_NAMES.has(name)) throw new Error(`unknown option "${argument}"`);

    const value = equalsMatch ? equalsMatch[2] : arguments_[index += 1];
    if (!value || value.startsWith('--')) throw new Error(`--${name} needs a path`);

    options[name].push(...value.split(',').filter(Boolean));
  }

  if (options.html.length !== 1) throw new Error('provide exactly one HTML file with --html');
  return options;
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expression = new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\x60]+))`, 'iu');
  const match = expression.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function refersToSource(resource, htmlPath, sourcePaths) {
  if (!resource || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/iu.test(resource)) return false;

  const resourcePath = resource.split(/[?#]/u, 1)[0];
  return sourcePaths.has(path.resolve(path.dirname(htmlPath), resourcePath));
}

function removeSuppliedFileTags(html, htmlPath, cssPaths, jsPaths) {
  const cssSourcePaths = new Set(cssPaths.map((file) => path.resolve(file)));
  const jsSourcePaths = new Set(jsPaths.map((file) => path.resolve(file)));

  let converted = html.replace(/<link\b[^>]*>/giu, (tag) => {
    const rel = readAttribute(tag, 'rel');
    const href = readAttribute(tag, 'href');
    return rel?.split(/\s+/u).includes('stylesheet') && refersToSource(href, htmlPath, cssSourcePaths)
      ? ''
      : tag;
  });

  converted = converted.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, (tag) => {
    const src = readAttribute(tag, 'src');
    return refersToSource(src, htmlPath, jsSourcePaths) ? '' : tag;
  });

  return converted;
}

async function readSources(files) {
  return Promise.all(files.map((file) => readFile(file, 'utf8')));
}

try {
  const options = parseArguments(process.argv.slice(2));
  const htmlPath = path.resolve(options.html[0]);
  const [htmlSource, cssSources, jsSources] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readSources(options.css),
    readSources(options.js),
  ]);

  const hasSeparateFiles = options.css.length > 0 || options.js.length > 0;
  const html = hasSeparateFiles
    ? removeSuppliedFileTags(htmlSource, htmlPath, options.css, options.js)
    : htmlSource;
  const css = cssSources.join('\n');
  const js = jsSources.join('\n;\n');
  const params = new URLSearchParams({
    html: compressToEncodedURIComponent(html),
    css: compressToEncodedURIComponent(css),
    js: compressToEncodedURIComponent(js),
  });

  console.log(`${PLAY_URL}#${params}`);
} catch (error) {
  usage(error instanceof Error ? error.message : String(error));
}
