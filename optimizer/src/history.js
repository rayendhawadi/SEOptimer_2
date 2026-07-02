// Lightweight audit history so we can show how a site's score changes over time.
// Stored as a single JSON file under ./data — good enough for a self-hosted tool.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DIR, 'history.json');
const MAX = 5000;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(arr) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.warn('[history] save failed:', e.message); }
}

export function addEntry(entry) {
  const arr = load();
  arr.push(entry);
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
  save(arr);
}

/** All past entries for a host, oldest first. */
export function getHistory(host) {
  return load().filter((x) => x.host === host).sort((a, b) => a.ts - b.ts);
}
