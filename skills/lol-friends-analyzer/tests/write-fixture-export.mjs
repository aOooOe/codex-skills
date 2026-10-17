import fs from 'node:fs/promises';
import path from 'node:path';
import {owner,champions,games} from './fixtures.mjs';
const dir=process.argv[2];if(!dir)throw Error('Pass an output directory');
await fs.mkdir(path.join(dir,'details'),{recursive:true});
await fs.writeFile(path.join(dir,'current-summoner.json'),JSON.stringify(owner));
await fs.writeFile(path.join(dir,'champion-summary.json'),JSON.stringify(champions));
for(const g of games())await fs.writeFile(path.join(dir,'details',g.gameId+'.json'),JSON.stringify(g));
console.log('Synthetic export prepared.');
