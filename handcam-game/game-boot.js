// Ensures the gameplay button becomes available as soon as the camera/tracking is ready.
// Kept separate from the tracking loop so a UI state cannot block gameplay.
const startButton = document.querySelector('#startBtn');
const gameButton = document.querySelector('#gameBtn');
const status = document.querySelector('#status');

function syncGameButton() {
  if (!gameButton) return;
  const cameraReady = startButton?.textContent?.includes('Cámara activa');
  gameButton.disabled = !cameraReady;
  if (cameraReady) gameButton.title = 'Inicia o detiene el entrenamiento';
}

syncGameButton();
if (startButton) {
  new MutationObserver(syncGameButton).observe(startButton, { childList: true, characterData: true, subtree: true });
}

// Fallback: if the tracking code changes only its state, check periodically.
const timer = setInterval(() => {
  syncGameButton();
  if (startButton?.textContent?.includes('Cámara activa')) clearInterval(timer);
}, 250);

// Make the action visible in the status while preserving the gameplay listener
// already installed by app.js.
if (gameButton) gameButton.addEventListener('click', () => {
  if (!gameButton.disabled && status?.textContent === 'Tracking activo') {
    status.textContent = 'Iniciando entrenamiento…';
  }
});
