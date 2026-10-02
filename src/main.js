'use strict';
const {TIMING,HISTORY}=require('./constants');
const {Plugin,PluginSettingTab,Setting,Notice,Platform}=require('obsidian');
const {SnippetStore,keyOf}=require('./core');
const {SnippetEditorView,VIEW_TYPE}=require('./view');
const {BuiltinManager,BuiltinStyleEngine}=require('./builtin');
const {capabilities}=require('./capabilities');
const {NativeAppearance}=require('./native-appearance');
const {Picker,HistoryModal,report}=require('./ui');
const DEFAULTS={mode:'panel',wrap:true,confirmDelete:true,autoSave:true};
class SnippetEditorSettingTab extends PluginSettingTab {
 display(){
  const c=this.containerEl;c.replaceChildren();
  new Setting(c).setName('外观设置').setDesc('调整阅读排版、界面与窗口效果。').addButton(b=>b.setButtonText('打开外观面板').onClick(()=>this.plugin.safe(()=>this.plugin.openAppearance())));
  if(this.plugin.builtin.config)new Setting(c).setName('启用外观').setDesc('暂停本插件的外观调整并保留参数。已启用的 CSS 片段仍会生效。').addToggle(t=>t.setValue(this.plugin.builtin.config.enabled).onChange(v=>this.plugin.safe(()=>this.plugin.builtin.update({enabled:v}))));
  new Setting(c).setName('打开方式').setDesc('侧栏刷子图标与“打开外观工坊”命令的默认入口。').addDropdown(d=>d.addOption('panel','外观工坊面板').addOption('picker','CSS 搜索弹窗').setValue(this.plugin.settings.mode).onChange(v=>this.plugin.updateSetting('mode',v)));
  for(const [key,label,desc]of [
   ['autoSave','自动保存',`停止输入 ${TIMING.autoSaveMs/1000} 秒后保存；中文输入过程中不保存。外部冲突、恢复的草稿与历史版本需要先检查，再手动保存。`],
   ['wrap','编辑器默认换行','长代码行自动折行。'],
   ['confirmDelete','移入回收站前确认','删除时保留历史，并移入库内 .trash/snippet-editor，不会永久删除。']
  ])new Setting(c).setName(label).setDesc(desc).addToggle(t=>t.setValue(this.plugin.settings[key]).onChange(v=>this.plugin.updateSetting(key,v)));
  new Setting(c).setName('自定义 CSS 与隐私').setDesc('片段中的外部字体、图片和导入规则可能联网；本插件不会拦截这些请求。分享外观请使用“导出”，不要分享包含草稿与历史的 data.json。');
  new Setting(c).setName('历史与恢复').setDesc(`草稿在停止输入 ${TIMING.draftMs} 毫秒后持久化；突然退出仍可能丢失最后的少量输入。历史每文件 ${HISTORY.perFile} 份、全库 ${HISTORY.total} 份。`).addButton(b=>b.setButtonText('打开历史').onClick(()=>new HistoryModal(this.plugin).open()));
 }
}
class SnippetEditorPlugin extends Plugin {
 async onload(){
  const saved=await this.loadData()||{};
  this.settings={...DEFAULTS,...Object.fromEntries(Object.keys(DEFAULTS).filter(k=>k in (saved.settings||saved)).map(k=>[k,(saved.settings||saved)[k]]))};
  this.data={schemaVersion:3,builtin:saved.builtin,builtinMigration:saved.builtinMigration,appearanceUndo:saved.appearanceUndo,appearancePanel:saved.appearancePanel||{},settings:this.settings,drafts:saved.drafts||{},history:Array.isArray(saved.history)?saved.history:[]};
  this.persistQueue=Promise.resolve();this.timers=new Map();this.paused=new Set();this.stopped=false;
  this.store=new SnippetStore({adapter:this.app.vault.adapter,configDir:this.app.vault.configDir||'.obsidian',data:this.data,persist:()=>this.persist(),enabled:path=>!!this.app.customCss?.enabledSnippets?.has(keyOf(path)),setEnabled:async(path,on)=>{
   const css=this.app.customCss;
   const setEnabled=css?.setCssEnabledStatus||css?.setCssEnabled;
   if(typeof setEnabled!=='function')throw new Error('当前 Obsidian 版本的片段开关接口不可用，请在设置 → 外观操作。');
   await setEnabled.call(css,keyOf(path),on);
  },reload:async()=>{
   const css=this.app.customCss;
   if(typeof css?.requestLoadSnippets==='function')await css.requestLoadSnippets();
   else if(typeof css?.loadSnippets==='function')await css.loadSnippets();
   else throw new Error('片段刷新接口不可用，请在设置 → 外观刷新。');
  }});
  this.builtin=new BuiltinManager({data:this.data,persist:()=>this.persist(),changed:()=>{this.builtinStyles?.apply();this.nativeAppearance?.apply();this.store.emit();}});
  this.capabilities=doc=>{const target=doc||(typeof document!=='undefined'?document:undefined);return capabilities({platform:Platform,app:this.app,doc:target,state:this.nativeAppearance?.status(target),media:this.nativeAppearance?.windows.get(target)});};
  this.builtinStyles=new BuiltinStyleEngine(this.builtin,()=>this.snippetStyleNodes(),doc=>this.capabilities(doc));
  this.nativeAppearance=new NativeAppearance({app:this.app,platform:Platform,config:()=>this.builtin.config,changed:()=>{this.builtinStyles.apply();this.store.emit();}});
  try{await this.builtin.initialize();}catch(error){this.builtin.error=error.message;report(error);}
  const attach=doc=>{this.builtinStyles.attach(doc);this.nativeAppearance.attach(doc);};
  if(typeof document!=='undefined')attach(document);
  const attachDocuments=()=>this.app.workspace.iterateAllLeaves?.(leaf=>attach(leaf.view?.containerEl?.ownerDocument));
  attachDocuments();
  this.registerEvent(this.app.workspace.on('layout-change',attachDocuments));
  this.registerEvent(this.app.workspace.on('window-open',(_win,win)=>attach(win.document)));
  this.registerEvent(this.app.workspace.on('window-close',(_win,win)=>{this.nativeAppearance.detach(win.document);this.builtinStyles.detach(win.document);}));
  this.registerView(VIEW_TYPE,leaf=>new SnippetEditorView(leaf,this));
  this.addSettingTab(new SnippetEditorSettingTab(this.app,this));
  this.addRibbonIcon('brush','打开外观工坊',()=>this.safe(()=>this.openByMode()));
  for(const [id,name,fn]of [
   ['open','打开外观工坊',()=>this.openByMode()],['open-picker','搜索 CSS 片段',()=>this.openPicker()],['open-list','打开自定义 CSS 面板',async()=>{const view=await this.activate();await view.openCustom();}],
   ['new-snippet','新建 CSS 片段',async()=>{const view=await this.activate();await view.promptNew();}],
   ['appearance','打开外观设置',()=>this.openAppearance()],['history','打开历史与恢复',()=>new HistoryModal(this).open()],['refresh','刷新片段与外部修改',()=>this.refresh()]
  ])this.addCommand({id,name,callback:()=>this.safe(fn)});
  this.registerEvent(this.app.workspace.on('css-change',()=>{
   this.builtinStyles.apply();this.nativeAppearance.apply(true);
   clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.safe(()=>this.refresh()),350);
  }));
  this.registerInterval(setInterval(()=>{if(this.app.workspace.getLeavesOfType(VIEW_TYPE).some(leaf=>leaf.view?.page==='custom'))this.safe(()=>this.refresh());},TIMING.externalCheckMs));
 }
 snippetStyleNodes(){
  const css=this.app.customCss;
  if(Array.isArray(css?.extraStyleEls)){this.priorityUnavailable=false;return css.extraStyleEls;}
  if(css?.enabledSnippets?.size&&!this.priorityUnavailable){this.priorityUnavailable=true;new Notice('当前 Obsidian 无法读取片段样式，暂按原生 CSS 优先级显示。');}
  return [];
 }
 async safe(fn){try{return await fn();}catch(e){report(e);return null;}}
 persist(){
  const task=this.persistQueue.then(()=>this.saveData(JSON.parse(JSON.stringify(this.data))));
  this.persistQueue=task.catch(()=>{});return task;
 }
 async updateSetting(key,value){this.settings[key]=value;if(key==='autoSave'){for(const s of this.store.sessions.values()){this.cancelAutoSave(s);if(value)this.schedule(s);}}await this.safe(()=>this.persist());}
 edit(s,text){
  this.store.edit(s,text);
  clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.safe(()=>this.persist()),TIMING.draftMs);
  this.schedule(s);
 }
 cancelAutoSave(s){const timer=this.timers.get(s);if(timer)clearTimeout(timer);this.timers.delete(s);}
 pauseAutoSave(s){this.cancelAutoSave(s);this.paused.add(s);}
 schedule(s){
  this.cancelAutoSave(s);
  if(this.stopped||!this.settings.autoSave||s.composing||s.conflict||s.recovered||this.paused.has(s)||!this.store.dirty(s))return;
  this.timers.set(s,setTimeout(()=>{this.timers.delete(s);this.safe(()=>this.saveSession(s,false));},TIMING.autoSaveMs));
 }
 async saveSession(s,manual=true){
  this.cancelAutoSave(s);
  if(s.composing)return false;
  const saved=await this.store.save(s);
  if(saved&&manual){this.paused.delete(s);s.recovered=false;this.store.emit();}
  if(saved&&this.store.dirty(s))this.schedule(s);
  return saved;
 }
 async refresh(){if(this.stopped||this.refreshing)return;this.refreshing=true;try{for(const s of this.store.sessions.values())await this.store.refresh(s);this.store.emit();}finally{this.refreshing=false;}}
 async activate(){
  const ws=this.app.workspace;let leaf=ws.getLeavesOfType(VIEW_TYPE)[0];
  if(!leaf){leaf=ws.getRightLeaf(false)||ws.getLeaf('tab');await leaf.setViewState({type:VIEW_TYPE,active:true});}
  await ws.revealLeaf(leaf);return leaf.view;
 }
 async openSnippetEditor(path){const view=await this.activate();await view.openEditor(path);return view;}
 async openAppearance(){const view=await this.activate();await view.openBuiltin();}

 async openPicker(){new Picker(this,await this.store.list()).open();}
 openByMode(){return this.settings.mode==='picker'?this.openPicker():this.activate();}
 onunload(){this.stopped=true;this.nativeAppearance?.dispose();this.builtinStyles?.dispose();clearTimeout(this.refreshTimer);clearTimeout(this.draftTimer);for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();this.persist().catch(report);}
}
module.exports=SnippetEditorPlugin;
