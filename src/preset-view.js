'use strict';
const {windowField,displayValue}=require('./window-fields');
const {Modal}=require('obsidian');
const {el,button,report}=require('./ui');
const {makePreset,parsePreset,differences,applyPreset,MAX_BYTES}=require('./presets');
const {FIELDS}=require('./appearance');
const {EXTRA_FIELDS}=require('./advanced');
const {importConfig}=require('./capabilities');
const {CONTROLS}=require('./control-model');
const names={enabled:'启用外观',glassMaterial:'窗口材质',showFileTreeGuides:'文件夹层级线',notes:'笔记排版',navigation:'导航外观',translucency:'半透明',hideStatus:'隐藏状态栏',heading:'标题',highlight:'高亮',tag:'标签',tab:'活动标签页',file:'文件选中',mode:'颜色来源',value:'颜色',theme:'强调色',default:'跟随 Obsidian',accent:'强调色',muted:'次要文字色',strength:'浓度',custom:'自选颜色',glass:'玻璃',sidebar:'磨砂','under-window':'通透'};
function label(key){if(windowField(key))return windowField(key).label;return key.split('.').filter(k=>!['modules','values','colors','overrides','controls'].includes(k)).map(k=>CONTROLS.find(f=>f.id===k)?.label||FIELDS.find(f=>f.key===k)?.label||EXTRA_FIELDS.find(f=>f.id===k)?.label||names[k]||k).join(' · ');}
const value=v=>v===null?'跟随 Obsidian':typeof v==='boolean'?(v?'开启':'关闭'):names[v]||String(v);
class PresetModal extends Modal{
 constructor(plugin,mode){super(plugin.app);this.plugin=plugin;this.mode=mode;}
 onOpen(){const c=this.contentEl;c.classList.add('se-dialog','se-preset-dialog');el(c,'h2','',this.mode==='export'?'导出外观配置':'导入外观配置');this.mode==='export'?this.renderExport(c):this.renderImport(c);}
 renderExport(c){
 const name=el(c,'input');name.type='text';name.value='我的外观';name.maxLength=60;name.setAttribute('aria-label','配置名称');
 const code=el(c,'details','se-preset-code');el(code,'summary','','查看配置文本');const text=el(code,'textarea','se-preset-json');text.readOnly=true;text.setAttribute('aria-label','导出的外观配置');
 const update=()=>text.value=JSON.stringify(makePreset(this.plugin.builtin.config,name.value,this.app.vault.getConfig?.('accentColor')||''),null,2);update();name.addEventListener('input',update);
 el(c,'p','se-muted','包含外观设置与强调色。不会包含笔记、CSS 源码、历史、库路径或面板布局。仅适用于 Obsidian 默认主题（浅色与深色）。');
 const actions=el(c,'div','se-actions');button(actions,'保存 JSON',()=>{const doc=c.ownerDocument,URL=doc.defaultView.URL,url=URL.createObjectURL(new Blob([text.value],{type:'application/json'})),a=el(c,'a');a.href=url;a.download=(name.value.trim().replace(/[^\p{L}\p{N}_-]/gu,'-').slice(0,60)||'appearance')+'.json';a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});button(actions,'复制配置',async()=>{try{await c.ownerDocument.defaultView.navigator.clipboard.writeText(text.value);}catch{ code.open=true;text.focus();text.select();throw new Error('无法访问剪贴板，已选中配置，请手动复制');}});button(actions,'关闭',()=>this.close());
 }
 renderImport(c){
 el(c,'p','se-muted','选择分享的 JSON 文件，或粘贴配置。先查看变更，再应用；应用前自动保留一份恢复点。');
 const file=el(c,'input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','选择外观配置文件');
 const code=el(c,'details','se-preset-code');el(code,'summary','','粘贴配置文本');const text=el(code,'textarea','se-preset-json');text.setAttribute('aria-label','粘贴外观配置');text.placeholder='粘贴配置 JSON';text.maxLength=MAX_BYTES;
 const accentLabel=el(c,'label','se-import-accent');const accent=el(accentLabel,'input');accent.type='checkbox';accent.checked=true;el(accentLabel,'span','','同时应用强调色');
 const status=el(c,'p','se-muted');status.setAttribute('role','status');const skippedNote=el(c,'p','se-muted se-preset-skipped');skippedNote.setAttribute('role','status');const preview=el(c,'div','se-preset-diff');let parsed=null,readId=0;
 const actions=el(c,'div','se-actions');const apply=button(actions,'应用配置',async()=>{if(!parsed)return;apply.disabled=true;try{await applyPreset(this.plugin,parsed,accent.checked,c.ownerDocument);this.close();}finally{if(apply.isConnected)apply.disabled=false;}},'mod-cta');apply.disabled=true;button(actions,'取消',()=>this.close());
 const inspect=()=>{parsed=null;apply.disabled=true;preview.replaceChildren();skippedNote.textContent='';skippedNote.hidden=true;if(!text.value.trim()){status.textContent='等待配置';return;}try{parsed=parsePreset(text.value);const caps=this.plugin.capabilities?.(c.ownerDocument),projected=importConfig(this.plugin.builtin.config,parsed.config,caps);skippedNote.hidden=!projected.skipped.length;if(projected.skipped.length)skippedNote.textContent='有 '+projected.skipped.length+' 项不适用于'+caps.name+'，将跳过并保留原值：'+projected.skipped.map(item=>label(item.path)).join('、')+'。';const rows=differences(this.plugin.builtin.config,projected.config).filter(r=>r.key.startsWith('controls.')||r.key==='enabled'||r.key==='glassMaterial'||r.key==='showFileTreeGuides'||r.key==='modules.translucency'||r.key==='modules.hideStatus'||r.key.includes('窗口不透明度'));if(accent.checked&&(this.app.vault.getConfig?.('accentColor')||'')!==parsed.accentColor)rows.push({key:'强调色',before:this.app.vault.getConfig?.('accentColor')||'默认',after:parsed.accentColor||'默认'});status.textContent=parsed.name+' · '+rows.length+' 项变更';for(const r of rows)el(preview,'p','',label(r.key)+'：'+(displayValue(r.key,r.before)??value(r.before))+' → '+(displayValue(r.key,r.after)??value(r.after)));apply.disabled=!rows.length;}catch(e){status.textContent=e.message;}};
 text.addEventListener('input',()=>{readId++;inspect();});accent.addEventListener('change',inspect);file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;const id=++readId;parsed=null;apply.disabled=true;status.textContent='正在读取配置';try{if(f.size>MAX_BYTES)throw new Error('配置文件不能超过 128 KB');const contents=await f.text();if(id!==readId||!c.isConnected)return;text.value=contents;code.open=false;inspect();}catch(e){if(id!==readId||!c.isConnected)return;parsed=null;apply.disabled=true;status.textContent=e.message;}});inspect();
 }
 onClose(){this.contentEl.replaceChildren();}
}
async function undoImport(plugin,doc){const undo=plugin.data.appearanceUndo;if(!undo)throw new Error('暂无可恢复的配置');await applyPreset(plugin,makePreset(undo.config,'恢复导入前配置',undo.accentColor),undo.restoreAccent,doc,false);}
module.exports={PresetModal,undoImport};
