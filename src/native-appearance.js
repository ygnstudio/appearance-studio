'use strict';
const {capabilities}=require('./capabilities');
// BrowserWindow is supplied by the desktop host. Never load Electron on mobile.
// Host integration is optional; all calls are capability checked and reversible.
class NativeAppearance {
 constructor({app,platform,config,changed=()=>{}}){Object.assign(this,{app,platform,config,changed});this.windows=new Map();}
 attach(doc){
  if(!doc?.body||this.windows.has(doc))return;
  const win=doc.defaultView,native=win?.electronWindow;
  const entry={doc,native,listening:false,owned:false,applied:undefined,state:'unsupported',cleanups:[]};this.windows.set(doc,entry);
  const update=()=>this.apply();
  for(const query of ['(prefers-reduced-transparency: reduce)','(forced-colors: active)']){
   const media=win?.matchMedia?.(query);if(media){entry[query]=media;media.addEventListener?.('change',update);entry.cleanups.push(()=>media.removeEventListener?.('change',update));}
  }
  if(win?.MutationObserver){const observer=new win.MutationObserver(update);observer.observe(doc.body,{attributes:true,attributeFilter:['class']});entry.cleanups.push(()=>observer.disconnect());}
  this.apply();
 }
 status(doc){return this.windows.get(doc)?.state||'unsupported';}
 restore(e){
  if(e.owned){try{if(!e.native.isDestroyed?.()){e.native.setVibrancy(this.app.vault.getConfig?.('translucency')?'sidebar':null);e.native.setBackgroundColor(e.background);}}catch(_){}e.owned=false;e.applied=undefined;}
  for(const key of ['se-native-glass','se-window-solid'])if(e.doc.body.classList.contains(key))e.doc.body.classList.remove(key);
 }
 apply(force=false){
  const c=this.config();let changed=false;
  for(const e of this.windows.values()){
   const previous=e.state;
   const caps=capabilities({platform:this.platform,app:this.app,doc:e.doc,media:e});
   if(e.layoutKey!==caps.layoutKey){e.layoutKey=caps.layoutKey;changed=true;}
   if(e.doc.defaultView?.closed){this.detach(e.doc);continue;}
   if(caps.nativeMaterial&&!e.listening){const update=()=>this.apply();for(const event of ['enter-full-screen','leave-full-screen']){e.native.on?.(event,update);e.cleanups.push(()=>{if(!e.native.isDestroyed?.())e.native.removeListener?.(event,update);});}e.listening=true;}
   if(!c?.enabled){this.restore(e);e.state='inactive';}
   else if(!caps.nativeMaterial){this.restore(e);e.state='unsupported';}
   else{
    const reduced=e['(prefers-reduced-transparency: reduce)']?.matches||e['(forced-colors: active)']?.matches;
    const fullscreen=e.native.isFullScreen?.()||e.doc.body.classList.contains('is-fullscreen');
    // macOS owns desktop blur; CSS must never blur the foreground text.
    const selected=c.glassMaterial==='glass'?(e.doc.body.classList.contains('theme-light')?'under-window':'hud'):c.glassMaterial;
    const material=c.modules.translucency&&!reduced&&!fullscreen?selected:null;
    try{
     if(!e.owned){e.background=e.native.getBackgroundColor();e.owned=true;}
     if(force||e.applied!==material){e.native.setBackgroundColor('#00000000');e.native.setVibrancy(material);e.applied=material;}
     e.doc.body.classList.toggle('se-native-glass',!!material);e.doc.body.classList.toggle('se-window-solid',!material);
     e.state=reduced?'reduced':fullscreen?'fullscreen':material?'active':'solid';
    }catch(error){this.restore(e);e.state='unavailable';}
   }
   if(previous!==e.state)changed=true;
  }
  if(changed)this.changed();
 }
 detach(doc){const e=this.windows.get(doc);if(!e)return;for(const fn of e.cleanups)fn();this.restore(e);this.windows.delete(doc);}
 dispose(){for(const doc of [...this.windows.keys()])this.detach(doc);}
}
module.exports={NativeAppearance};
