import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect,importData,atomic} from './collector.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export function safeJson(value){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
export async function render(dataset,state=null){
  const [html,css,core,ui]=await Promise.all([fs.readFile(path.join(here,'../assets/report.html'),'utf8'),fs.readFile(path.join(here,'../assets/report.css'),'utf8'),fs.readFile(path.join(here,'analytics.cjs'),'utf8'),fs.readFile(path.join(here,'../assets/report.js'),'utf8')]);
  return html.replace('/*REPORT_CSS*/',()=>css).replace('/*REPORT_CORE*/',()=>core).replace('/*REPORT_UI*/',()=>ui).replace('"REPORT_DATA"',()=>safeJson(dataset)).replace('"REPORT_STATE"',()=>safeJson(state));
}
async function main(){
  let input='';for await(const c of process.stdin)input+=c;const config=JSON.parse(input.replace(/^\uFEFF/,''));input='';
  if(!config.output)throw Error('缺少输出目录');config.output=path.resolve(config.output);
  const dataset=config.importDirectories?.length?await importData(config.importDirectories,{from:config.from,to:config.to}):await collect(config);
  if(!dataset.matches.length)throw Error('未获取到指定账号和日期内的有效对局，上次报告保持不变');
  const html=await render(dataset);await atomic(path.join(config.output,'dataset.json'),JSON.stringify(dataset));await atomic(path.join(config.output,'report.html'),html);
  console.log(`完成：${dataset.matches.length} 场，${dataset.scoring.referenceRange.from} 至 ${dataset.scoring.referenceRange.to}；未支持模式 ${dataset.coverage.unsupported} 场；详情失败 ${dataset.coverage.failures?.length||0}。`);
  console.log('REPORT_PATH='+path.join(config.output,'report.html'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('分析未完成：'+e.message);process.exitCode=1;});
