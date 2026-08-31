// Gameplay bootstrap kept independent from the tracking module.
// It guarantees that the training button is clickable and provides the first
// note-spawning loop without relying on private variables from app.js.
const gameButton = document.querySelector('#gameBtn');
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

// Never leave this button disabled. Camera readiness is not required to start
// the visual training arena, and tracking can continue independently.
gameButton.disabled = false;
gameButton.removeAttribute('disabled');

gameButton.addEventListener('click', () => {
  active = !active;

  if (active) {
    score = 0;
    combo = 0;
    scoreEl.textContent = '0';
    comboEl.textContent = '0';

    for (const n of liveNotes) n.el.remove();
    liveNotes.length = 0;

    game.classList.add('active');
    gameButton.textContent = 'Detener entrenamiento';
    status.textContent = 'Entrenamiento activo';
    nextSpawn = performance.now() + 250;
    requestAnimationFrame(tick);
  } else {
    game.classList.remove('active');
    gameButton.textContent = 'Iniciar entrenamiento';
    status.textContent = video?.srcObject ? 'Tracking activo' : 'Cámara detenida';
  }
});

function spawn(now) {
  const color = Math.random() < 0.5 ? 'red' : 'blue';
  const dir = directions[Math.floor(Math.random() * directions.length)];
  const el = document.createElement('div');
  el.className = `note ${color} ${dir}`;
  el.innerHTML = `<span>${dir === 'up' ? '↑' : dir === 'down' ? '↓' : dir === 'left' ? '←' : '→'}</span>`;
  notes.appendChild(el);
  liveNotes.push({ el, color, dir, start: now, duration: 1800 });
}

function tick(now) {
  if (!active) return;

  if (now >= nextSpawn) {
    spawn(now);
    nextSpawn = now + 650 + Math.random() * 550;
  }

  for (let i = liveNotes.length - 1; i >= 0; i--) {
    const n = liveNotes[i];
    const p = (now - n.start) / n.duration;
    const z = Math.max(0, Math.min(1, p));
    const side = n.color === 'red' ? -24 : 24;
    const horizontal = n.dir === 'left' ? -7 : n.dir === 'right' ? 7 : 0;
    const vertical = n.dir === 'up' ? -8 : n.dir === 'down' ? 8 : 0;
    const scale = 0.28 + z * 1.08;

    n.el.style.transform = `translate3d(calc(-50% + ${side + horizontal}%), calc(-50% + ${vertical}%), 0) scale(${scale})`;
    n.el.style.opacity = String(0.35 + z * 0.65);

    if (p > 1.08) {
      combo = 0;
      comboEl.textContent = '0';
      n.el.remove();
      liveNotes.splice(i, 1);
    }
  }

  requestAnimationFrame(tick);
}
