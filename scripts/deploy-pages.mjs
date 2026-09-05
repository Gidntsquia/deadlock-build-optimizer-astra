import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Publishes only the built static app, never the workspace or local cache.
// Requires an origin remote and an authenticated GitHub CLI.
const root=process.cwd();
function run(command,args,cwd=root){return execFileSync(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim()}
const remote=run('git',['remote','get-url','origin']);
if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(remote))throw new Error('Expected a GitHub HTTPS origin remote');
const temporary=await mkdtemp(path.join(os.tmpdir(),'deadlock-pages-'));
const auth=['-c','credential.helper=','-c','credential.helper=!gh auth git-credential'];
try{
 run('git',['init','--initial-branch=gh-pages',temporary]);
 run('git',['remote','add','origin',remote],temporary);
 const existing=run('git',[...auth,'ls-remote','--heads','origin','gh-pages'],temporary);
 if(existing){
  run('git',[...auth,'fetch','--depth=1','origin','gh-pages'],temporary);
  run('git',['checkout','-B','gh-pages','FETCH_HEAD'],temporary);
  run('git',['rm','-r','--ignore-unmatch','.'],temporary);
 }
 await cp(path.join(root,'dist'),temporary,{recursive:true});
 await writeFile(path.join(temporary,'.nojekyll'),'');
 run('git',['add','--all'],temporary);
 run('git',['commit','--allow-empty','-m',`Publish app from ${run('git',['rev-parse','--short','HEAD'])}`],temporary);
 console.log(run('git',[...auth,'push','origin','HEAD:gh-pages'],temporary));
 console.log('Static app pushed to gh-pages. Check the GitHub Pages deployment before sharing the URL.');
}finally{
 // mkdtemp-created directory is owned exclusively by this deployment invocation.
 await rm(temporary,{recursive:true,force:true});
}
