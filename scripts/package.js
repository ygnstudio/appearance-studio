'use strict';
// Explicit allowlist: never copy a vault, installed plugin directory, or glob.
const fs=require('node:fs'),path=require('node:path');
const FILES=Object.freeze(['main.js','manifest.json','styles.css']);
function regular(file){if(!fs.lstatSync(file).isFile())throw new Error('Release inputs must be regular files: '+path.basename(file));}
function validateText(text,name){
 const patterns=[/\/Users\/[^/\s]+/,/\/home\/[^/\s]+/,/[A-Z]:\\Users\\/i,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{20,}/,/AKIA[0-9A-Z]{16}/,/sk-[A-Za-z0-9_-]{24,}/];
 if(patterns.some(p=>p.test(text)))throw new Error('Potential private path or credential in '+name+'; packaging stopped.');
}
function validateDirectory(dir){
 const names=fs.readdirSync(dir).sort();
 if(JSON.stringify(names)!==JSON.stringify([...FILES].sort()))throw new Error('Release directory must contain exactly main.js, manifest.json and styles.css.');
 for(const name of FILES){regular(path.join(dir,name));validateText(fs.readFileSync(path.join(dir,name),'utf8'),name);}
}
function packageRelease(root,destination){
 const contents=FILES.map(name=>{const file=path.join(root,name);regular(file);const data=fs.readFileSync(file);validateText(data.toString('utf8'),name);return [name,data];});
 const manifest=JSON.parse(contents.find(([name])=>name==='manifest.json')[1].toString());
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(manifest.id!=='snippet-editor'||manifest.version!==pkg.version)throw new Error('Manifest identity or package version mismatch.');
 // Exclusive creation prevents overwriting files or packaging stale data.
 fs.mkdirSync(destination);
 for(const [name,data]of contents)fs.writeFileSync(path.join(destination,name),data,{flag:'wx'});
 validateDirectory(destination);
 for(const [name,data]of contents)if(!fs.readFileSync(path.join(destination,name)).equals(data))throw new Error('Release verification failed: '+name);
 return destination;
}
if(require.main===module){
 const root=path.join(__dirname,'..'),dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
 const run=fs.mkdtempSync(path.join(dist,'release-'));
 try{console.log('Release files: '+packageRelease(root,path.join(run,'snippet-editor')));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={FILES,packageRelease,validateDirectory};
