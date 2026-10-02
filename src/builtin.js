'use strict';
const {runtimeConfig}=require('./capabilities');
const {SnippetPriority}=require('./snippet-priority');
const {FIELDS, LEGACY_FIELDS, APPEARANCE_FILE, parseAppearance} = require('./appearance');
const {assets,legacyAssets,legacy301Assets,legacy311Assets,legacy324Assets} = require('./bundled');
const {normalizeColors,updateColors,colorVariables}=require('./color-settings');
const {normalizeOverrides,updateOverrides,overridesCSS}=require('./advanced');
const {migrateControls,normalizeControls,updateControls,controlsCSS}=require('./control-model');
const MODULES = [
  {id:'notes', name:'笔记样式', file:'00-笔记视觉系统.css', default:true, help:'正文、标题、图片、表格、代码与标注；适配阅读和实时预览。'},
  {id:'navigation', name:'界面导航', file:'10-界面导航.css', default:true, help:'文件选中状态、标签页和键盘焦点。'},
  {id:'translucency', name:'窗口半透明', file:'20-半透明窗口.css', default:false, help:'桌面系统支持时使用原生玻璃；模糊由系统材质决定。'},
  {id:'hideStatus', name:'隐藏状态栏', file:'90-隐藏状态栏.css', default:false, help:'关闭此项即可显示 Obsidian 底部状态栏。'}
];
const LEGACY_FILES = [...MODULES.map(m=>m.file), APPEARANCE_FILE];
function defaults() { return {version:3,enabled:true,glassMaterial:'glass',showFileTreeGuides:true,colors:normalizeColors(),overrides:normalizeOverrides(),modules:Object.fromEntries(MODULES.map(m=>[m.id,m.default])),values:Object.fromEntries(FIELDS.map(f=>[f.key,f.value]))}; }
function normalize(config) {
 const result=defaults();
 result.colors=normalizeColors(config?.colors);
 result.overrides=normalizeOverrides(config?.overrides);
 if(typeof config?.enabled==='boolean')result.enabled=config.enabled;
 if(typeof config?.showFileTreeGuides==='boolean')result.showFileTreeGuides=config.showFileTreeGuides;
 if(['glass','sidebar','under-window'].includes(config?.glassMaterial))result.glassMaterial=config.glassMaterial;
 for(const m of MODULES)if(typeof config?.modules?.[m.id]==='boolean')result.modules[m.id]=config.modules[m.id];
 for(const f of FIELDS)if(Number.isFinite(config?.values?.[f.key]))result.values[f.key]=config.values[f.key];
 // Upgrade the old clear material once; keep later choices, including 0%, intact.
 if(config&&(config.version||0)<3&&config.glassMaterial==='under-window'){
  result.glassMaterial='glass';
  if(result.values['--yn-深色窗口不透明度']===0)result.values['--yn-深色窗口不透明度']=45;
 }
 result.controls=config?.controls?normalizeControls(config.controls):migrateControls(result);
 return result;
}
function cssText(config, legacyEnabled=()=>false, capabilities) {
 config=runtimeConfig(config,capabilities);
 if(!config?.enabled)return '';
 if(config.controls){
  const pieces=MODULES.filter(m=>['translucency','hideStatus'].includes(m.id)&&config.modules[m.id]&&!legacyEnabled(m.file)).map(m=>assets[m.file]);
  if(config.showFileTreeGuides===false)pieces.push('.workspace-leaf-content[data-type="file-explorer"] { --nav-indentation-guide-color: transparent; }');
  const css=controlsCSS(config.controls);if(css)pieces.push(css);
  if(config.modules.translucency)pieces.push('body { --yn-深色窗口不透明度: '+config.values['--yn-深色窗口不透明度']+'%; --yn-浅色窗口不透明度: '+config.values['--yn-浅色窗口不透明度']+'%; }');
  return pieces.join('\n');
 }

 const pieces=MODULES.filter(m=>config.modules[m.id]&&!legacyEnabled(m.file)).map(m=>assets[m.file]);
 // Hide only the line color, retaining the tree's border width and indentation.
 if(config.showFileTreeGuides===false)pieces.push('.workspace-leaf-content[data-type="file-explorer"] { --nav-indentation-guide-color: transparent; }');
 const extra=overridesCSS(config.overrides);
 if(!pieces.length&&!extra)return '';
 pieces.push('body {\n'+colorVariables(config.colors)+'\n}');
 if(!legacyEnabled(APPEARANCE_FILE))pieces.push('body {\n'+FIELDS.map(f=>'  '+f.key+': '+config.values[f.key]+f.unit+';').join('\n')+'\n}');
 if(extra)pieces.push(extra);
 return pieces.join('\n');
}
class BuiltinManager {
 constructor({adapter,configDir,data,persist,enabled,setEnabled,changed=()=>{}}) {
  Object.assign(this,{adapter,configDir,data,persist,enabled,setEnabled,changed});
  this.dir=configDir+'/snippets';this.queue=Promise.resolve();this.error='';
 }
 get config(){return this.data.builtin;}
 run(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
 async initialize(){return this.run(async()=>{
  if(this.data.builtinMigration?.status==='pending')return this.finishMigration();
  if(this.data.builtin){const previous=this.data.builtin;this.data.builtin=normalize(previous);if(JSON.stringify(previous)!==JSON.stringify(this.data.builtin)){try{await this.persist();}catch(error){this.data.builtin=previous;throw error;}}this.error='';return;}
  const files=[];
  for(const name of LEGACY_FILES){const path=this.dir+'/'+name;if(await this.adapter.exists(path))files.push({name,text:await this.adapter.read(path),enabled:this.enabled(path)});}
  // Do not silently archive a modified implementation or an unresolved draft.
  for(const f of files){
   if(this.data.drafts?.[this.dir+'/'+f.name])throw new Error('旧片段有未保存草稿，请先在自定义 CSS 中保存：'+f.name);
   if(f.name!==APPEARANCE_FILE&&![assets[f.name],legacyAssets[f.name],legacy301Assets[f.name],legacy311Assets[f.name],legacy324Assets[f.name]].filter(Boolean).some(text=>f.text.replace(/\r\n/g,'\n')===text.replace(/\r\n/g,'\n')))throw new Error('旧片段已被额外修改，暂不自动迁移：'+f.name+'。请先保留为自定义片段。');
  }
  const config=defaults();
  if(files.length){
   for(const m of MODULES)config.modules[m.id]=!!files.find(f=>f.name===m.file)?.enabled;
   const settings=files.find(f=>f.name===APPEARANCE_FILE&&f.enabled);
   if(settings){
    const parsed=parseAppearance(settings.text);
    if(parsed.error||LEGACY_FIELDS.some(f=>!parsed.fields.has(f.key)))throw new Error('旧外观设置包含无法识别的值，暂不自动迁移，请先检查 99-外观设置。');
    for(const [key,item]of parsed.fields)config.values[key]=item.value;
   }
  }
  if(!files.length){config.modules.notes=false;config.modules.navigation=false;this.data.builtin=normalize(config);try{await this.persist();}catch(e){delete this.data.builtin;throw e;}this.error='';this.changed();return;}
  const root=this.configDir+'/snippet-editor-backups';
  const backup=root+'/builtin-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
  if(!await this.adapter.exists(root))await this.adapter.mkdir(root);
  await this.adapter.mkdir(backup);await this.adapter.mkdir(backup+'/copies');await this.adapter.mkdir(backup+'/originals');
  await this.adapter.write(backup+'/plugin-data-before.json',JSON.stringify(this.data,null,2));
  for(const f of files)await this.adapter.write(backup+'/copies/'+f.name,f.text);
  await this.adapter.write(backup+'/restore.json',JSON.stringify({files:files.map(({name,enabled})=>({name,enabled})),instructions:'先关闭插件外观设置，将 originals（或 copies）中的 CSS 放回 snippets，再按 enabled 恢复片段开关。'},null,2));
  this.data.builtinMigration={status:'pending',backup,files,config};
  try{await this.persist();}catch(e){delete this.data.builtinMigration;throw e;}
  return this.finishMigration();
 });}
 async finishMigration(){
  const journal=this.data.builtinMigration;
  try{
   // Recheck all originals before changing any enabled status. Resume after a crash.
   for(const f of journal.files){
    const src=this.dir+'/'+f.name,dest=journal.backup+'/originals/'+f.name;
    if(await this.adapter.exists(src)){if(await this.adapter.read(src)!==f.text)throw new Error('迁移期间文件变化，已停止：'+f.name);}
    else if(!await this.adapter.exists(dest)||await this.adapter.read(dest)!==f.text)throw new Error('迁移原文件丢失：'+f.name);
   }
   for(const f of journal.files)await this.setEnabled(this.dir+'/'+f.name,false);
   for(const f of journal.files){
    const src=this.dir+'/'+f.name,dest=journal.backup+'/originals/'+f.name;
    if(await this.adapter.exists(src)){
     if(await this.adapter.read(src)!==f.text)throw new Error('归档前文件变化，已停止：'+f.name);
     if(await this.adapter.exists(dest))throw new Error('备份目标已存在，已停止：'+f.name);
     await this.adapter.rename(src,dest);
    }
   }
   this.data.builtin=normalize(journal.config);
   this.data.builtinMigration={status:'complete',backup:journal.backup,files:journal.files.map(({name,enabled})=>({name,enabled})),completedAt:Date.now()};
   try{await this.persist();}catch(e){this.data.builtinMigration=journal;delete this.data.builtin;throw e;}
   this.error='';this.changed();
  }catch(error){
   const failures=[];
   for(const f of journal.files){
    const src=this.dir+'/'+f.name,dest=journal.backup+'/originals/'+f.name;
    try{if(!await this.adapter.exists(src)&&await this.adapter.exists(dest))await this.adapter.rename(dest,src);await this.setEnabled(src,f.enabled);}catch(e){failures.push(e.message);}
   }
   // Keep journal pending: the next start can safely retry after a partial rollback.
   this.error=error.message+(failures.length?'；回滚未完全完成：'+failures.join('；'):'');
   throw new Error(this.error);
  }
 }
 async update(change){return this.run(async()=>{
  if(!this.config)throw new Error('外观设置尚未初始化，请先完成迁移。');
  const before=this.config,next=normalize(before);
  if('controls'in change)next.controls=updateControls(next.controls,change.controls);
  if('enabled'in change)next.enabled=!!change.enabled;
  if('overrides'in change)next.overrides=updateOverrides(next.overrides,change.overrides);
  if('colors'in change)next.colors=updateColors(next.colors,change.colors);
  if('showFileTreeGuides'in change)next.showFileTreeGuides=!!change.showFileTreeGuides;
  if('glassMaterial'in change){if(!['glass','sidebar','under-window'].includes(change.glassMaterial))throw new Error('未知窗口材质');next.glassMaterial=change.glassMaterial;}
  for(const [id,value]of Object.entries(change.modules||{})){if(!MODULES.some(m=>m.id===id))throw new Error('未知外观模块');next.modules[id]=!!value;}
  for(const [key,value]of Object.entries(change.values||{})){
   const field=FIELDS.find(f=>f.key===key);
   if(!field||!Number.isFinite(value)||value<field.min||value>field.max)throw new Error('设置值超出范围：'+key);
   next.values[key]=Number(value.toFixed(4));
  }
  this.data.builtin=next;
  try{await this.persist();}catch(e){this.data.builtin=before;throw e;}
  this.changed();
 });}
}
// Each popout gets its own style element; unloading removes every injected rule.
class BuiltinStyleEngine {
 constructor(manager,legacyEnabled,sourceNodes=()=>[],capabilities=()=>null){this.capabilities=capabilities;this.priority=new SnippetPriority(sourceNodes);this.manager=manager;this.legacyEnabled=legacyEnabled;this.nodes=new Map();this.previewValues={};this.previewColors={};this.previewControls={};}
 attach(doc){if(!doc?.head||this.nodes.has(doc))return;const node=doc.createElement('style');node.dataset.snippetEditorBuiltin='true';doc.head.appendChild(node);this.nodes.set(doc,node);this.priority.attach(doc,node);this.apply();}
 detach(doc){this.priority.detach(doc);this.nodes.get(doc)?.remove();this.nodes.delete(doc);}
 previewControl(id,value){this.previewControls[id]=value;this.apply();}
 clearControlPreview(id){delete this.previewControls[id];this.apply();}
 clearControlPreviews(){this.previewControls={};this.apply();}
 preview(key,value){this.previewValues[key]=value;this.apply();}
 previewColor(id,value){this.previewColors[id]={mode:'custom',value};this.apply();}
 clearColorPreview(id){delete this.previewColors[id];this.apply();}
 clearPreview(key){delete this.previewValues[key];this.apply();}
 apply(){const config=this.manager.config,preview=config?{...config,controls:config.controls?{...config.controls,...this.previewControls}:undefined,values:{...config.values,...this.previewValues},colors:{...config.colors,...this.previewColors}}:config;for(const [doc,node]of this.nodes){if(doc.defaultView?.closed){this.detach(doc);continue;}const text=cssText(preview,this.legacyEnabled,this.capabilities(doc));if(node.textContent!==text)node.textContent=text;this.priority.apply(doc);}}
 dispose(){for(const doc of [...this.nodes.keys()])this.detach(doc);}
}
module.exports={BuiltinManager,BuiltinStyleEngine,MODULES,LEGACY_FILES,defaults,normalize,cssText};
