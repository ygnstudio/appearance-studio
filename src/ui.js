'use strict';
const {Modal, Notice, FuzzySuggestModal} = require('obsidian');
const {keyOf} = require('./core');
const {colors} = require('./colors');
function el(parent, tag, cls, text) {
 const node = parent.ownerDocument.createElement(tag);
 if (cls) node.className = cls;
 if (text != null) node.textContent = text;
 parent.appendChild(node); return node;
}
function message(error) { return error && error.message || String(error); }
function report(error) { new Notice(message(error), 7000); }
function button(parent, label, action, cls = '') {
 const b = el(parent, 'button', cls, label); b.type = 'button';
 b.addEventListener('click', async () => {
   if (b.disabled) return;
   b.disabled = true;
   try { await action(); } catch (e) { report(e); }
   finally { if (b.isConnected) b.disabled = false; }
 }); return b;
}
class AskModal extends Modal {
 constructor(app, options) { super(app); this.options = options; }
 onOpen() {
   const c = this.contentEl; c.replaceChildren(); c.classList.add('se-dialog');
   el(c,'h2','',this.options.title);
   if (this.options.description) el(c,'p','se-muted',this.options.description);
   if (this.options.value != null) { this.input = el(c,'input','se-name-input'); this.input.value = this.options.value; this.input.setAttribute('aria-label','片段名称'); }
   const err = el(c,'p','se-error'); err.setAttribute('role','alert');
   const row = el(c,'div','se-actions');
   button(row,'取消',() => this.close());
   const submit = button(row,this.options.label || '确定',async () => {
     try { await this.options.action(this.input ? this.input.value : undefined); this.success = true; this.close(); }
     catch (e) { err.textContent = message(e); }
   },this.options.danger ? 'mod-warning' : 'mod-cta');
   if (this.input) {
     this.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {e.preventDefault(); submit.click();} });
     this.input.focus(); this.input.select();
   }
 }
 onClose() { this.options.closed?.(!!this.success); this.contentEl.replaceChildren(); }
}
function ask(app, options) { return new Promise(resolve => new AskModal(app,{...options,closed:resolve}).open()); }
class Picker extends FuzzySuggestModal {
 constructor(plugin, paths) { super(plugin.app); this.plugin = plugin; this.paths = paths; this.setPlaceholder('搜索片段名称…'); this.setInstructions([{command:'↵',purpose:'打开编辑'},{command:'Shift ↵',purpose:'启用 / 停用'},{command:'Esc',purpose:'关闭'}]); }
 getItems() { return this.paths; }
 getItemText(path) { return keyOf(path); }
 renderSuggestion(item, node) { super.renderSuggestion(item,node); el(node,'small','se-picker-state',this.plugin.store.enabled(item.item) ? '已启用' : '已停用'); }
 onChooseItem(path, event) { this.plugin.safe(() => event?.shiftKey ? this.plugin.store.toggle(path) : this.plugin.openSnippetEditor(path)); }
}
class HistoryModal extends Modal {
 constructor(plugin, path) { super(plugin.app); this.plugin=plugin; this.path=path; }
 onOpen() {
  this.contentEl.classList.add('se-dialog'); el(this.contentEl,'h2','','历史与恢复');
  el(this.contentEl,'p','se-muted','保存、放弃草稿和删除前自动留存。每个片段最多 10 份，合计最多 50 份。选择版本查看内容，再恢复为草稿。');
  const entries=this.plugin.data.history.filter(h => !this.path || h.path===this.path);
  if (!entries.length) el(this.contentEl,'p','','暂无历史版本。');
  const list=el(this.contentEl,'div','se-history-list');
  const preview=el(this.contentEl,'textarea','se-history-preview'); preview.readOnly=true; preview.setAttribute('aria-label','历史版本内容');
  const actions=el(this.contentEl,'div','se-actions');
  for (const h of entries) button(list,keyOf(h.path)+' · '+new Date(h.createdAt).toLocaleString()+' · '+h.reason,() => {
    preview.value=h.text; actions.replaceChildren();
    button(actions,'另存为新片段',() => ask(this.app,{title:'恢复为新片段',value:keyOf(h.path)+'-恢复',label:'创建副本',action:async name => {const path=await this.plugin.store.create(name,h.text); this.close(); await this.plugin.openSnippetEditor(path);}}));
    if (this.path) button(actions,'恢复为当前草稿',async () => {
      const s=await this.plugin.store.open(this.path);
      await ask(this.app,{title:'恢复历史版本',description:'当前编辑内容会先保留到历史；恢复后暂停自动保存，检查后点击保存。',label:'恢复草稿',action:async () => {
        const version=s.version;
        await this.plugin.store.remember(s.path,s.text,'恢复历史前');
        if(s.version!==version)throw new Error('准备恢复时有新输入，已保留新草稿，请重试。');
        this.plugin.pauseAutoSave(s); this.plugin.store.edit(s,h.text); await this.plugin.persist(); this.close();
      }});
    });
  });
 }
 onClose(){this.contentEl.replaceChildren();}
}
class AccentModal extends Modal {
 constructor(plugin) {super(plugin.app);this.plugin=plugin;}
 onOpen(){
  this.contentEl.classList.add('se-dialog');
  el(this.contentEl,'h2','','强调色');
  el(this.contentEl,'p','se-muted','用于选中状态、按钮，以及选择“强调色”的文字和底色。修改后会同步到 Obsidian 外观设置。');
  const grid=el(this.contentEl,'div','se-colors');
  const apply=async color => {if(typeof this.app.vault.setConfig !== 'function') throw new Error('当前版本不支持强调色接口，请到设置 → 外观修改。'); await this.app.vault.setConfig('accentColor',color); this.close();};
  colors.forEach(([name,hex]) => {const title=name;const b=button(grid,title,()=>apply(hex),'se-color');b.style.setProperty('--se-swatch',hex);b.title=title+' '+hex;});
  const row=el(this.contentEl,'div','se-actions');
  const input=el(row,'input');input.type='color';input.value=this.app.vault.getConfig?.('accentColor')||'#C08EAF';input.setAttribute('aria-label','自选强调色');
  button(row,'应用自选色',()=>apply(input.value));button(row,'恢复默认强调色',()=>apply(''));
 }
 onClose(){this.contentEl.replaceChildren();}
}
module.exports={el,button,ask,report,message,Picker,HistoryModal,AccentModal};
