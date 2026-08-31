import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const video=document.querySelector('#video');
const canvas=document.querySelector('#overlay');
const ctx=canvas.getContext('2d',{alpha:true});
const stage=document.querySelector('#stage');
const startBtn=document.querySelector('#startBtn');
const gameBtn=document.querySelector('#gameBtn');
const statusEl=document.querySelector('#status');
const mirrorEl=document.querySelector('#mirror');
const drawPoseEl=document.querySelector('#drawPose');
const predictionEl=document.querySelector('#predictionMs');
const predictionValue=document.querySelector('#predictionValue');
const smoothingEl=document.querySelector('#smoothing');
const smoothingValue=document.querySelector('#smoothingValue');
const notesEl=document.querySelector('#notes');
const gameEl=document.querySelector('#game');

const HAND_CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE_CONNECTIONS=[[0,11],[0,12],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

class OneEuro{
  constructor(m=1.2,b=.75,d=1){this.m=m;this.b=b;this.d=d;this.x=null;this.dx=0;this.t=null}
  a(c,dt){const tau=1/(2*Math.PI*c);return 1/(1+tau/Math.max(dt,1/240))}
  filter(v,t){if(this.x===null){this.x=v;this.t=t;return v}const dt=Math.max((t-this.t)/1000,1/240);const raw=(v-this.x)/dt;const ad=this.a(this.d,dt);this.dx+=ad*(raw-this.dx);this.x+=this.a(this.m+this.b*Math.abs(this.dx),dt)*(v-this.x);this.t=t;return this.x}
}
const fs=n=>Array.from({length:n},()=>({x:new OneEuro(),y:new OneEuro(),z:new OneEuro()}));

const hands={
  left:{filters:fs(21),last:null,velocity:Array.from({length:21},()=>({x:0,y:0,z:0})),lostAt:0,lastTime:0,trackWrist:null,trackVelocity:{x:0,y:0},trackTime:0,initialized:false,history:[]},
  right:{filters:fs(21),last:null,velocity:Array.from({length:21},()=>({x:0,y:0,z:0})),lostAt:0,lastTime:0,trackWrist:null,trackVelocity:{x:0,y:0},trackTime:0,initialized:false,history:[]}
};

const poseFilters=fs(33);
let poseLast=null,handLandmarker=null,poseLandmarker=null,running=false,processing=false,lastVideoTime=-1,poseTick=0,fpsFrames=0,fpsTimer=performance.now();
const identity={labelConflictStreak:0,labelConflictSide:null};
const text=(id,v)=>{const e=document.querySelector(id);if(e)e.textContent=v};
function resize(){if(video.videoWidth&&video.videoHeight&&(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight)){canvas.width=video.videoWidth;canvas.height=video.videoHeight}}
function mirror(){stage.classList.toggle('mirrored',mirrorEl.checked)}
function wrist(l){return l?.[0]?{x:l[0].x,y:l[0].y}:null}
function distance(a,b){return a&&b?Math.hypot(a.x-b.x,a.y-b.y):999}
function predicted(t,now){if(!t.initialized||!t.trackWrist)return null;const configured=Number(predictionEl.value);const windowMs=Math.max(configured,220);const dt=Math.min(Math.max((now-t.trackTime)/1000,0),windowMs/1000);return{x:Math.max(0,Math.min(1,t.trackWrist.x+t.trackVelocity.x*dt)),y:Math.max(0,Math.min(1,t.trackWrist.y+t.trackVelocity.y*dt))}}

function updateTrack(t,lm,now){
  const w=wrist(lm); if(!w)return;
  if(t.trackWrist&&t.trackTime){const dt=Math.max((now-t.trackTime)/1000,1/240);const vx=(w.x-t.trackWrist.x)/dt,vy=(w.y-t.trackWrist.y)/dt;t.trackVelocity.x=t.trackVelocity.x*.35+vx*.65;t.trackVelocity.y=t.trackVelocity.y*.35+vy*.65}
  t.trackWrist=w;t.trackTime=now;t.initialized=true;t.lostAt=now;t.history.push({x:w.x,y:w.y,t:now});t.history=t.history.filter(p=>p.t>=now-260);
}
function labelOf(x){const c=x?.[0]?.categoryName;return c==='Left'||c==='Right'?c:null}
function assignHands(detections,labels,now){
  const c=detections.map((lm,i)=>({lm,w:wrist(lm),cat:labelOf(labels[i])})).filter(x=>x.w);
  if(!c.length)return{left:null,right:null};
  const L=hands.left,R=hands.right;
  if(!L.initialized&&!R.initialized){
    if(c.length===1){if(c[0].cat==='Right')return{left:null,right:c[0].lm};return{left:c[0].lm,right:null}}
    const left=c.find(x=>x.cat==='Left'),right=c.find(x=>x.cat==='Right');
    if(left&&right)return{left:left.lm,right:right.lm};
    return c[0].w.x<=c[1].w.x?{left:c[0].lm,right:c[1].lm}:{left:c[1].lm,right:c[0].lm};
  }
  if(c.length===1){
    const q=c[0],lp=predicted(L,now),rp=predicted(R,now),dl=distance(q.w,lp),dr=distance(q.w,rp);
    // When one hand disappears, temporal continuity has priority over a transient
    // MediaPipe handedness flip. The label is only used when there is no trajectory.
    if(lp||rp){
      const margin=.10;
      if(dl+margin<dr)return{left:q.lm,right:null};
      if(dr+margin<dl)return{left:null,right:q.lm};
    }
    if(q.cat==='Left'&&L.initialized)return{left:q.lm,right:null};
    if(q.cat==='Right'&&R.initialized)return{left:null,right:q.lm};
    return dl<=dr?{left:q.lm,right:null}:{left:null,right:q.lm};
  }
  const a=c[0],b=c[1];
  const lp=predicted(L,now)||a.w,rp=predicted(R,now)||b;
  const positionAssignment=distance(a.w,lp)+distance(b.w,rp)<=distance(b.w,lp)+distance(a.w,rp)?'ab':'ba';
  const leftByLabel=a.cat==='Left'?a:b.cat==='Left'?b:null;
  const rightByLabel=a.cat==='Right'?a:b.cat==='Right'?b:null;
  if(!leftByLabel||!rightByLabel)return positionAssignment==='ab'?{left:a.lm,right:b.lm}:{left:b.lm,right:a.lm};
  const labelCost=distance(leftByLabel.w,lp)+distance(rightByLabel.w,rp);
  const positionCost=positionAssignment==='ab'?distance(a.w,lp)+distance(b.w,rp):distance(b.w,lp)+distance(a.w,rp);
  const conflict=labelCost>positionCost+.14;
  if(conflict){const side=leftByLabel===a?'a':'b';if(identity.labelConflictSide===side)identity.labelConflictStreak++;else{identity.labelConflictSide=side;identity.labelConflictStreak=1}}else{identity.labelConflictStreak=0;identity.labelConflictSide=null}
  if(conflict&&identity.labelConflictStreak<5)return positionAssignment==='ab'?{left:a.lm,right:b.lm}:{left:b.lm,right:a.lm};
  return{left:leftByLabel.lm,right:rightByLabel.lm};
}
function filterHand(h,lm,now){
  const s=Number(smoothingEl.value);const p=lm.map((q,i)=>({x:h.filters[i].x.filter(q.x,now),y:h.filters[i].y.filter(q.y,now),z:h.filters[i].z.filter(q.z??0,now)}));
  if(h.last&&h.lastTime){const dt=Math.max((now-h.lastTime)/1000,1/240);for(let i=0;i<p.length;i++){h.velocity[i].x=(p[i].x-h.last[i].x)/dt;h.velocity[i].y=(p[i].y-h.last[i].y)/dt;h.velocity[i].z=(p[i].z-h.last[i].z)/dt;if(s&&Math.hypot(h.velocity[i].x,h.velocity[i].y)>1){const k=Math.min(1,s*1.8);p[i].x=h.last[i].x+(p[i].x-h.last[i].x)*k;p[i].y=h.last[i].y+(p[i].y-h.last[i].y)*k}}}
  h.last=p;h.lastTime=now;h.lostAt=now;return p;
}
function predictPoints(h,now){
  if(!h.last)return null;
  const age=now-h.lostAt,configured=Number(predictionEl.value),max=Math.max(configured,220);
  if(age>max)return null;
  const dt=age/1000,decay=Math.pow(Math.max(0,1-age/max),1.15);
  return h.last.map((p,i)=>({x:Math.max(0,Math.min(1,p.x+h.velocity[i].x*dt*decay)),y:Math.max(0,Math.min(1,p.y+h.velocity[i].y*dt*decay)),z:p.z+h.velocity[i].z*dt*decay}));
}
function state(h,lm,now){return lm?filterHand(h,lm,now):predictPoints(h,now)}
function point(p,r=3){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,r,0,Math.PI*2);ctx.fill()}
function links(p,c){ctx.beginPath();for(const[a,b]of c){if(p[a]&&p[b]){ctx.moveTo(p[a].x*canvas.width,p[a].y*canvas.height);ctx.lineTo(p[b].x*canvas.width,p[b].y*canvas.height)}}ctx.stroke()}
function saber(p,label){if(!p)return;const w=p[0],q={x:(p[8].x+p[12].x)/2,y:(p[8].y+p[12].y)/2},dx=q.x-w.x,dy=q.y-w.y,len=Math.hypot(dx,dy)||1,e={x:w.x+dx/len*.18,y:w.y+dy/len*.18};ctx.save();ctx.lineCap='round';ctx.lineWidth=11;ctx.strokeStyle=label==='left'?'#ff214d':'#2677ff';ctx.shadowBlur=20;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(w.x*canvas.width,w.y*canvas.height);ctx.lineTo(e.x*canvas.width,e.y*canvas.height);ctx.stroke();ctx.restore()}
function human(p){if(!p||p.length<29)return false;const r=[0,11,12,23,24,25,26,27,28],v=r.filter(i=>p[i]&&(p[i].visibility??1)>.35).length;if(v<7)return false;const n=p[0],ls=p[11],rs=p[12],lh=p[23],rh=p[24],sw=Math.hypot(ls.x-rs.x,ls.y-rs.y),hw=Math.hypot(lh.x-rh.x,lh.y-rh.y),torso=Math.hypot((ls.x+rs.x)/2-(lh.x+rh.x)/2,(ls.y+rs.y)/2-(lh.y+rh.y)/2),ll=Math.hypot(p[25].x-p[27].x,p[25].y-p[27].y),rl=Math.hypot(p[26].x-p[28].x,p[26].y-p[28].y);if(sw<.045||hw<.025||torso<.06||n.y>(ls.y+rs.y)/2+.08||lh.y<(ls.y+rs.y)/2-.05||rh.y<(ls.y+rs.y)/2-.05||ll<.06||rl<.06)return false;return hw/sw>.25&&hw/sw<1.35}
function smoothPose(raw,now){if(!raw)return poseLast;return poseLast=raw.map((p,i)=>({x:poseFilters[i].x.filter(p.x,now),y:poseFilters[i].y.filter(p.y,now),z:poseFilters[i].z.filter(p.z??0,now),visibility:p.visibility??1}))}
async function loadModels(){const f=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');handLandmarker=await HandLandmarker.createFromOptions(f,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.2,minHandPresenceConfidence:.2,minTrackingConfidence:.2});poseLandmarker=await PoseLandmarker.createFromOptions(f,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.25,minPosePresenceConfidence:.25,minTrackingConfidence:.25})}
const DIRS=['up','down','left','right'];
const game={running:false,notes:[],lastSpawn:0,spawnEvery:1800,score:0,combo:0};
function swing(h){const now=performance.now(),r=h.history.filter(p=>now-p.t<=150);if(r.length<2)return null;const a=r[0],b=r[r.length-1],dt=Math.max((b.t-a.t)/1000,.001),dx=b.x-a.x,dy=b.y-a.y,s=Math.hypot(dx,dy)/dt;if(s<.65)return null;if(Math.abs(dx)>Math.abs(dy)*1.18)return dx>0?'right':'left';return dy>0?'down':'up'}
function spawn(now){const color=Math.random()<.5?'red':'blue',dir=DIRS[Math.floor(Math.random()*DIRS.length)],el=document.createElement('div');el.className=`note ${color} ${dir}`;el.innerHTML=`<span>${dir==='up'?'↑':dir==='down'?'↓':dir==='left'?'←':'→'}</span>`;notesEl.appendChild(el);game.notes.push({color,dir,created:now,duration:1900,el,hit:false})}
function renderNote(n,p){const z=Math.max(0,Math.min(1,p)),scale=.28+z*1.05,side=n.color==='red'?-24:24,vert=n.dir==='up'?-8:n.dir==='down'?8:0,extra=n.dir==='left'?-7:n.dir==='right'?7:0;n.el.style.transform=`translate3d(calc(-50% + ${side+extra}%),calc(-50% + ${vert}%),0) scale(${scale})`;n.el.style.opacity=.35+z*.65}
function hit(n){const h=n.color==='red'?hands.left:hands.right,d=swing(h),w=h.trackWrist;if(!d||d!==n.dir||!w)return false;return Math.hypot(w.x-(n.color==='red'?.30:.70),w.y-.50)<.30}
function removeNote(n){n.el.remove();game.notes=game.notes.filter(x=>x!==n)}
function gameTick(now){if(!game.running)return;if(game.notes.length===0&&now-game.lastSpawn>game.spawnEvery){spawn(now);game.lastSpawn=now}for(const n of [...game.notes]){const p=(now-n.created)/n.duration;renderNote(n,p);if(!n.hit&&p>.78&&p<1.02&&hit(n)){n.hit=true;game.score+=100+game.combo*10;game.combo++;text('#score',game.score);text('#combo',game.combo);n.el.classList.add('hit');setTimeout(()=>removeNote(n),90)}if(p>=1.08&&!n.hit){game.combo=0;text('#combo',0);n.el.classList.add('miss');setTimeout(()=>removeNote(n),120)}}requestAnimationFrame(gameTick)}
function startGame(){if(!running)return;game.running=!game.running;if(game.running){game.notes.forEach(n=>n.el.remove());game.notes=[];game.score=0;game.combo=0;game.lastSpawn=performance.now()-game.spawnEvery;gameEl.classList.add('active');gameBtn.textContent='Detener entrenamiento';statusEl.textContent='Entrenamiento activo';requestAnimationFrame(gameTick)}else{gameEl.classList.remove('active');gameBtn.textContent='Iniciar entrenamiento';statusEl.textContent='Tracking activo'}}
function frame(now){
  if(!running||video.readyState<2||processing){if(running)requestAnimationFrame(frame);return}
  if(video.currentTime===lastVideoTime){requestAnimationFrame(frame);return}
  lastVideoTime=video.currentTime;processing=true;resize();ctx.clearRect(0,0,canvas.width,canvas.height);
  let hr={landmarks:[],handedness:[]};try{hr=handLandmarker.detectForVideo(video,now)}catch(e){console.warn(e)}
  const a=assignHands(hr.landmarks||[],hr.handedness||[],now),lr=a.left,rr=a.right;if(lr)updateTrack(hands.left,lr,now);if(rr)updateTrack(hands.right,rr,now);
  const left=state(hands.left,lr,now),right=state(hands.right,rr,now);
  let pose=poseLast;poseTick++;if(poseTick%4===0){try{const pr=poseLandmarker.detectForVideo(video,now),c=pr.landmarks?.find(human)||null;pose=c?smoothPose(c,now):poseLast}catch(e){console.warn(e)}}
  text('#leftState',lr?'Detectada':left?'Predicha':'Perdida');text('#rightState',rr?'Detectada':right?'Predicha':'Perdida');text('#poseState',pose?'Detectado':'—');text('#humanState',pose?'Sí':'No');
  if(drawPoseEl.checked&&pose){ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#ffffffaa';links(pose,POSE_CONNECTIONS);ctx.restore()}
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle='#ffffffaa';ctx.fillStyle='#fff';if(left){links(left,HAND_CONNECTIONS);left.forEach(p=>point(p,2.4));saber(left,'left')}if(right){links(right,HAND_CONNECTIONS);right.forEach(p=>point(p,2.4));saber(right,'right')}ctx.restore();
  fpsFrames++;if(now-fpsTimer>=500){text('#fps',String(Math.round(fpsFrames*1000/(now-fpsTimer))));fpsFrames=0;fpsTimer=now}processing=false;requestAnimationFrame(frame);
}
async function start(){startBtn.disabled=true;statusEl.textContent='Cargando modelos…';try{if(!handLandmarker||!poseLandmarker)await loadModels();const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960,max:1280},height:{ideal:540,max:720},frameRate:{ideal:60,min:30}},audio:false});video.srcObject=stream;await video.play();resize();mirror();running=true;statusEl.textContent='Tracking activo';text('#phoneState','Listo para WebSocket');gameBtn.disabled=false;startBtn.textContent='Cámara activa';requestAnimationFrame(frame)}catch(e){console.error(e);statusEl.textContent=`Error: ${e?.message||e}`;startBtn.disabled=false}}
predictionEl.addEventListener('input',()=>predictionValue.textContent=`${predictionEl.value} ms`);smoothingEl.addEventListener('input',()=>smoothingValue.textContent=Number(smoothingEl.value).toFixed(2));mirrorEl.addEventListener('change',mirror);startBtn.addEventListener('click',start);gameBtn.addEventListener('click',startGame);mirror();