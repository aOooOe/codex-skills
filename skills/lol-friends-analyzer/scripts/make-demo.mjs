import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import A from './analytics.cjs';
import {render} from './run.mjs';
import {owner,champions,games} from '../tests/fixtures.mjs';
const d=A.buildDataset([...games('KIWI'),...games('CLASSIC').map(g=>({...g,gameId:g.gameId+100})),...games('ARAM').map(g=>({...g,gameId:g.gameId+200}))],owner,{champions,items:[{id:1001,name:'测试装备'}],augments:[{id:10,name:'测试强化'}]},{source:'合成演示数据（不是真实战绩）',failures:[],historyTermination:'演示',validation:{KIWI:'合成演示',SR:'结构样例',ARAM:'结构样例'}});
const output=process.argv[2]||fileURLToPath(new URL('../demo.html',import.meta.url));
await fs.writeFile(output,await render(d));console.log('Synthetic demo generated.');
