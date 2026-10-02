'use strict';
const {el,button,report}=require('./ui');
const {hexColor}=require('./color-settings');
const {defaultColor}=require('./control-model');
function renderControl(view,parent,f){
 const manager=view.plugin.builtin,engine=view.plugin.builtinStyles,row=el(parent,'div','se-object-control');row.dataset.settingId=f.id;
 const label=el(row,'label','se-inline-toggle');el(label,'span','',f.sub&&f.label.startsWith(f.sub)?f.label.slice(f.sub.length).trim():f.label);const source=el(label,'select');source.setAttribute('aria-label',f.label+'来源');
 const options=f.type==='color'?[['default','跟随 Obsidian'],['accent','强调色'],['custom','自选颜色'],['muted','次要文字色']]:[['default','跟随 Obsidian'],['custom','自定义']];for(const [value,text]of options){const o=el(source,'option','',text);o.value=value;}
 if(f.id==='proseGap'||f.id==='proseWidth'||f.id==='listParagraphGap'){const cls=f.id==='listParagraphGap'?'note-list':'note-prose';el(row,'p','se-muted','仅用于指定笔记：在笔记属性中添加 cssclasses，并填入 '+cls+'。');}
 const detail=el(row,'div','se-object-value');const control={f,row,source,detail};view.objectControls.set(f.id,control);
 const save=async(value)=>{source.disabled=true;try{await manager.update({controls:{[f.id]:value}});}catch(e){report(e);}finally{source.disabled=false;engine.clearControlPreview(f.id);syncControls(view);}};
 if(f.type==='number'){
  const number=el(detail,'input');number.type='number';Object.assign(number,{min:f.min,max:f.max,step:'any',inputMode:'decimal'});number.setAttribute('aria-label',f.label);el(detail,'span','se-unit',f.unit||(f.id.endsWith('Weight')?'字重':'倍'));control.number=number;
  source.addEventListener('change',()=>save(source.value==='default'?null:f.seed));
  const valid=()=>number.value.trim()&&number.checkValidity();number.addEventListener('input',()=>{if(valid())engine.previewControl(f.id,number.valueAsNumber);else engine.clearControlPreview(f.id);});
  number.addEventListener('change',()=>{if(!valid()){number.reportValidity();engine.clearControlPreview(f.id);return;}save(number.valueAsNumber);});
 }else{
  const swatch=el(detail,'div','se-custom-color');const picker=el(swatch,'input');picker.type='color';picker.setAttribute('aria-label',f.label+'选色');const hex=el(swatch,'input');hex.type='text';hex.placeholder='#RRGGBB';hex.maxLength=7;hex.setAttribute('aria-label',f.label+'色号');
  const strengthLabel=el(detail,'label','se-color-strength');el(strengthLabel,'span','',f.background?'底色浓度':'颜色浓度');const strength=el(strengthLabel,'input');strength.type='number';Object.assign(strength,{min:0,max:100,step:'any'});strength.setAttribute('aria-label',f.label+'浓度');el(strengthLabel,'span','se-unit','%');Object.assign(control,{picker,hex,swatch,strength});
  source.addEventListener('change',()=>{const old=manager.config.controls[f.id];const accent=hexColor(view.app.vault.getConfig?.('accentColor'))||'#808080';save({...old,mode:source.value,value:source.value==='custom'?(old.value||accent):old.value});});
  const preview=input=>{hex.setCustomValidity('');const value=hexColor(input.value);if(value){if(input===picker)hex.value=value;else picker.value=value;engine.previewControl(f.id,{...manager.config.controls[f.id],mode:'custom',value});}else engine.clearControlPreview(f.id);};
  const commit=input=>{const value=hexColor(input.value);if(!value){hex.setCustomValidity('请输入 #RGB 或 #RRGGBB 色号');hex.reportValidity();engine.clearControlPreview(f.id);return;}hex.setCustomValidity('');save({...manager.config.controls[f.id],mode:'custom',value});};
  for(const input of [picker,hex]){input.addEventListener('input',()=>preview(input));input.addEventListener('change',()=>commit(input));}
  strength.addEventListener('input',()=>{if(strength.value.trim()&&strength.checkValidity())engine.previewControl(f.id,{...manager.config.controls[f.id],strength:strength.valueAsNumber});});strength.addEventListener('change',()=>{if(!strength.value.trim()||!strength.checkValidity()){strength.reportValidity();engine.clearControlPreview(f.id);return;}save({...manager.config.controls[f.id],strength:strength.valueAsNumber});});
 }
 return row;
}
function syncControls(view){for(const [id,c]of view.objectControls||[]){const value=view.plugin.builtin.config.controls[id];c.source.value=c.f.type==='color'?value.mode:value===null?'default':'custom';c.detail.hidden=c.source.value==='default';if(view.plugin.builtinStyles.previewControls[id]!==undefined)continue;if(c.f.type==='number'){if(c.number!==c.number.ownerDocument.activeElement)c.number.value=value??c.f.seed;}else{c.swatch.hidden=value.mode!=='custom';if(c.picker!==c.picker.ownerDocument.activeElement)c.picker.value=value.value||'#808080';if(c.hex!==c.hex.ownerDocument.activeElement){c.hex.value=value.value||'#808080';c.hex.setCustomValidity('');}if(c.strength!==c.strength.ownerDocument.activeElement)c.strength.value=value.strength;}}}
module.exports={renderControl,syncControls};
