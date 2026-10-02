'use strict';
const {ItemView} = require('obsidian');
const {keyOf,baseName} = require('./core');
const {el,button,ask,report,HistoryModal} = require('./ui');
const {renderBuiltin,syncBuiltin} = require('./builtin-view');
const {highlightCSS} = require('./highlight');
const VIEW_TYPE='snippet-editor-view';
class SnippetEditorView extends ItemView {
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.navigation=false;this.session=null;this.mode='source';this.wrap=plugin.settings.wrap;this.query='';this.filter='all';this.generation=0;this.ready=false;this.page='builtin';}
 getViewType(){return VIEW_TYPE;}
 getDisplayText(){return this.session ? keyOf(this.session.path)+(this.plugin.store.dirty(this.session)?' •':'') : this.page==='builtin'?'外观设置':'自定义 CSS';}
 getIcon(){return 'brush';}
 getState(){return {file:this.session?.path||null,mode:this.mode,page:this.page};}
 async setState(state,result){
  await super.setState(state,result);
  if(state?.file && state.file!==this.session?.path){
   await this.openEditor(state.file);
  }else if(state?.page==='custom')await this.openCustom();
 }
 async onOpen(){
  this.ready=true;this.contentEl.classList.add('se-root');
  this.register(this.plugin.store.subscribe(()=>this.sync()));
  this.registerDomEvent(this.contentEl.ownerDocument.defaultView,'focus',()=>this.plugin.safe(()=>this.plugin.refresh()));
  await this.render();
 }
 async onClose(){
  this.ready=false;this.generation++;this.clearBuiltinPreview();this.finishComposition();
  const s=this.session;
  if(s&&this.plugin.settings.autoSave&&this.plugin.store.dirty(s)&&!s.conflict&&!this.plugin.paused.has(s)&&!s.recovered) {
   try{await this.plugin.saveSession(s);}catch(e){report(e);}
  }
  await this.plugin.persist().catch(report);
 }
 finishComposition(){if(this.composing){this.composing=false;if(this.session)this.session.composing=Math.max(0,this.session.composing-1);}}
 async openBuiltin(){this.finishComposition();await this.plugin.persist();this.session=null;this.page='builtin';await this.render();}
 async openCustom(){this.finishComposition();await this.plugin.persist();this.session=null;this.page='custom';await this.render();}
 async openEditor(path,mode){
  const token=++this.generation;
  const s=await this.plugin.store.open(path);
  if(token!==this.generation)return;
  this.finishComposition();this.session=s;this.page='custom';
  this.mode='source';
  if(this.ready)await this.render();
 }
 clearBuiltinPreview(){this.plugin.builtinStyles.clearControlPreviews();for(const id of this.colorControls?.keys()||[])this.plugin.builtinStyles.clearColorPreview(id);for(const key of this.builtinControls?.keys()||[])this.plugin.builtinStyles.clearPreview(key);}
 async render(){
  if(!this.ready)return;
  this.clearBuiltinPreview();
  this.generation++;this.contentEl.replaceChildren();this.ta=null;this.controls=null;
  const navRow=el(this.contentEl,'nav','se-page-nav');navRow.setAttribute('aria-label','外观管理');
  const nav=el(navRow,'div','se-nav-switcher');
  button(nav,'外观设置',()=>this.openBuiltin()).setAttribute('aria-pressed',String(this.page==='builtin'));
  button(nav,'自定义 CSS',()=>this.openCustom()).setAttribute('aria-pressed',String(this.page==='custom'));
  if(this.page==='builtin')renderBuiltin(this,this.contentEl);else if(this.session)this.renderEditor();else this.renderList();
  this.leaf.updateHeader?.();
 }
 sync(){
  if(!this.ready)return;
  if(this.page==='builtin'){syncBuiltin(this);return;}
  if(this.session&&!this.plugin.store.sessions.has(this.session.path)){this.session=null;this.render();return;}
  if(!this.session){this.refreshRows().catch(report);return;}
  const s=this.session,store=this.plugin.store;
  if(this.nameEl)this.nameEl.textContent=keyOf(s.path);
  if(this.ta&&this.ta.value!==s.text&&!this.composing){const start=this.ta.selectionStart,end=this.ta.selectionEnd;this.ta.value=s.text;this.ta.setSelectionRange(Math.min(start,s.text.length),Math.min(end,s.text.length));}
  this.paintCode();
  if(this.switchEl){const on=store.enabled(s.path);this.switchEl.textContent=on?'已启用':'已停用';this.switchEl.setAttribute('aria-pressed',String(on));}
  if(this.statusEl)this.statusEl.textContent=s.saving?'正在保存…':s.error? s.error :s.conflict?'检测到外部修改，已暂停自动保存':(this.plugin.paused.has(s)||s.recovered)?'已暂停自动保存，请检查后手动保存':store.dirty(s)?'有未保存修改 · 草稿恢复已开启':s.recovered?'已恢复草稿':'已保存';
  if(this.warningEl){this.warningEl.hidden=!(s.conflict||s.missing);}
  if(this.saveBtn)this.saveBtn.disabled=s.saving||s.composing>0||s.conflict;
  this.leaf.updateHeader?.();
 }
 renderList(){
  const c=this.contentEl;
  const header=el(c,'div','se-header se-list-header');el(header,'h2','','自定义 CSS');
  const actions=el(header,'div','se-actions');
  button(actions,'新建',()=>this.promptNew(),'mod-cta');

  const search=el(c,'div','se-search');
  const input=el(search,'input');input.type='search';input.placeholder='搜索片段…';input.value=this.query;input.setAttribute('aria-label','搜索片段');
  input.addEventListener('input',()=>{this.query=input.value;this.refreshRows().catch(report);});
  const filter=el(search,'select');filter.setAttribute('aria-label','筛选片段');
  for(const [value,label]of [['all','全部'],['on','已启用'],['off','已停用'],['draft','有草稿']]){const o=el(filter,'option','',label);o.value=value;}
  filter.value=this.filter;filter.addEventListener('change',()=>{this.filter=filter.value;this.refreshRows().catch(report);});
  this.rows=el(c,'div','se-list');this.countEl=el(this.rows,'div','se-muted se-list-count');
  this.refreshRows().catch(report);
 }
 async refreshRows(){
  const rows=this.rows;if(this.page!=='custom'||this.session||!rows||!rows.isConnected)return;
  const generation=this.listGeneration=(this.listGeneration||0)+1;
  const store=this.plugin.store,files=await store.list();
  if(this.page!=='custom'||this.session||rows!==this.rows||generation!==this.listGeneration)return;
  rows.replaceChildren(this.countEl);
  const all=[...new Set([...files,...Object.keys(this.plugin.data.drafts).filter(p=>p.startsWith(store.dir+'/'))])];
  const shown=all.filter(path=>{const on=store.enabled(path),draft=!!this.plugin.data.drafts[path];return keyOf(path).toLowerCase().includes(this.query.toLowerCase().trim())&&(this.filter==='all'||this.filter==='on'&&on||this.filter==='off'&&!on||this.filter==='draft'&&draft);});
  this.countEl.textContent=files.length+' 个片段 · '+files.filter(p=>store.enabled(p)).length+' 个启用'+(shown.length!==all.length?' · 显示 '+shown.length+' 个':'');
  if(!shown.length)el(rows,'p','se-card se-empty',all.length?'没有匹配的片段。可以换个关键词或筛选条件。':'还没有片段。点击“新建”，或把 CSS 文件放入 '+store.dir+'。');
  for(const path of shown){
   const missing=!files.includes(path),draft=!!this.plugin.data.drafts[path],on=store.enabled(path);
   const row=el(rows,'article','se-card');
   const top=el(row,'div','se-card-top');
   const name=button(top,keyOf(path),()=>this.openEditor(path),'se-file-name');name.title=path;
   if(!missing){const toggle=button(top,on?'已启用':'已停用',()=>store.toggle(path),'se-toggle');toggle.setAttribute('aria-pressed',String(on));toggle.setAttribute('aria-label',keyOf(path)+'：'+(on?'已启用，点击停用':'已停用，点击启用'));}
   if(draft)el(row,'div','se-draft',missing?'原文件已删除 · 可恢复草稿':'有未保存草稿');
   const ops=el(row,'div','se-actions se-card-actions');
   button(ops,'编辑',()=>this.openEditor(path));
   button(ops,'复制',()=>this.copy(path));
   if(!missing){button(ops,'重命名',()=>this.rename(path));button(ops,'移入回收站',()=>this.trash(path));}
  }
 }
 renderEditor(){
  const c=this.contentEl,s=this.session,store=this.plugin.store;
  const header=el(c,'div','se-header se-editor-header');
  button(header,'返回',async()=>{this.finishComposition();await this.plugin.persist();this.session=null;await this.render();});
  this.nameEl=el(header,'h2','se-editor-name',keyOf(s.path));
  const bar=el(c,'div','se-actions se-editor-bar');
  this.switchEl=button(bar,'',()=>store.toggle(s.path),'se-toggle');
  this.saveBtn=button(bar,'保存',()=>this.plugin.saveSession(s),'mod-cta');
  button(bar,'另存副本',()=>this.copy(s.path));
  button(bar,'历史',()=>new HistoryModal(this.plugin,s.path).open());
  button(bar,'读取磁盘版本',()=>ask(this.app,{title:'读取磁盘版本',description:'当前草稿会先保留到历史，然后重新读取文件。',label:'读取',action:()=>store.discard(s)}));
  this.warningEl=el(c,'div','se-warning','磁盘文件与草稿不一致。自动保存已暂停；可以读取磁盘版本，或把草稿另存为副本。');this.warningEl.setAttribute('role','alert');
  this.renderSource(c);
  this.statusEl=el(c,'div','se-status');this.statusEl.setAttribute('role','status');this.statusEl.setAttribute('aria-live','polite');
  this.sync();
 }
 renderSource(c){
  const tools=el(c,'div','se-actions se-source-tools');
  const wrap=button(tools,'自动换行',()=>{this.wrap=!this.wrap;this.applyWrap();wrap.setAttribute('aria-pressed',String(this.wrap));});wrap.setAttribute('aria-pressed',String(this.wrap));
  const find=el(tools,'input');find.type='search';find.placeholder='查找代码…';find.setAttribute('aria-label','查找代码');
  const next=()=>{const query=find.value.toLowerCase();if(!query)return;const content=this.ta.value.toLowerCase();let index=content.indexOf(query,this.ta.selectionEnd);if(index<0)index=content.indexOf(query);if(index<0){this.cursorEl.textContent='未找到';return;}this.ta.focus();this.ta.setSelectionRange(index,index+query.length);const line=this.ta.value.slice(0,index).split('\n').length;this.ta.scrollTop=Math.max(0,(line-3)*parseFloat(this.ta.ownerDocument.defaultView.getComputedStyle(this.ta).lineHeight));this.paintCode();};
  button(tools,'下一个',next);find.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();next();}});
  const holder=el(c,'div','se-code-holder');
  this.hl=el(holder,'pre','se-highlight');this.hl.setAttribute('aria-hidden','true');this.hlCode=el(this.hl,'code');
  this.ta=el(holder,'textarea','se-textarea');this.ta.value=this.session.text;this.ta.spellcheck=false;this.ta.setAttribute('aria-label','CSS 源码');this.ta.setAttribute('autocapitalize','off');this.ta.setAttribute('autocomplete','off');this.ta.setAttribute('autocorrect','off');
  const ta=this.ta,s=this.session;
  ta.addEventListener('input',()=>{this.plugin.edit(s,ta.value);this.paintCode();});
  ta.addEventListener('compositionstart',()=>{if(!this.composing){this.composing=true;s.composing++;this.plugin.cancelAutoSave(s);}});
  ta.addEventListener('compositionend',()=>{this.finishComposition();this.plugin.edit(s,ta.value);});
  ta.addEventListener('keydown',e=>{
   if(e.isComposing||e.keyCode===229)return;
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();this.plugin.safe(()=>this.plugin.saveSession(s));}
   else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'){e.preventDefault();find.focus();find.select();}
   else if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    // Escape, then Tab exits the editor; Shift+Tab at a caret always moves focus back.
    if(this.releaseTab||e.shiftKey&&ta.selectionStart===ta.selectionEnd){this.releaseTab=false;return;}
    e.preventDefault();const start=ta.selectionStart,end=ta.selectionEnd;
    if(start===end)this.insert('  ',start,end);
    else {const from=ta.value.lastIndexOf('\n',Math.max(0,start-1))+1;const to=end>start&&ta.value[end-1]==='\n'?end-1:(ta.value.indexOf('\n',end)<0?ta.value.length:ta.value.indexOf('\n',end));const value=ta.value.slice(from,to).split('\n').map(l=>e.shiftKey?l.replace(/^(?: {1,2}|\t)/,''):'  '+l).join('\n');this.insert(value,from,to);ta.setSelectionRange(from,from+value.length);}
   }else if(e.key==='Escape'){this.releaseTab=true;}
   else if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();const start=ta.selectionStart,end=ta.selectionEnd,line=ta.value.slice(ta.value.lastIndexOf('\n',start-1)+1,start),indent=(line.match(/^[ \t]*/)||[''])[0],extra=/\{\s*$/.test(line)?'  ':'';this.insert('\n'+indent+extra,start,end);}
  });
  ta.addEventListener('scroll',()=>this.paintScroll());for(const event of ['keyup','click','select'])ta.addEventListener(event,()=>this.paintCursor());
  this.cursorEl=el(c,'div','se-muted se-cursor','Tab 缩进 · Shift+Tab 反缩进 · Esc 后 Tab 离开编辑器 · Ctrl/Cmd+S 保存');
  this.applyWrap();this.paintCode();
 }
 insert(text,start,end){const ta=this.ta;ta.focus();ta.setSelectionRange(start,end);let ok=false;try{ok=ta.ownerDocument.execCommand('insertText',false,text);}catch{}if(!ok)ta.setRangeText(text,start,end,'end');this.plugin.edit(this.session,ta.value);}
 applyWrap(){if(!this.ta)return;this.ta.wrap=this.wrap?'soft':'off';this.ta.classList.toggle('se-nowrap',!this.wrap);this.hl.classList.toggle('se-nowrap',!this.wrap);this.paintScroll();}
 paintCode(){if(!this.ta)return;this.hlCode.innerHTML=highlightCSS(this.ta.value);this.paintScroll();this.paintCursor();}
 paintScroll(){if(this.ta&&this.hl){this.hl.scrollTop=this.ta.scrollTop;this.hl.scrollLeft=this.ta.scrollLeft;}}
 paintCursor(){if(this.ta&&this.cursorEl){const lines=this.ta.value.slice(0,this.ta.selectionStart).split('\n');this.cursorEl.textContent='第 '+lines.length+' 行，第 '+(lines.at(-1).length+1)+' 列 · Esc 后 Tab 离开编辑器';}}
 promptNew(){return ask(this.app,{title:'新建 CSS 片段',value:'新片段',label:'创建',action:async name=>this.openEditor(await this.plugin.store.create(name))});}
 copy(path){return ask(this.app,{title:'另存为副本',description:'复制当前编辑内容，新片段默认停用。原草稿仍保留。',value:keyOf(path)+'-副本',label:'创建副本',action:async name=>{const s=await this.plugin.store.open(path);await this.openEditor(await this.plugin.store.create(name,s.text));}});}
 rename(path){return ask(this.app,{title:'重命名片段',value:keyOf(path),label:'重命名',action:name=>this.plugin.store.rename(path,name)});}
 trash(path){const action=()=>this.plugin.store.trash(path);return this.plugin.settings.confirmDelete?ask(this.app,{title:'移入回收站',description:'文件将移至库内 .trash/snippet-editor，并保留删除前的历史版本。',label:'移入回收站',danger:true,action}):action();}
}
module.exports={SnippetEditorView,VIEW_TYPE};
