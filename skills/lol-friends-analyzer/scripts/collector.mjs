import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {fileURLToPath} from 'node:url';
import A from './analytics.cjs';
export async function json(file){return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}
export async function atomic(file,content){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,content,'utf8');await fs.rename(temp,file);}
export async function* walk(dir){
  let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return;}
  for(const e of entries){const p=path.join(dir,e.name);if(e.isDirectory()&&!e.isSymbolicLink())yield*walk(p);else if(e.isFile())yield p;}
}
export function logIds(text){return [...text.matchAll(/(?:GameStartData::GameID=|["']gameId["']\s*:\s*|[?&]gameId=)(\d{4,24})/g)].map(x=>x[1]);}
export function validGame(g,id){return g&&String(g.gameId)===String(id)&&Array.isArray(g.participants)&&g.participants.length>0&&Array.isArray(g.participantIdentities)&&g.participantIdentities.length>0&&Number.isFinite(g.gameCreation)&&g.gameCreation>0;}
export async function historyIndex(get,puuid){
  const index=new Map();let termination='上限 1000 场',failure=null,repeated=false;
  for(let beg=0;beg<1000;beg+=20){
    let r;try{r=await get('/lol-match-history/v1/products/lol/'+encodeURIComponent(puuid)+'/matches?begIndex='+beg+'&endIndex='+(beg+19));}catch{failure='历史索引请求失败';break;}
    if(r.status!==200){failure='历史索引 HTTP '+r.status;break;}
    const games=r.body?.games?.games;if(!Array.isArray(games)){failure='历史索引结构不可识别';break;}
    let added=0;for(const g of games)if(/^\d+$/.test(String(g.gameId))){const id=String(g.gameId);if(!index.has(id))added++;index.set(id,g);}
    if(!added&&games.length){repeated=true;termination='历史页重复，已由本地日志补查';break;}
    if(games.length<20){termination='历史页结束';break;}
  }
  return {index,termination,failure,repeated};
}
export function client(port,password,ca){
  if(!Number.isInteger(port)||port<1||port>65535||!password)throw Error('本机客户端连接参数无效');
  const agent=new https.Agent({ca,keepAlive:true});
  const allowed=p=>p==='/lol-summoner/v1/current-summoner'||p==='/riotclient/region-locale'||/^\/lol-match-history\/v1\/(games\/\d+|products\/lol\/[^/]+\/matches\?begIndex=\d+&endIndex=\d+)$/.test(p)||/^\/lol-game-data\/assets\/v1\/(champion-summary|items|cherry-augments|kiwi-augments|queues)\.json$/.test(p);
  async function get(p){
    if(!allowed(p))throw Error('端点不在只读采集范围');
    for(let attempt=0;attempt<2;attempt++)try{
      return await new Promise((resolve,reject)=>{
        const r=https.request({host:'127.0.0.1',port,path:p,method:'GET',agent,headers:{Authorization:'Basic '+Buffer.from('riot:'+password).toString('base64'),Accept:'application/json'},timeout:20000},s=>{
          const chunks=[];s.on('data',x=>chunks.push(x));s.on('error',()=>reject(Error('本机响应中断')));s.on('end',()=>{let body=null;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}resolve({status:s.statusCode,body});});
        });r.on('error',e=>reject(Error('无法连接本机客户端（'+(e.code||'网络错误')+'），请确认已登录并保持运行')));r.on('timeout',()=>r.destroy(Error('请求超时')));r.end();
      });
    }catch(e){if(attempt===1)throw e;}
  }
  return {get,close:()=>agent.destroy()};
}
export async function importData(dirs,range={}){
  let owner=null;const games=[],staticData={champions:[],items:[],augments:[]},failures=[];let count=0;
  for(const dir of dirs){
    try{const o=await json(path.join(dir,'current-summoner.json'));if(owner&&owner.puuid!==o.puuid)throw Error('导入目录属于不同账号');owner=o;}catch(e){if(e.message==='导入目录属于不同账号')throw e;}
    for(const [file,key]of [['champion-summary','champions'],['items','items'],['cherry-augments','augments'],['kiwi-augments','augments']])try{const data=await json(path.join(dir,file+'.json'));if(Array.isArray(data))staticData[key].push(...data);}catch{}
    for await(const f of walk(path.join(dir,'details'))){if(!f.endsWith('.json'))continue;count++;try{const g=await json(f);if(!validGame(g,g.gameId))throw Error('结构');games.push(g);}catch{failures.push({file:path.basename(f),reason:'无效对局文件'});}}
  }
  if(!owner)throw Error('导入目录缺少 current-summoner.json');
  const b=A.bounds(range.from,range.to),filtered=games.filter(g=>g.gameCreation>=b.start&&g.gameCreation<b.end);
  return A.buildDataset(filtered,owner,staticData,{source:'离线导入',discovered:count,success:games.length,failures,requestedRange:range,historyTermination:'导入的现有文件',validation:{KIWI:'真实本地样本',SR:'结构样例验证，待真实客户端验证',ARAM:'结构样例验证，待真实客户端验证'}});
}
export async function collect(config){
  const ca=await fs.readFile(new URL('../assets/riotgames.pem',import.meta.url)),api=client(config.port,config.password,ca);
  try{
    const me=await api.get('/lol-summoner/v1/current-summoner');if(me.status!==200||!me.body?.puuid)throw Error('客户端尚未登录或认证已失效，请重新打开启动入口');
    const owner=me.body,cache=path.join(config.output,'cache',owner.puuid.replace(/[^\w-]/g,'_')),details=path.join(cache,'details');await fs.mkdir(details,{recursive:true});await atomic(path.join(cache,'current-summoner.json'),JSON.stringify(owner));
    const staticData={champions:[],items:[],augments:[]},staticFailures=[];
    for(const [name,key]of [['champion-summary','champions'],['items','items'],['cherry-augments','augments'],['kiwi-augments','augments']]){
      const file=path.join(cache,name+'.json');try{const r=await api.get('/lol-game-data/assets/v1/'+name+'.json');if(r.status===200&&Array.isArray(r.body)){staticData[key].push(...r.body);await atomic(file,JSON.stringify(r.body));}else throw Error('不可用');}catch{try{staticData[key].push(...await json(file));}catch{staticFailures.push(name);}}
    }
    console.log('正在枚举客户端历史和本机日志…');
    const h=await historyIndex(api.get,owner.puuid),ids=new Set(h.index.keys());let scanned=0;
    for(const root of new Set(config.roots||[])){
      for(const dir of [path.join(root,'Game','Logs'),path.join(root,'Logs')])for await(const f of walk(dir)){
        if(!/r3dlog\.txt$|LeagueClient.*\.log$/i.test(path.basename(f)))continue;try{const stat=await fs.stat(f);if(stat.size>80*1024*1024)continue;for(const id of logIds(await fs.readFile(f,'utf8')))ids.add(id);scanned++;}catch{}
      }
    }
    for await(const f of walk(details)){const id=path.basename(f,'.json');if(/^\d+$/.test(id))ids.add(id);}
    const games=[],failures=[],b=A.bounds(config.from,config.to);let done=0,cached=0;
    for(const id of ids){
      const file=path.join(details,id+'.json');let g=null;
      try{const c=await json(file);if(validGame(c,id)){g=c;cached++;}}catch{}
      const hint=h.index.get(id)?.gameCreation;if(!g&&Number.isFinite(hint)&&(hint<b.start||hint>=b.end)){done++;continue;}
      if(!g)try{const r=await api.get('/lol-match-history/v1/games/'+id);if(r.status===200&&validGame(r.body,id)){g=r.body;await atomic(file,JSON.stringify(g));}else failures.push({id,status:r.status,reason:'详情不可读取或结构无效'});}catch{failures.push({id,reason:'本机请求失败'});}
      if(g&&g.gameCreation>=b.start&&g.gameCreation<b.end)games.push(g);done++;if(done%20===0)console.log(`详情进度 ${done}/${ids.size}，缓存 ${cached}，失败 ${failures.length}`);
    }
    return A.buildDataset(games,owner,staticData,{source:'本机客户端＋日志',discovered:ids.size,success:games.length,cached,scannedLogFiles:scanned,failures,staticFailures,historyRepeated:h.repeated,historyFailure:h.failure,historyTermination:h.termination,requestedRange:{from:config.from||null,to:config.to||null},validation:{KIWI:'真实本地样本',SR:'结构样例验证，待真实客户端验证',ARAM:'结构样例验证，待真实客户端验证'}});
  }finally{api.close();config.password=null;}
}
