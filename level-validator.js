#!/usr/bin/env node
/* =====================================================================
   SOOTHE QUEST — LEVEL VALIDATOR (bot solver)

   Modes:
     node level-validator.js [runs]        campaign + rift regression sweep
     node level-validator.js seeds [runs]  obstacle-seed pipeline: generate
                                           candidate seeds, simulate each,
                                           print the VALIDATED_SEEDS array
                                           to embed in soothe-quest.html

   The validator loads the REAL engine out of soothe-quest.html (no
   duplicated rules), stubs DOM/audio, and simulates playthroughs with
   two bots: greedy (best immediate clear ~ casual player) and smart
   (also values creating/detonating specials ~ experienced player).
   ===================================================================== */
'use strict';
const fs=require('fs');
const path=require('path');

const MODE=(process.argv[2]==='seeds')?'seeds':'sweep';
const RUNS=parseInt((MODE==='seeds'?process.argv[3]:process.argv[2])||(MODE==='seeds'?'20':'40'),10);
const MOVE_SECONDS=2.0;
const BAND=[0.60,0.90];
const SEED_BAND=[0.55,0.90];
const MAX_MOVES=200;

const html=fs.readFileSync(path.join(__dirname,'soothe-quest.html'),'utf8');
let js=html.match(/<script>([\s\S]*)<\/script>/)[1];
js=js.split('/* ---------- WIRING ---------- */')[0];
js=js.replace('const sleep=ms=>new Promise(r=>setTimeout(r,ms));',
              'const sleep=()=>Promise.resolve();');

const stubEl=()=>({style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},
  dataset:{},innerHTML:'',textContent:'',appendChild(){},remove(){},addEventListener(){},
  setAttribute(){},onclick:null,children:[],offsetWidth:0,clientWidth:400,clientHeight:400,
  querySelector:()=>null,_ice:null});
global.window={addEventListener(){}};
global.document={querySelector:()=>stubEl(),querySelectorAll:()=>[],
  createElement:()=>stubEl(),createElementNS:()=>stubEl()};
global.requestAnimationFrame=()=>{};
global.performance={now:()=>0};

const harness=`
;(async()=>{
for(const k of Object.keys(Snd)) if(typeof Snd[k]==='function') Snd[k]=()=>{};
toast=()=>{}; confetti=()=>{}; comboText=()=>{}; shakeApp=()=>{};
floatScore=()=>{}; burst=()=>{}; scheduleHint=()=>{}; hitEnemy=()=>{};
openModal=()=>{}; refreshHUD=()=>{}; buildMap=()=>{};
let lastWin=null;
const realEnd=endLevel;
endLevel=(w)=>{ lastWin=w; realEnd(w); };
state.lives=999999; state.plus=false;

function initSim(level){
  G.level=level;
  G.types=(level.types!=null)?level.types:((level.w>=4&&level.type==='battle')?6:5);
  G.score=0; G.over=false; G.busy=false; G.sel=null; G.armed=null;
  G.moves=level.goal.moves||0; G.hp=level.goal.hp||0; G.time=level.goal.time||0;
  G.cell=40; G.timer=null; G.lastSwap=null; lastWin=null;
  buildBoard();
}

function candidates(smart){
  const list=[];
  const colorCount=t=>{let n=0;for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(G.grid[r][c]===t)n++;return n;};
  const nearObst=(r,c)=>{let n=0;
    if(G.ice[r]&&G.ice[r][c]>0)n++;
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+d[0],cc=c+d[1];
      if(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&G.grid[rr][cc]===-2)n++;}
    return n;};
  const evalSwap=(r1,c1,r2,c2)=>{
    if(!movable(r1,c1)||!movable(r2,c2))return;
    const s1=G.spec[r1][c1], s2=G.spec[r2][c2];
    let v=-1;
    if(s1&&s2){
      if(s1==='rain'&&s2==='rain') v=64;
      else if(s1==='rain'||s2==='rain') v=(smart?45:30);
      else if(s1==='bomb'&&s2==='bomb') v=25;
      else if(s1==='bomb'||s2==='bomb') v=(smart?34:20);
      else v=15;
    }else if(s1==='rain'||s2==='rain'){
      const t=(s1==='rain')?G.grid[r2][c2]:G.grid[r1][c1];
      v=colorCount(t);
    }else{
      const a=G.grid[r1][c1]; G.grid[r1][c1]=G.grid[r2][c2]; G.grid[r2][c2]=a;
      const runs=findRuns();
      if(runs.cells.size>0){
        v=runs.cells.size;
        if(G.level.goal&&G.level.goal.obstacles){
          for(const k of runs.cells) v+=4*nearObst(Math.floor(k/SIZE),k%SIZE);
        }
        if(smart){
          for(const sp of runs.spawns) v+=(sp.kind==='rain'?14:sp.kind==='bomb'?9:7);
          for(const k of runs.cells){ const rr=Math.floor(k/SIZE),cc=k%SIZE;
            if(G.spec[rr][cc]) v+=10; }
        }
      }
      G.grid[r2][c2]=G.grid[r1][c1]; G.grid[r1][c1]=a;
    }
    if(v>0) list.push({r1,c1,r2,c2,v});
  };
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    if(c<SIZE-1) evalSwap(r,c,r,c+1);
    if(r<SIZE-1) evalSwap(r,c,r+1,c);
  }
  list.sort((a,b)=>b.v-a.v);
  return list;
}

async function playOne(level,smart){
  initSim(level);
  const battle=level.type==='battle';
  let simTime=battle?level.goal.time:0, guard=0, stalls=0;
  while(!G.over&&guard++<MAX_MOVES){
    const cs=candidates(smart);
    if(!cs.length){ if(++stalls>4){G.over=true;lastWin=false;break;} shuffleBoard(false); continue; }
    stalls=0;
    const pick=cs[(Math.random()<0.8||cs.length===1)?0:1];
    await trySwap(pick.r1,pick.c1,pick.r2,pick.c2);
    if(battle&&!G.over){
      simTime-=MOVE_SECONDS;
      if(simTime<=0){ G.over=true; lastWin=false; }
    }
  }
  return {win:lastWin===true, score:G.score};
}

async function validate(level,smart){
  let wins=0; const scores=[];
  for(let i=0;i<${RUNS};i++){
    const r=await playOne(level,smart);
    if(r.win)wins++;
    scores.push(r.score);
  }
  scores.sort((a,b)=>a-b);
  return {wr:wins/${RUNS}, med:scores[Math.floor(scores.length/2)]};
}
function pad(s,n){s=String(s);return s+' '.repeat(Math.max(1,n-s.length));}

if('${MODE}'==='seeds'){
  /* ============ SEED PIPELINE ============
     generate candidates -> simulate -> keep only in-band seeds */
  console.log('OBSTACLE SEED PIPELINE — '+${RUNS}+' smart-bot games per candidate seed');
  console.log('keep band: '+(${SEED_BAND[0]}*100)+'-'+(${SEED_BAND[1]}*100)+'% win rate');
  const kept=[];
  const diffs=[2,4,6,8];
  for(const diff of diffs){
    const moves=20+2*Math.floor(diff/2);
    for(let seed=diff*100+1; seed<=diff*100+12; seed++){
      const lv={id:'seedtest',rift:true,w:3,types:5,type:'challenge',obstacle:true,
        lbl:'seed '+seed,seed,diff,goal:{obstacles:true,moves}};
      const v=await validate(lv,true);
      const ok=v.wr>=${SEED_BAND[0]}&&v.wr<=${SEED_BAND[1]};
      console.log(pad('seed '+seed,12)+pad('diff '+diff,9)+pad(moves+'mv',7)+pad(Math.round(v.wr*100)+'%',7)+(ok?'KEEP':'discard'));
      if(ok) kept.push({seed,diff,moves,wr:Math.round(v.wr*100)});
    }
  }
  console.log('');
  console.log('kept '+kept.length+' seeds. Paste into soothe-quest.html:');
  console.log('const VALIDATED_SEEDS='+JSON.stringify(kept)+';');
}else{
  /* ============ REGRESSION SWEEP ============ */
  const ids=['n1','n4','n6','n12','n16','n17','n23','n26','n31','n35','n40','n44','n49','n53'];
  const sample=ids.map(id=>nodeById(id));
  state.riftLevel=0; sample.push(genRiftLevel());
  state.riftLevel=5; sample.push(genRiftLevel());
  state.riftLevel=9; sample.push(genRiftLevel());
  console.log('SOOTHE QUEST LEVEL VALIDATOR — '+${RUNS}+' runs per level per bot');
  console.log('band: smart-bot win rate '+(${BAND[0]}*100)+'-'+(${BAND[1]}*100)+'%  (casual comfort)');
  console.log('');
  console.log(pad('level',26)+pad('type',10)+pad('goal',16)+pad('greedy',9)+pad('smart',9)+pad('med.score',11)+'verdict');
  console.log('-'.repeat(92));
  for(const lv of sample){
    const g=await validate(lv,false);
    const s=await validate(lv,true);
    const goal=lv.type==='battle'?(lv.goal.hp+'hp/'+lv.goal.time+'s')
      :(lv.goal.obstacles?('blocks/'+lv.goal.moves+'mv'):(lv.goal.score+'/'+lv.goal.moves+'mv'));
    let verdict='PASS';
    if(s.wr<${BAND[0]}) verdict='TOO HARD';
    else if(s.wr>${BAND[1]}&&g.wr>${BAND[1]}) verdict='very easy (fine for early game)';
    console.log(pad(lv.lbl,26)+pad(lv.type,10)+pad(goal,16)+pad(Math.round(g.wr*100)+'%',9)+pad(Math.round(s.wr*100)+'%',9)+pad(s.med,11)+verdict);
  }
  console.log('');
  console.log('done.');
}
})().catch(e=>{console.error(e);process.exit(1)});
`;
eval(js+harness);
