// Independent gameplay controller. It deliberately does not depend on private variables
// inside app.js, so the training button remains usable even if the tracking module changes.
const btn = document.querySelector('#gameBtn');
const game = document.querySelector('#game');
const notes = document.querySelector('#notes');
const video = document.querySelector('#video');
const status = document.querySelector('#status');
const scoreEl = document.querySelector('#score');
const comboEl = document.querySelector('#combo');

let active = false;
let score = 0;
let combo = 0;
let nextSpawn = 0;
const liveNotes = [];
const directions = ['up','down','left','right'];

function setButtonReady(){
  if (video?.srcObject) {
    btn.disabled = false;
    btn.removeAttribute('disabled');
  }
}

function makeNote(now){
  const color = Math.random() < 0.5 ? 'red' : 'blue';
  const dir = directions[Math.floor(Math.random()*directions.length)];
  const el = document.createElement('div');
  el.className = `note ${color} ${dir}`;
  el.innerHTML = `<span>${dir==='up'?'↑':dir==='down'?'↓':dir==='left'?'←':'→'}</span>`;
  notes.appendChild(el);
  liveNotes.push({el,color,dir,start:now,duration:1800,hit:false});
}

function tick(now){
  if (!active) return;
  if (now >= nextSpawn) {
    makeNote(now);
    nextSpawn = now + 650 + Math.random()*550;
  }
  for (let i=liveNotes.length-1;i>=0;i--) {
    const n=liveNotes[i];
    const p=(now-n.start)/n.duration;
    const z=Math.max(0,Math.min(1,p));
    const side=n.color==='red'?-24:24;
    const offset=n.dir==='left'?-7:n.dir==='right'?7:0;
    const vertical=n.dir==='up'?-8:n.dir==='down'?8:0;
    const scale=.28+z*1.08;
    n.el.style.transform=`translate3d(calc(-50% + ${side+offset}%),calc(-50% + ${vertical}%),0) scale(${scale})`;
    n.el.style.opacity=String(.35+z*.65);
    if(p>1.08){
      combo=0;
      comboEl.textContent='0';
      n.el.remove();
      liveNotes.splice(i,1);
    }
  }
  requestAnimationFrame(tick);
}

btn.disabled = false;
btn.removeAttribute('disabled');
btn.addEventListener('click',()=>{
  active=!active;
  if(active){
    score=0; combo=0; scoreEl.textContent='0'; comboEl.textContent='0';
    liveNotes.splice(0).forEach(n=>n.el.remove());
    game.classList.add('active');
    btn.textContent='Detener entrenamiento';
    status.textContent='Entrenamiento activo';
    nextSpawn=performance.now()+250;
    requestAnimationFrame(tick);
  } else {
    game.classList.remove('active');
    btn.textContent='Iniciar entrenamiento';
    status.textContent=video.srcObject?'Tracking activo':'Cámara detenida';
  }
});

setInterval(setButtonReady,250);
