import assert from 'node:assert/strict';
import {importData} from '../scripts/collector.mjs';
import A from '../scripts/analytics.cjs';
const dirs=process.argv.slice(2);if(!dirs.length)throw Error('Pass existing local export directories explicitly');
const d=await importData(dirs),modeCounts=Object.fromEntries(['KIWI','OTHER'].map(m=>[m,d.matches.filter(g=>g.mode===m).length]));
assert.equal(d.matches.length,366);assert.deepEqual(modeCounts,{KIWI:354,OTHER:12});assert.equal(d.coverage.failures.length,0);
let scored=0;for(const m of d.matches)for(const p of m.players){if(A.finite(p.score)){scored++;assert.ok(p.score>=0&&p.score<=100);assert.ok(Math.abs(p.score-A.axes.reduce((s,a,i)=>s+p.percentiles[a]*A.weights[p.classKey][i]/100,0))<1e-8);}if(m.mode==='OTHER')assert.equal(p.score,null);}
const state={friends:d.teammates.slice(0,6).map(p=>p.key),mode:'KIWI'};
const matches=A.select(d,state);assert.equal(matches.length,new Set(matches.map(m=>m.id)).size);
for(const key of state.friends){const r=A.rowsFor(matches,key),self=A.rowsFor(r.map(x=>x.match),null,true);assert.equal(r.length,self.length);for(const a of A.advice(r))for(const id of a.evidence)assert.ok(r.some(x=>x.match.id===id));}
console.log(JSON.stringify({unique:d.matches.length,modeCounts,scoredPlayerRecords:scored,cohortSizes:Object.fromEntries(Object.entries(d.scoring.references).map(([k,v])=>[k,v.n])),friendUnion:matches.length,passed:true},null,2));
