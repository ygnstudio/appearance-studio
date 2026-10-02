'use strict';
const {HISTORY}=require('./constants');
// Storage has no Obsidian/UI dependency so failure and concurrency paths are testable.
const baseName = path => path.split('/').pop();
const keyOf = path => baseName(path).replace(/\.css$/i, '');
function fileName(input) {
  const name = input.trim().replace(/\.css$/i, '');
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) throw new Error('名称不能为空，也不能包含路径、特殊符号或末尾的点。');
  return name + '.css';
}
class ConflictError extends Error {}
class SnippetStore {
  constructor({adapter, configDir, data, persist, enabled, setEnabled, reload, changed = () => {}}) {
    Object.assign(this, {adapter, data, persist, enabled, setEnabled, reload, changed});
    this.dir = configDir.replace(/\/$/, '') + '/snippets';
    this.sessions = new Map();
    this.queue = Promise.resolve();
    this.listeners = new Set();
    data.drafts ||= {};
    data.history ||= [];
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); this.changed(); }
  run(fn) { const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next; }
  check(path) {
    if (typeof path !== 'string' || !path.startsWith(this.dir + '/') || path.slice(this.dir.length + 1).includes('/') || !/\.css$/i.test(path)) throw new Error('只能操作当前库 snippets 文件夹中的 CSS 文件。');
    fileName(baseName(path));
    return path;
  }
  async list() {
    if (!await this.adapter.exists(this.dir)) return [];
    const {files} = await this.adapter.list(this.dir);
    return files.filter(p => /\.css$/i.test(p)).sort((a,b) => a.localeCompare(b, 'zh-Hans-CN', {numeric:true}));
  }
  async open(path) {
    this.check(path);
    return this.run(async () => {
      if (this.sessions.has(path)) return this.sessions.get(path);
      const exists = await this.adapter.exists(path);
      const disk = exists ? await this.adapter.read(path) : null;
      const draft = this.data.drafts[path];
      if (!exists && !draft) throw new Error('片段已不存在。请刷新列表。');
      const s = {path, base: draft ? draft.base : disk, text: draft ? draft.text : disk, version:0, composing:0, saving:false, conflict:!!draft && draft.base !== disk, missing:!exists, error:'', recovered:!!draft};
      this.sessions.set(path, s);
      return s;
    });
  }
  dirty(s) { return s.text !== s.base || s.missing; }
  draft(s) {
    if (this.dirty(s)) this.data.drafts[s.path] = {base:s.base, text:s.text, updatedAt:Date.now()};
    else delete this.data.drafts[s.path];
  }
  edit(s, text) { s.text = text; s.version++; s.error = ''; this.draft(s); this.emit(); }
  async checkpoint() { await this.persist(); }
  async remember(path, text, reason) {
    if (text == null) return;
    const entry = {id:Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9), path, text, reason, createdAt:Date.now()};
    this.data.history.unshift(entry);
    // Limit each file to 10 versions, globally 50. Drafts are never evicted.
    const counts = new Map();
    this.data.history = this.data.history.filter(h => { const n = (counts.get(h.path)||0)+1; counts.set(h.path,n); return n <= HISTORY.perFile; }).slice(0,HISTORY.total);
    await this.persist(); // A failed backup must stop the pending overwrite.
  }
  async save(s) {
    // Capture exactly the text submitted, never re-read textarea after awaiting IO.
    const text = s.text, path = s.path;
    return this.run(async () => {
      if (s.path !== path || !this.sessions.has(path)) throw new Error('片段已移动，请重新保存。');
      if (s.composing) return false;
      s.saving = true; s.error = ''; this.emit();
      try {
        const disk = await this.adapter.exists(path) ? await this.adapter.read(path) : null;
        if (disk !== s.base) { s.conflict = true; s.missing = disk === null; throw new ConflictError('文件已在外部修改或删除。请比较磁盘版本，或另存为副本。'); }
        if (disk === null) throw new ConflictError('原文件已删除，请另存为副本。');
        if (text !== disk) {
          await this.remember(path, disk, '保存前');
          const latest = await this.adapter.exists(path) ? await this.adapter.read(path) : null;
          if (latest !== disk) {s.conflict = true; s.missing = latest === null; throw new ConflictError('备份期间文件被外部修改，已停止保存。');}
          await this.adapter.write(path, text);
        }
        s.base = text; s.conflict = false; s.recovered = false;
        this.draft(s); await this.persist();
        try { await this.reload(); } catch (e) { s.error = '文件已保存，但样式刷新失败：' + e.message; }
        return true;
      } catch (e) { s.error = e.message; this.draft(s); throw e; }
      finally { s.saving = false; this.emit(); }
    });
  }
  async refresh(s) {
    return this.run(async () => {
      if (!this.sessions.has(s.path)) return;
      const disk = await this.adapter.exists(s.path) ? await this.adapter.read(s.path) : null;
      if (disk === s.base) { if (disk !== null && (s.conflict || s.missing)) {s.conflict = false; s.missing = false; s.error = ''; this.draft(s); await this.persist(); this.emit();} return; }
      if (this.dirty(s) || disk === null) { s.conflict = true; s.missing = disk === null; this.draft(s); await this.persist(); }
      else { s.base = disk; s.text = disk; s.version++; s.conflict = false; s.error = ''; }
      this.emit();
    });
  }
  async discard(s) {
    return this.run(async () => {
      if (!await this.adapter.exists(s.path)) throw new Error('原文件已删除。请先另存为副本。');
      const version = s.version;
      await this.remember(s.path, s.text, '放弃草稿前');
      const disk = await this.adapter.read(s.path);
      if (s.version !== version) throw new Error('读取期间有新的输入，已保留新草稿，请重试。');
      s.base = disk; s.text = s.base; s.version++; s.conflict = false; s.missing = false; s.error = ''; s.recovered = false;
      this.draft(s); await this.persist(); this.emit();
    });
  }
  async create(name, text = '/* 在这里编写 CSS。新片段默认停用。 */\n') {
    const path = this.dir + '/' + fileName(name);
    return this.run(async () => {
      if (!await this.adapter.exists(this.dir)) await this.adapter.mkdir(this.dir);
      if (await this.adapter.exists(path)) throw new Error('同名片段已存在，请换一个名称。');
      // Clear stale enabled keys before creating, so a new file cannot activate unexpectedly.
      if (this.enabled(path)) await this.setEnabled(path, false);
      await this.adapter.write(path, text); this.emit(); return path;
    });
  }
  async toggle(path) {
    this.check(path);
    return this.run(async () => {
      if (!await this.adapter.exists(path)) throw new Error('文件已不存在。');
      await this.setEnabled(path, !this.enabled(path)); this.emit();
    });
  }
  async rename(path, name) {
    this.check(path);
    const target = this.dir + '/' + fileName(name);
    return this.run(async () => {
      if (target === path) return path;
      if (await this.adapter.exists(target)) throw new Error('同名片段已存在。');
      const on = this.enabled(path);
      await this.adapter.rename(path, target);
      try { await this.setEnabled(path, false); await this.setEnabled(target, on); }
      catch (error) {
        await this.adapter.rename(target, path);
        await this.setEnabled(target, false).catch(() => {});
        await this.setEnabled(path, on).catch(() => {});
        throw error;
      }
      const s = this.sessions.get(path);
      if (s) { this.sessions.delete(path); s.path = target; this.sessions.set(target, s); }
      if (this.data.drafts[path]) { this.data.drafts[target] = this.data.drafts[path]; delete this.data.drafts[path]; }
      for (const h of this.data.history) if (h.path === path) h.path = target;
      await this.persist(); this.emit(); return target;
    });
  }
  async trash(path) {
    this.check(path);
    return this.run(async () => {
      const s = this.sessions.get(path);
      if (s && this.dirty(s) || this.data.drafts[path]) throw new Error('此片段还有未保存的草稿。请先保存或读取磁盘版本。');
      const text = await this.adapter.read(path);
      await this.remember(path, text, '删除前');
      if (s && this.dirty(s) || this.data.drafts[path]) throw new Error('删除准备期间有新草稿，请先保存。');
      const dir = '.trash/snippet-editor';
      if (!await this.adapter.exists('.trash')) await this.adapter.mkdir('.trash');
      if (!await this.adapter.exists(dir)) await this.adapter.mkdir(dir);
      const target = dir + '/' + Date.now() + '-' + Math.random().toString(36).slice(2,7) + '-' + baseName(path);
      const on = this.enabled(path);
      await this.setEnabled(path, false);
      try { await this.adapter.rename(path, target); }
      catch (e) { await this.setEnabled(path, on).catch(() => {}); throw e; }
      if (s && this.dirty(s)) { s.missing = true; s.conflict = true; this.draft(s); }
      else { this.sessions.delete(path); delete this.data.drafts[path]; }
      await this.persist(); this.emit(); return target;
    });
  }
}
module.exports = {SnippetStore, ConflictError, fileName, keyOf, baseName};
