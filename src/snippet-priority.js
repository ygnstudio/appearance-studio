'use strict';
// A reversible priority overlay. Never rewrites files or disables host stylesheets.
// Only declarations overlapping an active built-in property AND selector are copied.
const LAYER='snippet-editor-user-priority';
function splitSelectors(text){
 const out=[];let start=0,depth=0,quote='',escape=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(quote){if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(c===','&&!depth){out.push(text.slice(start,i).trim());start=i+1;}}
 out.push(text.slice(start).trim());return out.filter(Boolean);
}
function pseudo(selector){
 let depth=0,quote='',escape=false;
 for(let i=0;i<selector.length;i++){const c=selector[i];if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(quote){if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(!depth&&c===':'&&(selector[i+1]===':'||/^:(before|after|first-line|first-letter)(?![\w-])/.test(selector.slice(i))))return [selector.slice(0,i)||'*',selector.slice(i).replace(/^:(before|after|first-line|first-letter)/,'::$1')];}
 return [selector,''];
}
function nest(selector,parent){if(!parent)return selector;let result='',quote='',escape=false,found=false;for(const c of selector){if(escape){result+=c;escape=false;continue;}if(c==='\\'){result+=c;escape=true;continue;}if(quote){result+=c;if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;result+=c;}else if(c==='&'){result+=':is('+parent+')';found=true;}else result+=c;}return found?result:':is('+parent+') '+result;}
function header(rule){const text=rule.cssText;let quote='',escape=false;for(let i=0;i<text.length;i++){const c=text[i];if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(quote){if(c===quote)quote='';continue;}if(c==='"'||c==="'")quote=c;else if(c==='{')return text.slice(0,i).trim();}return '';}
function family(prop){if(prop.startsWith('--'))return prop;for(const f of ['padding','margin','background','border','font','overflow','text-decoration','flex','grid','inset'])if(prop===f||prop.startsWith(f+'-'))return f;if(['top','right','bottom','left'].includes(prop))return 'inset';return prop;}
function overlaps(a,b){return a===b||(!a.startsWith('--')&&!b.startsWith('--')&&(a==='all'||b==='all'||family(a)===family(b)));}
function wrap(text,conditions){return conditions.reduceRight((value,h)=>h+' { '+value+' }',text);}
// Keep the source's native layer order, including nested implicit layers.
class Layers {
 constructor(){this.root={children:new Map(),id:0};this.next=0;this.anonymous=new WeakMap();this.serial=0;}
 anonymousName(rule){if(!this.anonymous.has(rule))this.anonymous.set(rule,"__anonymous_"+(++this.serial));return this.anonymous.get(rule);}
 add(path,names){let node=this.root;for(const name of [...path,...names]){if(!node.children.has(name))node.children.set(name,{children:new Map(),id:++this.next});node=node.children.get(name);}return node;}
 ranked(){const out=[];function visit(node){for(const child of node.children.values())visit(child);out.push(node.id);}visit(this.root);return out;}
}
function collect(sheets,layers=new Layers()){
 const records=[];
 function walk(rules,path=[],conditions=[],parent='',base=''){
  for(const rule of Array.from(rules||[])){
   const kind=rule.constructor?.name||'';
   if(kind==='CSSLayerStatementRule'){for(const name of Array.from(rule.nameList||[]))layers.add(path,String(name).split('.'));continue;}
   if(kind==='CSSLayerBlockRule'){const names=rule.name?rule.name.split('.'):[layers.anonymousName(rule)];layers.add(path,names);walk(rule.cssRules,[...path,...names],conditions,parent,base);continue;}
   if(kind==='CSSImportRule'){
    const names=rule.layerName===null||rule.layerName===undefined?[]:rule.layerName?rule.layerName.split('.'):[layers.anonymousName(rule)];layers.add(path,names);
    const cond=[...conditions];if(rule.media?.mediaText)cond.push('@media '+rule.media.mediaText);if(rule.supportsText)cond.push('@supports ('+rule.supportsText+')');
    try{walk(rule.styleSheet?.cssRules,[...path,...names],cond,parent,rule.href||base);}catch(_){}continue;
   }
   if(rule.selectorText||kind==='CSSNestedDeclarations'){
    const selector=rule.selectorText?nest(rule.selectorText,parent):parent;
    if(selector&&rule.style){const declarations=Array.from(rule.style).map(prop=>({prop,value:rule.style.getPropertyValue(prop),important:rule.style.getPropertyPriority(prop)==='important'}));records.push({selector,declarations,conditions,layer:layers.add(path,[]).id,base});}
    if(rule.cssRules)walk(rule.cssRules,path,conditions,selector,base);continue;
   }
   if(rule.cssRules&&['CSSMediaRule','CSSSupportsRule','CSSContainerRule','CSSScopeRule','CSSStartingStyleRule'].includes(kind))walk(rule.cssRules,path,[...conditions,header(rule)],parent,base);
  }
 }
 for(const sheet of sheets){if(!sheet||sheet.disabled)continue;try{walk(sheet.cssRules,[],sheet.media?.mediaText?['@media '+sheet.media.mediaText]:[],'',sheet.href||'');}catch(_){}}
 return {records,ranks:layers.ranked()};
}
function urls(value,base){if(!base)return value;return value.replace(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi,(original,a,b,c)=>{const raw=(a??b??c).trim();if(raw.includes('\\')||raw.startsWith('#'))return original;try{return 'url('+JSON.stringify(new URL(raw,base).href)+')';}catch(_){return original;}});}
function priorityCSS(builtinSheet,snippetSheets,generation=1,registry=new Layers()){
 const built=collect([builtinSheet]).records,custom=collect(snippetSheets,registry);if(!built.length||!custom.records.length)return '';
 const rollback=custom.records.flatMap(r=>r.declarations).filter(d=>['revert','revert-layer'].includes(d.value.trim())).map(d=>d.prop);
 const buckets=new Map(),put=(key,text)=>{const bucket=buckets.get(key)||[];bucket.push(text);buckets.set(key,bucket);};
 for(const r of custom.records)for(const d of r.declarations){
  // rollback keywords should retain the original cascade, not roll back the overlay.
  if(rollback.some(p=>overlaps(p,d.prop)))continue;
  const groups=new Map();
  for(const b of built){if(!b.declarations.some(x=>overlaps(x.prop,d.prop)))continue;const key=JSON.stringify(b.conditions),group=groups.get(key)||{conditions:b.conditions,selectors:[]};group.selectors.push(...splitSelectors(b.selector));groups.set(key,group);}
  for(const group of groups.values())for(const selector of splitSelectors(r.selector)){
   const [base,tail]=pseudo(selector);const guards=[...new Set(group.selectors.map(pseudo).filter(([,p])=>p===tail).map(([p])=>p))];if(!guards.length)continue;
   // :where keeps the snippet's specificity; :is also preserves nesting specificity.
   const target=':where('+guards.join(',')+'):is('+base+')'+tail;
   put((d.important?'i':'n')+r.layer,wrap(target+' { '+d.prop+': '+urls(d.value,r.base)+' !important; }',[...r.conditions,...group.conditions]));
  }
 }
 if(!buckets.size)return '';
 // All copies are important. Important layers run first-to-last; normal source
 // layers run last-to-first. Split the original two importance levels explicitly.
 const order=[...custom.ranks.map(id=>'i'+id),...custom.ranks.slice().reverse().map(id=>'n'+id)].filter(k=>buckets.has(k));
 return '@layer '+LAYER+' { @layer revision'+generation+' { @layer '+order.join(',')+';\n'+order.map(k=>'@layer '+k+' {\n'+buckets.get(k).join('\n')+'\n}').join('\n')+'\n} }';
}
class SnippetPriority {
 constructor(sourceNodes){this.sourceNodes=sourceNodes;this.entries=new Map();}
 attach(doc,builtin){
  if(!doc?.head||!doc.defaultView?.MutationObserver||this.entries.has(doc))return;
  const node=doc.createElement('style');node.dataset.snippetEditorPriority='true';doc.head.appendChild(node);
  const e={doc,builtin,node,revision:0,signature:null,queued:false,layers:new Layers()};this.entries.set(doc,e);
  e.observer=new doc.defaultView.MutationObserver(records=>{if(records.every(r=>r.target===node||r.target.parentNode===node))return;this.schedule(e);});
  e.observer.observe(doc.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['media','disabled']});
  e.load=event=>{if(event.target===node||event.target===builtin)return;if(!Array.from(this.sourceNodes?.()||[]).some(n=>n===event.target||n.textContent===event.target?.textContent))return;e.signature=null;this.schedule(e);};doc.head.addEventListener('load',e.load,true);
  this.apply(doc);
 }
 schedule(e){if(e.queued)return;e.queued=true;queueMicrotask(()=>{e.queued=false;if(this.entries.get(e.doc)===e)this.apply(e.doc);});}
 apply(doc){
  const e=this.entries.get(doc);if(!e)return;
  const originals=Array.from(this.sourceNodes?.()||[]).filter(n=>n?.sheet&&!n.sheet.disabled);
  // Popouts clone host snippet nodes. Use only registered source texts, never
  // arbitrary plugin styles. The source list remains in the host's cascade order.
  const local=Array.from(doc.head.querySelectorAll('style'));const nodes=originals.map(n=>n.ownerDocument===doc?n:local.find(x=>x.textContent===n.textContent));
  const owned=collect([e.builtin.sheet]).records.map(r=>[r.selector,r.conditions,r.declarations.map(d=>d.prop)]);
  const signature=JSON.stringify([owned,nodes.map((n,i)=>[originals[i].textContent,n?.media,n?.sheet?.disabled])]);
  if(signature===e.signature)return;e.signature=signature;
  const text=priorityCSS(e.builtin.sheet,nodes.filter(Boolean).map(n=>n.sheet),++e.revision,e.layers);if(e.node.textContent!==text)e.node.textContent=text;
 }
 detach(doc){const e=this.entries.get(doc);if(!e)return;e.observer.disconnect();doc.head.removeEventListener('load',e.load,true);e.node.remove();this.entries.delete(doc);}
 dispose(){for(const doc of [...this.entries.keys()])this.detach(doc);}
}
module.exports={SnippetPriority,priorityCSS,collect,splitSelectors,pseudo,nest,overlaps};
