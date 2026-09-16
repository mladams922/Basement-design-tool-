import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  sessions: {},
  designs: [],
  walls: [],
  openings: [],
  rooms: [],
  objects: [],
  equipment: [],
  nextId: 1,
};

let cache = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    cache = structuredClone(DEFAULT_DB);
    persist();
    return cache;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  cache = { ...structuredClone(DEFAULT_DB), ...JSON.parse(raw) };
  return cache;
}

function persist() {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

export function getDB() {
  if (!cache) load();
  return cache;
}

export function saveDB() {
  persist();
}

export function nextId() {
  const db = getDB();
  return db.nextId++;
}
