'use strict';
const {importConfig}=require('./capabilities');
const {normalize,MODULES}=require('./builtin');
const {FIELDS}=require('./appearance');
const {updateColors,hexColor}=require('./color-settings');
const {updateOverrides}=require('./advanced');
const {CONTROLS,updateControls}=require('./control-model');
const FORMAT='obsidian-appearance-preset',MAX_BYTES=128*1024;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function keys(v,allowed,label){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw new Error(label+'包含未知字段');}
function validateConfig(raw){
 keys(raw,['version','enabled','glassMaterial','showFileTreeGuides','colors','modules','values','overrides','controls'],'配置');
 for(const k of ['enabled','glassMaterial','showFileTreeGuides','colors','modules','values'])if(!(k in raw))throw new Error('配置缺少字段：'+k);
 if(raw.version!==3)throw new Error('不支持的外观配置版本');
 for(const k of ['enabled','showFileTreeGuides'])if(typeof raw[k]!=='boolean')throw new Error('开关值无效：'+k);
 if(!['glass','sidebar','under-window'].includes(raw.glassMaterial))throw new Error('窗口材质无效');
 keys(raw.modules,MODULES.map(m=>m.id),'模块');if(MODULES.some(m=>!(m.id in raw.modules)))throw new Error('配置缺少模块');for(const v of Object.values(raw.modules))if(typeof v!=='boolean')throw new Error('模块开关无效');
 keys(raw.values,FIELDS.map(f=>f.key),'参数');if(FIELDS.some(f=>!(f.key in raw.values)))throw new Error('配置缺少外观参数');for(const [k,v]of Object.entries(raw.values)){const f=FIELDS.find(f=>f.key===k);if(typeof v!=='number'||!Number.isFinite(v)||v<f.min||v>f.max)throw new Error('参数超出范围：'+f.label);}
 keys(raw.colors,['heading','highlight','tag','tab','file'],'颜色');if(['heading','highlight','tag','tab','file'].some(k=>!(k in raw.colors)))throw new Error('配置缺少颜色');
 const colors={};for(const [id,entry]of Object.entries(raw.colors)){keys(entry,['mode','value'],'颜色');if(!['theme','custom'].includes(entry.mode)||!(entry.value===null||hexColor(entry.value))||entry.mode==='custom'&&entry.value===null)throw new Error('颜色值无效');colors[id]=entry.value===null?{mode:entry.mode}:{...entry};}
 const result=normalize(raw);result.colors=updateColors(result.colors,colors);result.overrides=updateOverrides({},raw.overrides||{});if('controls'in raw){keys(raw.controls,CONTROLS.map(f=>f.id),'外观设置');if(CONTROLS.some(f=>!(f.id in raw.controls)))throw new Error('配置缺少外观设置');result.controls=updateControls({},raw.controls);}return result;
}
function makePreset(config,name,accentColor=''){return {format:FORMAT,version:2,name:String(name||'我的外观').trim().slice(0,60)||'我的外观',accentColor:hexColor(accentColor)||'',config:validateConfig(normalize(config))};}
function parsePreset(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('配置文件不能超过 128 KB');
 let data;try{data=JSON.parse(text);}catch{throw new Error('不是有效的 JSON 配置');}
 keys(data,['format','version','name','accentColor','config'],'配置文件');
 if(data.format!==FORMAT||![1,2].includes(data.version))throw new Error('配置格式或版本不受支持');
 if(data.version===2&&!object(data.config?.controls))throw new Error('配置缺少外观设置');
 if(typeof data.name!=='string'||data.name.length>60)throw new Error('配置名称无效');
 if(data.accentColor!==''&&!hexColor(data.accentColor))throw new Error('强调色无效');
 return {...data,accentColor:hexColor(data.accentColor)||'',config:validateConfig(data.config)};
}
function differences(before,after){const rows=[];function walk(a,b,path){for(const k of Object.keys(b)){const key=path?path+'.'+k:k;if(object(b[k]))walk(a?.[k]||{},b[k],key);else if(a?.[k]!==b[k])rows.push({key,before:a?.[k],after:b[k]});}}walk(before,after,'');return rows;}
// All public and native state changes share the appearance queue. An undo snapshot
// is stored in plugin data, and is deliberately absent from exported presets.
async function applyPreset(plugin,preset,includeAccent=true,doc,remember=true){return plugin.builtin.run(async()=>{
 const manager=plugin.builtin,before=manager.config,oldUndo=plugin.data.appearanceUndo;
 const oldAccent=plugin.app.vault.getConfig?.('accentColor')||'';
 const changeAccent=includeAccent&&oldAccent!==preset.accentColor;
 if(changeAccent&&typeof plugin.app.vault.setConfig!=='function')throw new Error('当前版本不支持导入强调色，请取消勾选后重试');
 const {config:next}=importConfig(before,validateConfig(preset.config),plugin.capabilities?.(doc));let attemptedAccent=false;
 plugin.data.appearanceUndo=remember?{config:before,accentColor:oldAccent,restoreAccent:changeAccent}:undefined;
 plugin.data.builtin=next;
 try{await plugin.persist();if(changeAccent){attemptedAccent=true;await plugin.app.vault.setConfig('accentColor',preset.accentColor);}}
 catch(error){plugin.data.builtin=before;plugin.data.appearanceUndo=oldUndo;const failures=[];if(attemptedAccent)try{await plugin.app.vault.setConfig('accentColor',oldAccent);}catch(e){failures.push('主题色恢复失败：'+e.message);}try{await plugin.persist();}catch(e){failures.push('原配置保存失败：'+e.message);}manager.changed();throw new Error(error.message+(failures.length?'；'+failures.join('；'):''));}
 plugin.builtinStyles.previewControls={};plugin.builtinStyles.previewValues={};plugin.builtinStyles.previewColors={};manager.changed();
 });}
module.exports={FORMAT,MAX_BYTES,makePreset,parsePreset,validateConfig,differences,applyPreset};
