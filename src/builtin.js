'use strict';
const {runtimeConfig}=require('./capabilities');
const {SnippetPriority}=require('./snippet-priority');
const {FIELDS} = require('./appearance');
const {assets} = require('./bundled');
const {normalizeColors,updateColors}=require('./color-settings');
const {normalizeOverrides,updateOverrides}=require('./advanced');
const {migrateControls,normalizeControls,updateControls,controlsCSS}=require('./control-model');
// notes/navigation remain schema keys for existing saved settings and presets.
const MODULES = [
  {id:'notes', default:true},
  {id:'navigation', default:true},
  {id:'translucency', file:'window-material.css', default:false},
  {id:'hideStatus', file:'status-bar.css', default:false}
];
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
function cssText(config, capabilities) {
 if(!config?.enabled)return '';
 config=runtimeConfig(config.controls?config:normalize(config),capabilities);
 const pieces=MODULES.filter(m=>m.file&&config.modules[m.id]).map(m=>assets[m.file]);
 if(config.showFileTreeGuides===false)pieces.push('.workspace-leaf-content[data-type="file-explorer"] { --nav-indentation-guide-color: transparent; }');
 const css=controlsCSS(config.controls);if(css)pieces.push(css);
 if(config.modules.translucency)pieces.push('body { --yn-深色窗口不透明度: '+config.values['--yn-深色窗口不透明度']+'%; --yn-浅色窗口不透明度: '+config.values['--yn-浅色窗口不透明度']+'%; }');
 return pieces.join('\n');
}
class BuiltinManager {
 constructor({data,persist,changed=()=>{}}) {
  Object.assign(this,{data,persist,changed});
  this.queue=Promise.resolve();this.error='';
 }
 get config(){return this.data.builtin;}
 run(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
 async initialize(){return this.run(async()=>{
  const previous=this.data.builtin;
  const initial=defaults();initial.modules.notes=false;initial.modules.navigation=false;
  // Existing saved configuration is upgraded in memory. CSS files and their
  // enabled states are exclusively managed by the custom CSS editor.
  this.data.builtin=normalize(previous||initial);
  if(JSON.stringify(previous)!==JSON.stringify(this.data.builtin)){
   try{await this.persist();}catch(error){if(previous===undefined)delete this.data.builtin;else this.data.builtin=previous;throw error;}
  }
  this.error='';this.changed();
 });}
 async update(change){return this.run(async()=>{
  if(!this.config)throw new Error('外观设置尚未初始化，请重试。');
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
 constructor(manager,sourceNodes=()=>[],capabilities=()=>null){this.capabilities=capabilities;this.priority=new SnippetPriority(sourceNodes);this.manager=manager;this.nodes=new Map();this.previewValues={};this.previewColors={};this.previewControls={};}
 attach(doc){if(!doc?.head||this.nodes.has(doc))return;const node=doc.createElement('style');node.dataset.snippetEditorBuiltin='true';doc.head.appendChild(node);this.nodes.set(doc,node);this.priority.attach(doc,node);this.apply();}
 detach(doc){this.priority.detach(doc);this.nodes.get(doc)?.remove();this.nodes.delete(doc);}
 previewControl(id,value){this.previewControls[id]=value;this.apply();}
 clearControlPreview(id){delete this.previewControls[id];this.apply();}
 clearControlPreviews(){this.previewControls={};this.apply();}
 preview(key,value){this.previewValues[key]=value;this.apply();}
 previewColor(id,value){this.previewColors[id]={mode:'custom',value};this.apply();}
 clearColorPreview(id){delete this.previewColors[id];this.apply();}
 clearPreview(key){delete this.previewValues[key];this.apply();}
 apply(){const config=this.manager.config,preview=config?{...config,controls:config.controls?{...config.controls,...this.previewControls}:undefined,values:{...config.values,...this.previewValues},colors:{...config.colors,...this.previewColors}}:config;for(const [doc,node]of this.nodes){if(doc.defaultView?.closed){this.detach(doc);continue;}const text=cssText(preview,this.capabilities(doc));if(node.textContent!==text)node.textContent=text;this.priority.apply(doc);}}
 dispose(){for(const doc of [...this.nodes.keys()])this.detach(doc);}
}
module.exports={BuiltinManager,BuiltinStyleEngine,MODULES,defaults,normalize,cssText};
