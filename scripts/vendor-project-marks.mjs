import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),workspace=resolve(process.argv[2]||join(root,'..'));
const provenance=[];
for(const [project,source] of [['weftmark','weftmark/assets/weftmark.svg'],['nostoi','nostoi/assets/logo.svg']]){
  const bytes=await readFile(join(workspace,source));
  await mkdir(join(root,'sites',project,'public/assets'),{recursive:true});
  await writeFile(join(root,'sites',project,'public/assets/logo.svg'),bytes);
  provenance.push({project,source,sha256:createHash('sha256').update(bytes).digest('hex'),kind:'canonical-project-logo'});
}
await writeFile(join(root,'design/project-marks.json'),JSON.stringify({schema:'ragbaz.project-marks/v0',marks:provenance},null,2)+'\n');
