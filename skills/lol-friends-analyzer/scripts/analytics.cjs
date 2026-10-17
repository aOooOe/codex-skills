/* Shared deterministic core, used unchanged in Node and in the offline report. */
(function (root) {
  'use strict';
  const VERSION='1.0.0';
  const classes={mage:'法师',marksman:'射手',assassin:'刺客',fighter:'战士',tank:'坦克',support:'辅助',unknown:'未知定位'};
  const modes={SR:'召唤师峡谷',ARAM:'普通大乱斗',KIWI:'海克斯大乱斗',OTHER:'其他模式（未支持）'};
  const axes=['dpm','conversion','kp','survival','ccpm'];
  const axisNames={dpm:'输出',conversion:'资源效率',kp:'参团',survival:'生存',ccpm:'控制'};
  const weights={mage:[30,25,20,15,10],marksman:[30,25,20,15,10],assassin:[30,25,20,15,10],fighter:[25,20,20,15,20],tank:[15,10,25,20,30],support:[10,10,30,20,30]};
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const number=n=>finite(n)&&n>=0?n:null;
  const divide=(a,b)=>finite(a)&&finite(b)&&b>0?a/b:null;
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const mean=a=>{const v=a.filter(finite);return v.length?sum(v)/v.length:null;};
  function day(ms){return finite(ms)?new Date(ms+8*3600000).toISOString().slice(0,10):'';}
  function bounds(from,to){
    const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('日期应为 yyyy-MM-dd');const t=Date.parse(s+'T00:00:00+08:00');if(!finite(t)||day(t)!==s)throw Error('日期无效');return t;};
    const start=from?parse(from):-Infinity,end=to?parse(to)+86400000:Infinity;
    if(start>=end)throw Error('开始日期不能晚于结束日期');return {start,end};
  }
  function classify(g){
    if(g.gameMode==='KIWI')return 'KIWI';if(g.gameMode==='ARAM')return 'ARAM';
    if(g.gameMode==='CLASSIC'&&g.mapId===11&&g.gameType!=='CUSTOM_GAME'&&![0,830,840,850,870,880,890].includes(g.queueId))return 'SR';return 'OTHER';
  }
  function identity(platform,p){
    const id=String(p?.puuid||'');if(id&&!/^0+$/.test(id))return platform+':'+id;
    if(p?.summonerId&&String(p.summonerId)!=='0')return platform+':summoner:'+p.summonerId;return null;
  }
  function playerName(p){return (p.gameName||p.summonerName||p.displayName||'未知玩家')+(p.tagLine?'#'+p.tagLine:'');}
  function percentile(sorted,x){
    if(!finite(x)||!sorted.length)return null;
    let lo=0,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid]<x)lo=mid+1;else hi=mid;}const left=lo;hi=sorted.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid]<=x)lo=mid+1;else hi=mid;}return 100*(left+(lo-left)/2)/sorted.length;
  }
  function buildDataset(rawGames,owner,staticData={},coverage={}){
    if(!owner||(!owner.puuid&&!owner.summonerId))throw Error('缺少当前账号的稳定身份标识');
    const champions=new Map((staticData.champions||[]).map(x=>[x.id,x])),dedup=new Map(),warnings=[];
    for(const g of rawGames){
      if(!g||!/^\d+$/.test(String(g.gameId))||!Array.isArray(g.participants)||!Array.isArray(g.participantIdentities)||!finite(g.gameCreation)){warnings.push('忽略结构不完整的对局');continue;}
      dedup.set(String(g.platformId||'UNKNOWN')+':'+g.gameId,g);
    }
    const players=new Map(),matches=[];let unrelated=0;
    for(const [key,g] of dedup){
      const platform=String(g.platformId||'UNKNOWN'),ids=new Map(g.participantIdentities.map(i=>[i.participantId,i.player||{}]));
      const me=g.participants.find(p=>{const i=ids.get(p.participantId)||{};return owner.puuid?i.puuid===owner.puuid:String(i.summonerId)===String(owner.summonerId);});
      if(!me){unrelated++;continue;}
      const mode=classify(g),minutes=divide(number(g.gameDuration),60),early=g.participants.some(p=>p.stats?.gameEndedInEarlySurrender===true||p.stats?.teamEarlySurrendered===true);
      const match={id:key,gameId:String(g.gameId),platform,time:g.gameCreation,day:day(g.gameCreation),duration:number(g.gameDuration),version:g.gameVersion||'',queue:g.queueId,sourceMode:g.gameMode,mode,ownerKey:identity(platform,ids.get(me.participantId)),players:[],excluded:mode==='OTHER'?'不支持的模式':!minutes?'时长无效':g.gameDuration<300?'不足五分钟':early?'提前结束':null};
      for(const p of g.participants){
        const i=ids.get(p.participantId)||{},s=p.stats||{},c=champions.get(p.championId)||{},id=identity(platform,i)||platform+':unresolved:'+g.gameId+':'+p.participantId;
        const classKey=(c.roles||[]).find(x=>Object.hasOwn(classes,x))||'unknown';
        const row={key:id,name:playerName(i),participantId:p.participantId,championId:p.championId,champion:c.name||'英雄 '+p.championId,classKey,team:p.teamId,subteam:s.playerSubteamId,ally:g.gameMode==='CHERRY'?s.playerSubteamId===me.stats?.playerSubteamId:p.teamId===me.teamId,win:typeof s.win==='boolean'?s.win:null,stats:{},items:[],augments:[],metrics:{},percentiles:null,score:null,scoreReason:null};
        for(const k of ['kills','deaths','assists','totalDamageDealtToChampions','goldEarned','totalDamageTaken','damageSelfMitigated','totalHeal','timeCCingOthers','visionScore','totalMinionsKilled','neutralMinionsKilled','damageDealtToTurrets'])row.stats[k]=number(s[k]);
        for(let n=0;n<7;n++)if(number(s['item'+n]))row.items.push(s['item'+n]);for(let n=1;n<=6;n++)if(number(s['playerAugment'+n]))row.augments.push(s['playerAugment'+n]);
        row.metrics.dpm=divide(row.stats.totalDamageDealtToChampions,minutes);row.metrics.survival=divide(row.stats.deaths,minutes);row.metrics.ccpm=divide(row.stats.timeCCingOthers,minutes);
        row.metrics.kda=finite(row.stats.kills)&&finite(row.stats.assists)&&finite(row.stats.deaths)?(row.stats.kills+row.stats.assists)/Math.max(1,row.stats.deaths):null;
        row.metrics.vision=divide(row.stats.visionScore,minutes);row.metrics.cs=finite(row.stats.totalMinionsKilled)&&finite(row.stats.neutralMinionsKilled)?divide(row.stats.totalMinionsKilled+row.stats.neutralMinionsKilled,minutes):null;row.metrics.turrets=divide(row.stats.damageDealtToTurrets,minutes);
        match.players.push(row);
        if(!players.has(id))players.set(id,{key:id,name:row.name,aliases:[],lastSeen:0,stable:!id.includes(':unresolved:')});
        const profile=players.get(id);if(!profile.aliases.includes(row.name))profile.aliases.push(row.name);if(match.time>=profile.lastSeen){profile.name=row.name;profile.lastSeen=match.time;}
      }
      for(const row of match.players){
        const team=match.players.filter(x=>g.gameMode==='CHERRY'?x.subteam===row.subteam:x.team===row.team),total=k=>team.every(x=>finite(x.stats[k]))?sum(team.map(x=>x.stats[k])):null;
        row.metrics.damageShare=divide(row.stats.totalDamageDealtToChampions,total('totalDamageDealtToChampions'));row.metrics.goldShare=divide(row.stats.goldEarned,total('goldEarned'));row.metrics.conversion=divide(row.metrics.damageShare,row.metrics.goldShare);
        row.metrics.kp=finite(row.stats.kills)&&finite(row.stats.assists)?divide(row.stats.kills+row.stats.assists,total('kills')):null;
      }
      matches.push(match);
    }
    matches.sort((a,b)=>a.time-b.time);const references={};
    for(const m of matches)if(!m.excluded)for(const p of m.players){
      if(!weights[p.classKey]||!axes.every(k=>finite(p.metrics[k])))continue;const k=m.mode+':'+p.classKey;
      if(!references[k])references[k]={n:0,gameIds:[],values:Object.fromEntries(axes.map(a=>[a,[]]))};const ref=references[k];ref.n++;if(!ref.gameIds.includes(m.id))ref.gameIds.push(m.id);for(const a of axes)ref.values[a].push(p.metrics[a]);
    }
    for(const ref of Object.values(references)){ref.games=ref.gameIds.length;delete ref.gameIds;for(const a of axes)ref.values[a].sort((a,b)=>a-b);}
    for(const m of matches)for(const p of m.players){
      const ref=references[m.mode+':'+p.classKey];p.scoreReason=m.excluded||(!weights[p.classKey]?'英雄定位未知':!axes.every(a=>finite(p.metrics[a]))?'评分字段缺失或分母为零':!ref||ref.n<30||ref.games<5?'同模式同定位参考不足':null);
      if(p.scoreReason)continue;p.percentiles=Object.fromEntries(axes.map(a=>[a,a==='survival'?100-percentile(ref.values[a],p.metrics[a]):percentile(ref.values[a],p.metrics[a])]));p.score=sum(axes.map((a,n)=>p.percentiles[a]*weights[p.classKey][n]/100));
    }
    const candidates=new Map();for(const m of matches.filter(m=>m.mode!=='OTHER'))for(const p of m.players.filter(p=>p.ally&&p.key!==m.ownerKey)){
      if(!players.get(p.key).stable)continue;if(!candidates.has(p.key))candidates.set(p.key,new Set());candidates.get(p.key).add(m.id);
    }
    const teammates=[...candidates].map(([key,ids])=>({...players.get(key),games:ids.size})).sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name,'zh-CN'));
    return {schemaVersion:1,scoreVersion:VERSION,generatedAt:new Date().toISOString(),timezone:'Asia/Shanghai',owner:{name:playerName(owner),puuid:owner.puuid||null,keys:[...new Set(matches.map(m=>m.ownerKey))]},matches,teammates,players:[...players.values()],static:{items:Object.fromEntries((staticData.items||[]).map(x=>[x.id,x.name])),augments:Object.fromEntries((staticData.augments||[]).map(x=>[x.id,x.nameTRA||x.name||x.augmentNameId||'强化 '+x.id]))},scoring:{axes,axisNames,weights,referenceRange:{from:matches[0]?.day||null,to:matches.at(-1)?.day||null},references},coverage:{...coverage,unique:matches.length,unrelated,unsupported:matches.filter(m=>m.mode==='OTHER').length,warnings}};
  }
  function select(dataset,state={}){
    const b=bounds(state.from,state.to),friends=new Set(state.friends||[]);return dataset.matches.filter(m=>m.mode===state.mode&&m.time>=b.start&&m.time<b.end&&(state.outcome==='win'?m.players.find(p=>p.key===m.ownerKey)?.win===true:state.outcome==='loss'?m.players.find(p=>p.key===m.ownerKey)?.win===false:true)&&(!state.excludeShort||!m.excluded)&&m.players.some(p=>p.ally&&friends.has(p.key)));
  }
  function rowsFor(matches,key,owner=false){return matches.flatMap(m=>{const p=m.players.find(p=>p.ally&&p.key===(owner?m.ownerKey:key));return p?[{match:m,player:p}]:[];});}
  function summarize(rows){
    const ps=rows.map(r=>r.player),wins=ps.filter(p=>p.win===true).length,losses=ps.filter(p=>p.win===false).length,scored=ps.filter(p=>finite(p.score)),total=k=>ps.every(p=>finite(p.stats[k]))?sum(ps.map(p=>p.stats[k])):null;
    const k=total('kills'),d=total('deaths'),a=total('assists');return {n:ps.length,wins,losses,unknown:ps.length-wins-losses,winRate:divide(wins,wins+losses),score:mean(scored.map(p=>p.score)),scored:scored.length,rankable:scored.length>=10,excluded:rows.filter(r=>r.match.excluded).length,kills:mean(ps.map(p=>p.stats.kills)),deaths:mean(ps.map(p=>p.stats.deaths)),assists:mean(ps.map(p=>p.stats.assists)),kda:ps.length&&finite(k)&&finite(d)&&finite(a)?(k+a)/Math.max(1,d):null,metrics:Object.fromEntries(Object.keys(ps[0]?.metrics||{}).map(k=>[k,mean(ps.map(p=>p.metrics[k]))])),percentiles:Object.fromEntries(axes.map(k=>[k,mean(scored.map(p=>p.percentiles[k]))]))};
  }
  const adviceText={dpm:['有效输出是否经常被打断','复盘三场低输出对局，观察交战前的位置、技能是否命中，以及能安全持续输出的时机。'],conversion:['获得经济后是否转化为有效输出','复查关键成装后的几次交战，检查是否及时加入战斗，以及目标选择是否让装备收益发挥出来。'],kp:['是否错过了主要交战','接下来十场在交战前先确认队友位置，重点复查未参与的击杀；不要为了参团率强行接团。'],survival:['死亡是否打断了关键参战','复盘死亡前的站位、人数与技能状态，先找能避免的死亡；大乱斗也要区分必要回城和无收益阵亡。'],ccpm:['控制技能是否缺少有效衔接','复查三场低控制记录的交战，观察控制目标和队友技能衔接；控制时长不等于开团质量。']};
  function advice(rows){
    const s=summarize(rows),scored=rows.filter(r=>finite(r.player.score));if(!rows.length)return [];
    if(scored.length<10)return [{axis:null,title:'先积累可比较的对局',observation:`当前 ${rows.length} 场，共 ${scored.length} 场可评分，尚不足 10 场。`,question:'这些对局是否覆盖了常用英雄和正常游戏时长？',action:'先保留这些对局作为复盘线索，积累到至少十场可评分记录后再判断稳定长短板。',evidence:rows.slice(-3).map(r=>r.match.id),sample:scored.length}];
    const picked=axes.map(axis=>({axis,value:s.percentiles[axis]})).sort((a,b)=>a.value-b.value).filter(x=>x.value<30).slice(0,3);
    if(!picked.length){const losses=rows.filter(r=>r.player.win===false);return [{axis:null,title:'目前没有明显低于参照的维度',observation:`${scored.length} 场可评分记录中，各维度平均百分位均不低于 30。`,question:'表现是否在不同英雄和胜负局中保持一致？',action:'优先复盘最近三场败局，分别检查输出时机、技能衔接和目标选择，保留有效做法。',evidence:(losses.length?losses:rows).slice(-3).map(r=>r.match.id),sample:scored.length}];}
    return picked.map(({axis,value})=>({axis,title:axisNames[axis]+'复盘',observation:`${scored.length} 场可评分记录中，${axisNames[axis]}平均位于同模式同英雄定位参照的第 ${value.toFixed(1)} 百分位。`,question:adviceText[axis][0]+'？',action:adviceText[axis][1],evidence:scored.toSorted((a,b)=>a.player.percentiles[axis]-b.player.percentiles[axis]).slice(0,3).map(r=>r.match.id),sample:scored.length}));
  }
  const api={VERSION,classes,modes,axes,axisNames,weights,finite,mean,day,bounds,classify,identity,percentile,buildDataset,select,rowsFor,summarize,advice};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LolAnalytics=api;
})(globalThis);
