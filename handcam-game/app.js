import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const video = document.querySelector('#video');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d', { alpha: true });
const stage = document.querySelector('#stage');
const startBtn = document.querySelector('#startBtn');
const statusEl = document.querySelector('#status');
const mirrorEl = document.querySelector('#mirror');
const drawPoseEl = document.querySelector('#drawPose');
const predictionEl = document.querySelector('#predictionMs');
const predictionValue = document.querySelector('#predictionValue');
const smoothingEl = document.querySelector('#smoothing');
const smoothingValue = document.querySelector('#smoothingValue');

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE_CONNECTIONS = [[0,11],[0,12],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.75, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(dt, 1 / 240));
  }
  filter(value, time) {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = time;
      return value;
    }
    const dt = Math.max((time - this.t) / 1000, 1 / 240);
    const rawDx = (value - this.x) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dx += aD * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(cutoff, dt);
    this.x += a * (value - this.x);
    this.t = time;
    return this.x;
  }
}

function makeFilterSet(count) {
  return Array.from({ length: count }, () => ({ x: new OneEuro(), y: new OneEuro(), z: new OneEuro() }));
}

const hands = {
  left: { filters: makeFilterSet(21), points: null, last: null, velocity: Array.from({length:21},()=>({x:0,y:0,z:0})), lostAt: 0, lastTime: 0 },
  right:{ filters: makeFilterSet(21), points: null, last: null, velocity: Array.from({length:21},()=>({x:0,y:0,z:0})), lostAt: 0, lastTime: 0 }
};

const poseFilters = makeFilterSet(33);
let poseLast = null;
let running = false;
let handLandmarker = null;
let poseLandmarker = null;
let fpsFrames = 0;
let fpsTimer = performance.now();
let poseTick = 0;
let lastVideoTime = -1;

function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

function syncMirror() {
  stage.classList.toggle('mirrored', mirrorEl.checked);
}

function setText(id, text) {
  const el = document.querySelector(id);
  if (el) el.textContent = text;
}

function drawPoint(p, r = 4) {
  ctx.beginPath();
  ctx.arc(p.x * canvas.width, p.y * canvas.height, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawConnections(points, connections) {
  ctx.beginPath();
  for (const [a,b] of connections) {
    if (!points[a] || !points[b]) continue;
    ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
  }
  ctx.stroke();
}

function filteredPoints(hand, landmarks, now) {
  const points = landmarks.map((p, i) => ({
    x: hand.filters[i].x.filter(p.x, now),
    y: hand.filters[i].y.filter(p.y, now),
    z: hand.filters[i].z.filter(p.z ?? 0, now)
  }));

  if (hand.last && hand.lastTime) {
    const dt = Math.max((now - hand.lastTime) / 1000, 1 / 240);
    for (let i = 0; i < points.length; i++) {
      hand.velocity[i].x = (points[i].x - hand.last[i].x) / dt;
      hand.velocity[i].y = (points[i].y - hand.last[i].y) / dt;
      hand.velocity[i].z = (points[i].z - hand.last[i].z) / dt;
    }
  }
  hand.last = points;
  hand.points = points;
  hand.lastTime = now;
  hand.lostAt = now;
  return points;
}

function predictedPoints(hand, now) {
  if (!hand.last) return null;
  const age = now - hand.lostAt;
  const maxAge = Number(predictionEl.value);
  if (age > maxAge) return null;
  const dt = age / 1000;
  const decay = Math.pow(Math.max(0, 1 - age / Math.max(maxAge, 1)), 1.35);
  return hand.last.map((p, i) => ({
    x: Math.max(0, Math.min(1, p.x + hand.velocity[i].x * dt * decay)),
    y: Math.max(0, Math.min(1, p.y + hand.velocity[i].y * dt * decay)),
    z: p.z + hand.velocity[i].z * dt * decay
  }));
}

function handState(hand, landmarks, now) {
  if (landmarks) return filteredPoints(hand, landmarks, now);
  return predictedPoints(hand, now);
}

function drawSaber(points, label) {
  if (!points) return;
  const wrist = points[0];
  const index = points[8];
  const middle = points[12];
  const tip = { x: (index.x + middle.x) / 2, y: (index.y + middle.y) / 2 };
  const dx = tip.x - wrist.x;
  const dy = tip.y - wrist.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bladeLen = 0.18;
  const end = { x: wrist.x + ux * bladeLen, y: wrist.y + uy * bladeLen };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = label === 'left' ? '#ff214d' : '#2677ff';
  ctx.shadowBlur = 18;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(wrist.x * canvas.width, wrist.y * canvas.height);
  ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
  ctx.stroke();
  ctx.restore();
}

function classifyHuman(pose) {
  if (!pose || pose.length < 29) return false;
  const required = [0,11,12,23,24,25,26,27,28];
  const visible = required.filter(i => pose[i] && (pose[i].visibility ?? 1) > 0.35).length;
  if (visible < 7) return false;

  const nose = pose[0], ls = pose[11], rs = pose[12], lh = pose[23], rh = pose[24];
  const shoulderW = Math.hypot(ls.x-rs.x, ls.y-rs.y);
  const hipW = Math.hypot(lh.x-rh.x, lh.y-rh.y);
  const torso = Math.hypot(((ls.x+rs.x)/2)-((lh.x+rh.x)/2), ((ls.y+rs.y)/2)-((lh.y+rh.y)/2));
  const leftLeg = Math.hypot(pose[25].x-pose[27].x, pose[25].y-pose[27].y);
  const rightLeg = Math.hypot(pose[26].x-pose[28].x, pose[26].y-pose[28].y);

  if (shoulderW < 0.045 || hipW < 0.025 || torso < 0.06) return false;
  if (nose.y > ((ls.y+rs.y)/2) + 0.08) return false;
  if (lh.y < ((ls.y+rs.y)/2) - 0.05 || rh.y < ((ls.y+rs.y)/2) - 0.05) return false;
  if (leftLeg < 0.06 || rightLeg < 0.06) return false;

  const widthRatio = hipW / shoulderW;
  return widthRatio > 0.25 && widthRatio < 1.35;
}

function smoothPose(rawPose, now) {
  if (!rawPose) return poseLast;
  const filtered = rawPose.map((p, i) => ({
    x: poseFilters[i].x.filter(p.x, now),
    y: poseFilters[i].y.filter(p.y, now),
    z: poseFilters[i].z.filter(p.z ?? 0, now),
    visibility: p.visibility ?? 1
  }));
  poseLast = filtered;
  return filtered;
}

async function loadModels() {
  // Keep the WASM runtime on the exact same version as the installed JS package.
  // Mixing 1.0.1 JS with the old 0.10.22 WASM can fail with an unhelpful "undefined" error.
  const fileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
  );

  handLandmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2
  });

  poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.25,
    minPosePresenceConfidence: 0.25,
    minTrackingConfidence: 0.25
  });
}

function processFrame(now) {
  if (!running || video.readyState < 2) {
    requestAnimationFrame(processFrame);
    return;
  }

  resizeCanvas();
  if (video.currentTime === lastVideoTime) {
    requestAnimationFrame(processFrame);
    return;
  }
  lastVideoTime = video.currentTime;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let hr = { landmarks: [], handedness: [] };
  try {
    hr = handLandmarker.detectForVideo(video, now);
  } catch (e) {
    console.warn('Hand tracking frame skipped', e);
  }

  const detectedHands = hr.landmarks || [];
  const handed = hr.handedness || [];
  let leftRaw = null;
  let rightRaw = null;
  detectedHands.forEach((lm, i) => {
    const side = handed[i]?.[0]?.categoryName;
    if (side === 'Left') leftRaw = lm;
    if (side === 'Right') rightRaw = lm;
  });

  const left = handState(hands.left, leftRaw, now);
  const right = handState(hands.right, rightRaw, now);

  let pose = poseLast;
  poseTick++;
  if (poseTick % 2 === 0) {
    try {
      const pr = poseLandmarker.detectForVideo(video, now);
      const candidate = pr.landmarks?.find(classifyHuman) || null;
      pose = candidate ? smoothPose(candidate, now) : poseLast;
    } catch (e) {
      console.warn('Pose tracking frame skipped', e);
    }
  }

  setText('#leftState', leftRaw ? 'Detectada' : left ? 'Predicha' : 'Perdida');
  setText('#rightState', rightRaw ? 'Detectada' : right ? 'Predicha' : 'Perdida');
  setText('#poseState', pose ? 'Detectado' : '—');
  setText('#humanState', pose ? 'Sí' : 'No');

  if (drawPoseEl.checked && pose) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffffaa';
    drawConnections(pose, POSE_CONNECTIONS);
    ctx.restore();
  }

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffffaa';
  ctx.fillStyle = '#fff';
  if (left) {
    drawConnections(left, HAND_CONNECTIONS);
    left.forEach(p => drawPoint(p, 2.4));
    drawSaber(left, 'left');
  }
  if (right) {
    drawConnections(right, HAND_CONNECTIONS);
    right.forEach(p => drawPoint(p, 2.4));
    drawSaber(right, 'right');
  }
  ctx.restore();

  fpsFrames++;
  if (now - fpsTimer >= 500) {
    setText('#fps', String(Math.round(fpsFrames * 1000 / (now - fpsTimer))));
    fpsFrames = 0;
    fpsTimer = now;
  }

  requestAnimationFrame(processFrame);
}

function readableError(e) {
  if (!e) return 'Error desconocido';
  return e.message || e.name || String(e);
}

async function start() {
  startBtn.disabled = true;
  statusEl.textContent = 'Cargando modelos…';
  try {
    if (!handLandmarker || !poseLandmarker) await loadModels();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, min: 30 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    resizeCanvas();
    syncMirror();
    running = true;
    statusEl.textContent = 'Tracking activo';
    setText('#phoneState', 'Listo para WebSocket');
    requestAnimationFrame(processFrame);
    startBtn.textContent = 'Cámara activa';
  } catch (e) {
    console.error('HandCam startup error:', e);
    statusEl.textContent = `Error: ${readableError(e)}`;
    startBtn.disabled = false;
  }
}

predictionEl.addEventListener('input', () => predictionValue.textContent = `${predictionEl.value} ms`);
smoothingEl.addEventListener('input', () => smoothingValue.textContent = smoothingEl.value);
mirrorEl.addEventListener('change', syncMirror);
startBtn.addEventListener('click', start);
syncMirror();
