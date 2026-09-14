import { betaStore } from '../src/lib/beta-store.server.ts';
import { writeFileSync } from 'node:fs';
const store=betaStore();
try {
  const links=store.issue().map(code=>`http://127.0.0.1:3000/builder#invite=${code}`);
  writeFileSync('.local-runtime/beta-invitations.txt',links.join('\n')+'\n');
  console.log('Saved exactly three unclaimed invitations to .local-runtime/beta-invitations.txt. These are local links; update the origin after deployment.');
}finally{store.db.close();}
