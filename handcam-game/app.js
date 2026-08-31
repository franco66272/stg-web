import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const video = document.querySelector('#video');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const startBtn = document.querySelector('#startBtn');
const statusEl = document.querySelector('#status');
const mirrorEl = document.querySelector('#mirror');
const drawPoseEl = document.querySelector('#drawPose');
const predictionEl = document.querySelector('#predictionMs');
const predictionValue = document.querySelector('#predictionValue');
const smoothingEl = document.querySelector('#smoothing');
const smoothingValue = document.querySelector('#smoothingValue');

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE_CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];

const hands = {
  left: { last:null, velocity:{x:0,y:0}, lostAt:0, lastTime:0 },
  right:{ last:null, velocity:{x:0,y:0}, lostAt:0, lastTime:0 }
};
let running=false, fps=0, frames=0, fpsTimer=performance.now();
let handLandmarker=null, poseLandmarker=null;

function mirrorX(x){ return mirrorEl.checked ? 1-x : x; }
function resizeCanvas(){
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width=video.videoWidth;
  canvas.height=video.videoHeight;
}
window.addEventListener('resize', resizeCanvas);

function drawPoint(p, r=4){ ctx.beginPath(); ctx.arc(p.x*canvas.width,p.y*canvas.height,r,0,Math.PI*2); ctx.fill(); }
function drawConnections(points, connections){
  ctx.beginPath();
  for(const [a,b] of connections){
    if(!points[a] || !points[b]) continue;
    ctx.moveTo(points[a].x*canvas.width,points[a].y*canvas.height);
    ctx.lineTo(points[b].x*canvas.width,points[b].y*canvas.height);
  }
  ctx.stroke();
}
function normalizedPoints(points){ return points.map(p=>({x:mirrorX(p.x), y:p.y, z:p.z ?? 0, visibility:p.visibility})); }

function handState(hand, landmarks, now){
  if(!landmarks){
    if(!hand.last) return null;
    const age=now-hand.lostAt;
    const max=Number(predictionEl.value);
    if(age>max) return null;
    const dt=age/1000;
    const decay=Math.max(0,1-age/max);
    return hand.last.map(p=>({x:p.x+hand.velocity.x*dt*decay,y:p.y+hand.velocity.y*dt*decay,z:p.z}));
  }

  const pts=normalizedPoints(landmarks);
  if(hand.last){
    const dt=Math.max(0.001,(now-hand.lastTime)/1000);
    const rawVx=(pts[0].x-hand.last[0].x)/dt;
    const rawVy=(pts[0].y-hand.last[0].y)/dt;
    hand.velocity={x:hand.velocity.x*0.35+rawVx*0.65,y:hand.velocity.y*0.35+rawVy*0.65};
    const alpha=Number(smoothingEl.value);
    for(let i=0;i<pts.length;i++){
      pts[i]={x:hand.last[i].x+(pts[i].x-hand.last[i].x)*alpha,y:hand.last[i].y+(pts[i].y-hand.last[i].y)*alpha,z:pts[i].z};
    }
  }
  hand.last=pts;
  hand.lastTime=now;
  hand.lostAt=now;
  return pts;
}

function drawSaber(points, label){
  if(!points) return;
  const wrist=points[0], index=points[8], middle=points[12];
  const tip={x:(index.x+middle.x)/2,y:(index.y+middle.y)/2};
  const dx=tip.x-wrist.x, dy=tip.y-wrist.y, len=Math.hypot(dx,dy)||1;
  const ux=dx/len, uy=dy/len;
  const bladeLen=0.18;
  const end={x:wrist.x+ux*bladeLen,y:wrist.y+uy*bladeLen};
  ctx.save();
  ctx.lineCap='round';
  ctx.lineWidth=10;
  ctx.strokeStyle=label==='left' ? '#ff214d':'#2677ff';
  ctx.shadowBlur=18;
  ctx.shadowColor=ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(wrist.x*canvas.width,wrist.y*canvas.height);
  ctx.lineTo(end.x*canvas.width,end.y*canvas.height);
  ctx.stroke();
  ctx.restore();
}

function classifyHuman(pose){
  if(!pose || !pose.length) return false;
  const required=[11,12,23,24];
  const visible=required.filter(i=>pose[i] && (pose[i].visibility ?? 1)>0.35).length;
  if(visible<3) return false;
  const shoulder=Math.hypot(pose[11].x-pose[12].x,pose[11].y-pose[12].y);
  const hip=Math.hypot(pose[23].x-pose[24].x,pose[23].y-pose[24].y);
  return shoulder>0.04 && hip>0.025;
}

function setText(id,text){ const el=document.querySelector(id); if(el) el.textContent=text; }

async function loadModels(){
  statusEl.textContent='Cargando MediaPipe local…';
  const fileset=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  handLandmarker=await HandLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:0.3,minHandPresenceConfidence:0.3,minTrackingConfidence:0.3});
  poseLandmarker=await PoseLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:0.3,minPosePresenceConfidence:0.3,minTrackingConfidence:0.3});
}

function loop(now){
  if(!running) return;
  if(video.readyState>=2){
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const hr=handLandmarker.detectForVideo(video,now);
    const pr=poseLandmarker.detectForVideo(video,now);
    const detectedHands=hr.landmarks||[];
    const handed=hr.handedness||[];
    let leftRaw=null,rightRaw=null;
    detectedHands.forEach((lm,i)=>{
      const side=handed[i]?.[0]?.categoryName;
      if(side==='Left') leftRaw=lm;
      if(side==='Right') rightRaw=lm;
    });
    const left=handState(hands.left,leftRaw,now);
    const right=handState(hands.right,rightRaw,now);
    if(leftRaw) hands.left.lostAt=now; else if(!hands.left.lostAt) hands.left.lostAt=now;
    if(rightRaw) hands.right.lostAt=now; else if(!hands.right.lostAt) hands.right.lostAt=now;
    const pose=pr.landmarks?.find(classifyHuman)||null;
    setText('#leftState',leftRaw?'Detectada':left?'Predicha':'Perdida');
    setText('#rightState',rightRaw?'Detectada':right?'Predicha':'Perdida');
    setText('#poseState',pose?'Detectado':'—');
    setText('#humanState',pose?'Sí':'No');
    if(drawPoseEl.checked && pose){
      ctx.save();
      ctx.lineWidth=3;
      ctx.strokeStyle='#ffffffaa';
      drawConnections(normalizedPoints(pose),POSE_CONNECTIONS);
      ctx.restore();
    }
    ctx.save();
    ctx.lineWidth=2;
    ctx.strokeStyle='#ffffffaa';
    ctx.fillStyle='#fff';
    if(left){drawConnections(left,HAND_CONNECTIONS); left.forEach(p=>drawPoint(p,2.4)); drawSaber(left,'left');}
    if(right){drawConnections(right,HAND_CONNECTIONS); right.forEach(p=>drawPoint(p,2.4)); drawSaber(right,'right');}
    ctx.restore();
  }
  frames++;
  if(now-fpsTimer>=500){
    fps=Math.round(frames*1000/(now-fpsTimer));
    frames=0;
    fpsTimer=now;
    setText('#fps',String(fps));
  }
  requestAnimationFrame(loop);
}

async function start(){
  startBtn.disabled=true;
  statusEl.textContent='Inicializando…';
  try{
    if(!handLandmarker || !poseLandmarker) await loadModels();
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,min:30}},audio:false});
    video.srcObject=stream;
    await video.play();
    resizeCanvas();
    running=true;
    statusEl.textContent='Tracking activo';
    setText('#phoneState','Listo para WebSocket');
    requestAnimationFrame(loop);
    startBtn.textContent='Cámara activa';
  }catch(e){
    console.error(e);
    statusEl.textContent=`Error: ${e.message}`;
    startBtn.disabled=false;
  }
}

predictionEl.addEventListener('input',()=>predictionValue.textContent=`${predictionEl.value} ms`);
smoothingEl.addEventListener('input',()=>smoothingValue.textContent=smoothingEl.value);
startBtn.addEventListener('click',start);
