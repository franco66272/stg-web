import { HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';

const originalDetect = HandLandmarker.prototype.detectForVideo;
const state = { initialized:false, left:null, right:null, leftV:{x:0,y:0}, rightV:{x:0,y:0}, lastTime:0 };
const wrist = lm => lm?.[0] ? {x:lm[0].x,y:lm[0].y} : null;
const dist = (a,b) => a&&b ? Math.hypot(a.x-b.x,a.y-b.y) : 999;
const label = x => x?.[0]?.categoryName;

HandLandmarker.prototype.detectForVideo = function(video,timestamp){
  const result = originalDetect.call(this,video,timestamp);
  const d=result?.landmarks||[], h=result?.handedness||[];
  if(d.length!==2||h.length!==2)return result;
  const a=wrist(d[0]),b=wrist(d[1]);
  if(!a||!b)return result;
  const ca=label(h[0]),cb=label(h[1]);
  if(!((ca==='Left'&&cb==='Right')||(ca==='Right'&&cb==='Left')))return result;

  if(!state.initialized){
    state.left=ca==='Left'?a:b;
    state.right=ca==='Right'?a:b;
    state.lastTime=timestamp;
    state.initialized=true;
    return result;
  }

  const dt=Math.min(Math.max((timestamp-state.lastTime)/1000,1/240),.08);
  const lp={x:state.left.x+state.leftV.x*dt,y:state.left.y+state.leftV.y*dt};
  const rp={x:state.right.x+state.rightV.x*dt,y:state.right.y+state.rightV.y*dt};

  const labelCost=(ca==='Left'?dist(a,lp):dist(a,rp))+(cb==='Right'?dist(b,rp):dist(b,lp));
  const swappedCost=(ca==='Left'?dist(a,rp):dist(a,lp))+(cb==='Right'?dist(b,lp):dist(b,rp));

  // Correct only a handedness-label flip. Never swap the landmark arrays.
  // This keeps the physical hand identity continuous through fast simultaneous motion.
  if(swappedCost+.055<labelCost){const tmp=h[0];h[0]=h[1];h[1]=tmp;}

  const li=label(h[0])==='Left'?0:1;
  const ri=1-li;
  const nl=wrist(d[li]),nr=wrist(d[ri]);
  const lvx=(nl.x-state.left.x)/dt,lvy=(nl.y-state.left.y)/dt;
  const rvx=(nr.x-state.right.x)/dt,rvy=(nr.y-state.right.y)/dt;
  state.leftV.x=state.leftV.x*.35+lvx*.65;
  state.leftV.y=state.leftV.y*.35+lvy*.65;
  state.rightV.x=state.rightV.x*.35+rvx*.65;
  state.rightV.y=state.rightV.y*.35+rvy*.65;
  state.left=nl;state.right=nr;state.lastTime=timestamp;
  return result;
};
