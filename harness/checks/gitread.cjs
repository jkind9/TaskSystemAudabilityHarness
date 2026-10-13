'use strict';
// Read the last commit's files straight from the .git folder, without starting git. Inside Codex's
// Windows sandbox Node may not start any other program (every spawn fails with EPERM, seen in the
// Study 2 lean probe), so `task.js finish` needs this to compare the working tree with the last commit.
// Handles loose objects, version-2 pack indexes with offset and reference deltas, packed refs and a
// detached HEAD; workingFiles lists files the way `git ls-files` plus untracked, non-ignored files would.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function gitDir(root) {
  const dot = path.join(root, '.git');
  if (fs.statSync(dot).isDirectory()) return dot;
  return path.resolve(root, fs.readFileSync(dot, 'utf8').match(/^gitdir:\s*(.+)$/m)[1].trim());
}
function commonDir(dir) {
  const file = path.join(dir, 'commondir');
  return fs.existsSync(file) ? path.resolve(dir, fs.readFileSync(file, 'utf8').trim()) : dir;
}
function resolveRef(dir, ref) {
  for (const base of [dir, commonDir(dir)]) {
    const loose = path.join(base, ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
    const packed = path.join(base, 'packed-refs');
    if (fs.existsSync(packed)) {
      const line = fs.readFileSync(packed, 'utf8').split('\n').find(l => l.endsWith(' ' + ref));
      if (line) return line.split(' ')[0];
    }
  }
  throw new Error('cannot resolve ' + ref);
}

/** Git's delta format: copy ranges of the base object or insert literal bytes. */
function applyDelta(base, delta) {
  let i = 0;
  const varint = () => { let value = 0, shift = 0, c; do { c = delta[i++]; value |= (c & 0x7f) << shift; shift += 7; } while (c & 0x80); return value; };
  varint();
  const out = Buffer.alloc(varint());
  let at = 0;
  while (i < delta.length) {
    const op = delta[i++];
    if (op & 0x80) {
      let offset = 0, size = 0;
      for (let b = 0; b < 4; b++) if (op & (1 << b)) offset |= delta[i++] << (8 * b);
      for (let b = 0; b < 3; b++) if (op & (0x10 << b)) size |= delta[i++] << (8 * b);
      at += base.copy(out, at, offset >>> 0, (offset >>> 0) + (size || 0x10000));
    } else at += delta.copy(out, at, i, (i += op));
  }
  return out;
}

const TYPES = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };

class ObjectStore {
  constructor(dir) {
    this.objects = path.join(commonDir(dir), 'objects');
    const packDir = path.join(this.objects, 'pack');
    this.packs = fs.existsSync(packDir) ? fs.readdirSync(packDir).filter(n => n.endsWith('.idx')).map(n => ({ idx: fs.readFileSync(path.join(packDir, n)), file: path.join(packDir, n.replace(/\.idx$/, '.pack')) })) : [];
  }
  read(sha) {
    const loose = path.join(this.objects, sha.slice(0, 2), sha.slice(2));
    if (fs.existsSync(loose)) {
      const raw = zlib.inflateSync(fs.readFileSync(loose));
      const nul = raw.indexOf(0);
      return { type: raw.subarray(0, raw.indexOf(32)).toString(), data: raw.subarray(nul + 1) };
    }
    for (const pack of this.packs) {
      const offset = packOffset(pack.idx, sha);
      if (offset !== null) return this.readPacked(pack, offset);
    }
    throw new Error('object not found: ' + sha);
  }
  readPacked(pack, offset) {
    pack.data = pack.data || fs.readFileSync(pack.file);
    const buf = pack.data;
    let p = offset, c = buf[p++];
    const type = (c >> 4) & 7;
    while (c & 0x80) c = buf[p++];
    if (type === 6) {
      c = buf[p++];
      let back = c & 0x7f;
      while (c & 0x80) { c = buf[p++]; back = ((back + 1) * 128) + (c & 0x7f); }
      const base = this.readPacked(pack, offset - back);
      return { type: base.type, data: applyDelta(base.data, zlib.inflateSync(buf.subarray(p))) };
    }
    if (type === 7) {
      const base = this.read(buf.subarray(p, p + 20).toString('hex'));
      return { type: base.type, data: applyDelta(base.data, zlib.inflateSync(buf.subarray(p + 20))) };
    }
    return { type: TYPES[type], data: zlib.inflateSync(buf.subarray(p)) };
  }
}

/** Offset of sha in a version-2 pack index, or null. */
function packOffset(idx, sha) {
  const want = Buffer.from(sha, 'hex');
  const count = idx.readUInt32BE(8 + 255 * 4);
  let lo = want[0] ? idx.readUInt32BE(8 + (want[0] - 1) * 4) : 0, hi = idx.readUInt32BE(8 + want[0] * 4);
  const names = 8 + 1024;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const cmp = idx.compare(want, 0, 20, names + mid * 20, names + mid * 20 + 20) * -1;
    if (cmp === 0) {
      const small = idx.readUInt32BE(names + count * 24 + mid * 4);
      if (!(small & 0x80000000)) return small;
      return Number(idx.readBigUInt64BE(names + count * 28 + (small & 0x7fffffff) * 8));
    }
    if (cmp < 0) hi = mid; else lo = mid + 1;
  }
  return null;
}

function walkTree(store, sha, prefix, files) {
  const data = store.read(sha).data;
  for (let i = 0; i < data.length;) {
    const space = data.indexOf(32, i), nul = data.indexOf(0, space);
    const mode = data.subarray(i, space).toString(), name = data.subarray(space + 1, nul).toString('utf8');
    const child = data.subarray(nul + 1, nul + 21).toString('hex');
    i = nul + 21;
    if (mode === '40000') walkTree(store, child, prefix + name + '/', files);
    else if (mode.startsWith('100')) files.set(prefix + name, child);
  }
}

/** { sha, files: Map(path -> blob sha), read(path) -> text } for the commit HEAD points at. */
function headFiles(root) {
  const dir = gitDir(root);
  const head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim();
  const sha = head.startsWith('ref:') ? resolveRef(dir, head.slice(4).trim()) : head;
  const store = new ObjectStore(dir);
  const tree = store.read(sha).data.toString('utf8').match(/^tree ([0-9a-f]{40})/)[1];
  const files = new Map();
  walkTree(store, tree, '', files);
  return { sha, files, read: name => store.read(files.get(name)).data.toString('utf8') };
}

// .gitignore support: last matching rule wins; a pattern with a slash (not only trailing) is anchored
// to its .gitignore's folder; files inside an ignored folder stay ignored.
const ALWAYS_SKIP = new Set(['.git']);
function globRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}
function rulesFrom(text, base) {
  return text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l && !l.startsWith('#')).map(line => {
    const negate = line.startsWith('!');
    let p = negate ? line.slice(1) : line;
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1);
    const anchored = p.includes('/');
    p = p.replace(/^\//, '');
    const body = globRegex(p);
    return { negate, dirOnly, re: new RegExp('^' + (base ? base + '/' : '') + (anchored ? body : '(?:.*/)?' + body) + '$') };
  });
}
function ignored(rules, rel, isDir) {
  let out = false;
  for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(rel)) out = !r.negate;
  return out;
}

/**
 * Tracked files that exist, plus untracked files that .gitignore does not exclude (paths with /).
 * Folders that cannot be read are listed in the result's `skipped` property: inside Codex's sandbox,
 * pytest leaves temporary folders that nothing may open.
 */
function workingFiles(root, tracked = new Set()) {
  const exclude = path.join(gitDir(root), 'info', 'exclude');
  const out = [];
  out.skipped = [];
  const walk = (dir, rel, inherited, insideIgnored) => {
    const gi = path.join(dir, '.gitignore');
    const rules = fs.existsSync(gi) ? [...inherited, ...rulesFrom(fs.readFileSync(gi, 'utf8'), rel)] : inherited;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
      out.skipped.push(rel);
      return;
    }
    for (const entry of entries) {
      const child = rel ? rel + '/' + entry.name : entry.name;
      if (ALWAYS_SKIP.has(entry.name)) continue;
      if (entry.isDirectory()) {
        const skip = insideIgnored || ignored(rules, child, true);
        if (!skip || [...tracked].some(t => t.startsWith(child + '/'))) walk(path.join(dir, entry.name), child, rules, skip);
      } else if (entry.isFile() && (tracked.has(child) || (!insideIgnored && !ignored(rules, child, false)))) out.push(child);
    }
  };
  walk(root, '', fs.existsSync(exclude) ? rulesFrom(fs.readFileSync(exclude, 'utf8'), '') : [], false);
  return out;
}

module.exports = { headFiles, workingFiles, applyDelta, packOffset };
