// Gameplay controller.
// This module owns the training button and the first hit-test prototype.
// It runs in capture phase so app.js cannot toggle a second game loop.
const gameButton=document.querySelector('#gameBtn');
const game=document.querySelector('#game');
const notes=document.querySelector('#notes');
const stage=document.querySelector('#stage');
const canvas=document.querySelector('#overlay');
const video=document.querySelector('#video');
const status=document.querySelector('#status');
const scoreEl=document.querySelector('#score');
const comboEl=document.querySelector('#combo');

let active=false,score=0,combo=0,nextSpawn=0;
const liveNotes=[];
const directions=['up','down','left','right'];

gameButton.disabled=false;
gameButton.removeAttribute('disabled');

// app.js also has an older gameplay listener. Capture + stopImmediatePropagation
// makes this controller the single owner of the training button.
gameButton.addEventListener('click',onGameButton,true);

function onGameButton(event){
  event.preventDefault();
  event.stopImmediatePropagation();
  active=!active;
  if(active){
    score=0;combo=0;scoreEl.textContent='0';comboEl.textContent='0';
    for(const n of liveNotes)n.el.remove();
    liveNotes.length=0;
    game.classList.add('active');
    gameButton.textContent='Detener entrenamiento';
    status.textContent='Entrenamiento activo';
    nextSpawn=performance.now()+250;
    requestAnimationFrame(tick);
  }else{
    game.classList.remove('active');
    gameButton.textContent='Iniciar entrenamiento';
    status.textContent=video?.srcObject?'Tracking activo':'Cámara detenida';
  }
}

function spawn(now){
  const color=Math.random()<.5?'red':'blue';
  const dir=directions[Math.floor(Math.random()*directions.length)];
  const el=document.createElement('div');
  el.className=`note ${color} ${dir}`;
  el.innerHTML=`<span>${dir==='up'?'↑':dir==='down'?'↓':dir==='left'?'←':'→'}</span>`;
  notes.appendChild(el);
  liveNotes.push({el,color,dir,start:now,duration:1800,hit:false});
}

function renderNote(n,p){
  const z=Math.max(0,Math.min(1,p));
  const side=n.color==='red'?-24:24;
  const horizontal=n.dir==='left'?-7:n.dir==='right'?7:0;
  const vertical=n.dir==='up'?-8:n.dir==='down'?8:0;
  const scale=.28+z*1.08;
  n.el.style.transform=`translate3d(calc(-50% + ${side+horizontal}%),calc(-50% + ${vertical}%),0) scale(${scale})`;
  n.el.style.opacity=String(.35+z*.65);
}

// The saber is rendered by app.js into #overlay. We use its actual red/blue
// pixels for the first collision test, so the note is cut when the matching
// colored saber reaches it. Direction is deliberately NOT required yet.
function saberTouchesNote(n){
  if(!canvas||!canvas.width||!canvas.height||!n.el)return false;
  const sr=stage.getBoundingClientRect(),nr=n.el.getBoundingClientRect();
  const cx=(nr.left+nr.right)/2,cy=(nr.top+nr.bottom)/2;
  let nx=(cx-sr.left)/sr.width,ny=(cy-sr.top)/sr.height;
  if(document.querySelector('#mirror')?.checked)nx=1-nx;
  const px=Math.round(nx*canvas.width),py=Math.round(ny*canvas.height);
  const radius=Math.max(24,Math.round((nr.width/sr.width)*canvas.width*.55));
  const x0=Math.max(0,px-radius),y0=Math.max(0,py-radius),x1=Math.min(canvas.width-1,px+radius),y1=Math.min(canvas.height-1,py+radius);
  const w=x1-x0+1,h=y1-y0+1;
  if(w<=0||h<=0)return false;
  let data;
  try{data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,w,h).data}catch(e){return false}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
    if(a<80)continue;
    if(n.color==='red'&&r>180&&r>g*1.8&&r>b*1.25)return true;
    if(n.color==='blue'&&b>150&&b>r*1.25&&b>g*1.05)return true;
  }
  return false;
}

function tick(now){
  if(!active)return;
  if(liveNotes.length===0&&now>=nextSpawn){spawn(now);nextSpawn=now+900+Math.random()*500}
  for(let i=liveNotes.length-1;i>=0;i--){
    const n=liveNotes[i];
    const p=(now-n.start)/n.duration;
    renderNote(n,p);
    // Collision window is deliberately generous for this first playable test.
    if(!n.hit&&p>.70&&p<1.05&&saberTouchesNote(n)){
      n.hit=true;
      score+=100+combo*10;combo++;
      scoreEl.textContent=String(score);comboEl.textContent=String(combo);
      n.el.classList.add('hit');
      setTimeout(()=>{n.el.remove();const k=liveNotes.indexOf(n);if(k>=0)liveNotes.splice(k,1)},90);
    }
    if(p>=1.08&&!n.hit){
      combo=0;comboEl.textContent='0';n.el.classList.add('miss');
      setTimeout(()=>{n.el.remove();const k=liveNotes.indexOf(n);if(k>=0)liveNotes.splice(k,1)},120);
    }
  }
  requestAnimationFrame(tick);
}
