import * as THREE from 'three';
import { MAP_SIZE, MAX_HEALTH, MAX_SHIELD, HOLD_SECONDS } from './config.js';
import { createMaterials } from './assets.js';
import { createWorld } from './world.js';
import { createAircraft } from './plane.js';
import { createFirstPersonRig, createLobbyAvatar, createRedCube } from './player.js';
import { createMapUI } from './map-ui.js';
import { createClickSound, showToast, setCaption } from './ui.js';
import { createMatchmaking } from './network.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, .1, 3200);
camera.position.set(19, 46, 140); camera.lookAt(0, 28, 0); scene.add(camera);
const textures = createMaterials();
const world = createWorld(THREE, scene, textures);
const lobbyAvatar = createLobbyAvatar(THREE, scene);
const aircraft = createAircraft(THREE, scene, textures);
const hands = createFirstPersonRig(THREE, camera, scene);
const peerCube = createRedCube(THREE, scene, 1.8); peerCube.visible = false;
const clickSound = createClickSound();
const keys = new Set();
const clock = new THREE.Clock();

let state = 'lobby'; // lobby | inPlane | takingPickaxe | turning | runningJump | falling | parachute | playing
let matchElapsed = 0;
let sequenceTime = 0;
let fallTime = 0;
let parachuteOpenTime = 0;
let mapOpened = false;
let pointerLocked = false;
let sensitivity = 1;
let quality = 'high';
let mouseYaw = 0;
let mousePitch = 0;
let groundVerticalVelocity = 0;
let isGrounded = false;
let wasdEnabled = false;
let eHeld = false;
let holdProgress = 0;
let holdTarget = null;
let focusedChest = null;
let ownPeerStateTimer = 0;
let currentRegion = 'INSEL';
let chuteVelocity = new THREE.Vector3();
let jumpStartYaw = 0;
let jumpStartPos = new THREE.Vector3();
let planeJumpTangent = new THREE.Vector3(0, 0, -1);
let parachuteRig = null;
let ropeLine = null;
let ropePositions = null;
let canopyMaterial = null;
let canopyOpened = false;
let toastHold = 0;
let qualitySelect = document.getElementById('quality-select');

const lobby = document.getElementById('lobby');
const queueScreen = document.getElementById('queue-screen');
const playButton = document.getElementById('play-button');
const queueStatus = document.getElementById('queue-status');
const queueCopy = document.getElementById('queue-copy');
const playersCount = document.getElementById('players-count');
const queueDetail = document.getElementById('queue-detail');
const hud = document.getElementById('hud');
const healthFill = document.getElementById('health-fill');
const shieldFill = document.getElementById('shield-fill');
const healthValue = document.getElementById('health-value');
const shieldValue = document.getElementById('shield-value');
const chestPrompt = document.getElementById('chest-prompt');
const ringProgress = document.getElementById('hold-ring-progress');
const pointerHint = document.getElementById('pointer-hint');
const settingsPanel = document.getElementById('settings-panel');
const blackFade = document.getElementById('black-fade');

const mapUI = createMapUI({
  onMarkersChange: markers => world.setWaypoints(markers),
  onOpenChange: open => {
    mapOpened = open;
    if (open) hands.setPose('map');
    else restoreHandPose();
  }
});

function restoreHandPose() {
  if (state === 'falling') hands.setPose('freefall', fallTime);
  else if (state === 'parachute') hands.setPose('parachute', parachuteOpenTime);
  else if (state === 'playing') hands.setPose(isGrounded && (keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD')) ? 'walk' : 'idle', matchElapsed);
  else hands.setPose('hidden');
}

function createParachuteRig() {
  const group = new THREE.Group(); group.visible = false; group.name = 'deployed-parachute'; scene.add(group);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(4.8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b7a77c', side: THREE.DoubleSide, roughness: .88, metalness: .03 }));
  canopy.scale.set(1.28, .62, .82); canopy.position.y = 7.2; group.add(canopy); canopyMaterial = canopy.material;
  // Alternating canvas panels and seam lines help the open canopy read as fabric.
  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * Math.PI * 2;
    const seam = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 4.7, 4), new THREE.MeshStandardMaterial({ color: '#594f3c', roughness: 1 }));
    seam.position.set(Math.sin(theta) * 2.8, 8.0, Math.cos(theta) * 1.8); seam.rotation.z = .42 * Math.cos(theta); seam.rotation.x = .35 * Math.sin(theta); group.add(seam);
  }
  const ropeMat = new THREE.LineBasicMaterial({ color: '#efe6d0', transparent: true, opacity: .92 });
  const ropeGeo = new THREE.BufferGeometry(); ropePositions = new Float32Array(8 * 2 * 3); ropeGeo.setAttribute('position', new THREE.BufferAttribute(ropePositions, 3));
  ropeLine = new THREE.LineSegments(ropeGeo, ropeMat); scene.add(ropeLine);
  return group;
}
parachuteRig = createParachuteRig();

function updateParachuteRig() {
  if (!canopyOpened) return;
  const pos = new THREE.Vector3(); camera.getWorldPosition(pos);
  parachuteRig.position.set(pos.x, pos.y, pos.z - .1);
  const q = new THREE.Quaternion(); camera.getWorldQuaternion(q); parachuteRig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), new THREE.Euler().setFromQuaternion(q).y);
  const canopyCenter = new THREE.Vector3(pos.x, pos.y + 7.15, pos.z - .1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = canopyCenter.x + Math.sin(a) * 4.5;
    const y = canopyCenter.y - .9;
    const z = canopyCenter.z + Math.cos(a) * 2.9;
    const handX = pos.x + Math.sin(a) * .38;
    const handY = pos.y - .38;
    const handZ = pos.z - .65;
    const j = i * 6;
    ropePositions[j] = x; ropePositions[j + 1] = y; ropePositions[j + 2] = z;
    ropePositions[j + 3] = handX; ropePositions[j + 4] = handY; ropePositions[j + 5] = handZ;
  }
  ropeLine.geometry.attributes.position.needsUpdate = true;
  ropeLine.geometry.computeBoundingSphere();
}

let network = null;
let matchStarted = false;
function updatePlayersCount(count) {
  playersCount.textContent = String(count);
  queueDetail.textContent = count >= 2 ? 'Zweiter Spieler gefunden. Match wird gestartet …' : 'Warte auf einen zweiten Spieler …';
  queueCopy.textContent = count >= 2 ? 'Spieler gefunden — bereit zum Absprung' : 'Suche nach Spieler 2 …';
}
function startMatch() {
  if (matchStarted) return;
  matchStarted = true;
  network?.stopSearch();
  lobby.classList.add('hidden'); queueScreen.classList.add('hidden');
  lobbyAvatar.avatar.visible = false; lobbyAvatar.halo.visible = false;
  blackFade.classList.add('active');
  setTimeout(() => blackFade.classList.remove('active'), 180);
  state = 'inPlane'; matchElapsed = 0; sequenceTime = 0; fallTime = 0; parachuteOpenTime = 0; mapOpened = false;
  mapUI.close();
  aircraft.update(0);
  aircraft.group.add(camera);
  camera.position.set(0, 1.62, -2.4); camera.rotation.set(0, 0, 0);
  mouseYaw = 0; mousePitch = 0;
  hands.setPose('hidden');
  hud.classList.add('hidden'); hud.classList.remove('reveal');
  parachuteRig.visible = false; ropeLine.visible = false; canopyOpened = false;
  pointerHint.classList.add('hidden');
  setCaption('MILITÄRTRANSPORT · HECKKLAPPE OFFEN', true);
  setTimeout(() => { if (state === 'inPlane') setCaption('', false); }, 2300);
}

network = createMatchmaking({
  onPlayersChanged: updatePlayersCount,
  onMatchFound: startMatch,
  onPeerState: (peerId, remote) => {
    if (!remote || !Number.isFinite(remote.x) || !Number.isFinite(remote.y) || !Number.isFinite(remote.z)) return;
    peerCube.position.set(remote.x, remote.y - .8, remote.z);
    peerCube.rotation.set(0, remote.yaw || 0, 0);
    peerCube.visible = matchStarted;
  },
  onPeerEvent: (action, payload) => {
    if (action === 'chest-open' && payload?.id != null) {
      const sharedChest = world.chests.find(chest => chest.userData.chestData.id === payload.id);
      if (sharedChest) world.openChest(sharedChest);
    }
  }
});

playButton.addEventListener('click', () => {
  if (state !== 'lobby') return;
  clickSound.click(true);
  queueScreen.classList.remove('hidden');
  updatePlayersCount(1);
  network.startSearch();
});
document.getElementById('cancel-queue').addEventListener('click', () => {
  clickSound.click(false); network.stopSearch(); queueScreen.classList.add('hidden'); lobby.classList.remove('hidden');
  queueCopy.textContent = 'Bereit zum Start';
});
document.getElementById('settings-button').addEventListener('click', () => { clickSound.click(false); settingsPanel.classList.toggle('hidden'); });
document.getElementById('settings-close').addEventListener('click', () => { clickSound.click(false); settingsPanel.classList.add('hidden'); });
document.getElementById('sensitivity-slider').addEventListener('input', event => { sensitivity = Number(event.target.value) || 1; });
qualitySelect.addEventListener('change', event => {
  quality = event.target.value;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? .8 : quality === 'medium' ? 1.1 : 1.5));
  renderer.shadowMap.enabled = quality !== 'low';
  showToast(`GRAFIK: ${quality === 'high' ? 'HOCH' : quality === 'medium' ? 'MITTEL' : 'LEISTUNG'}`, 1300);
});

function getWorldPosition() { const p = new THREE.Vector3(); camera.getWorldPosition(p); return p; }
function getWorldYaw() {
  const q = new THREE.Quaternion(); camera.getWorldQuaternion(q);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-forward.x, -forward.z);
}
function requestPointerLock() {
  if (!['inPlane', 'parachute', 'playing'].includes(state) || mapOpened) return;
  canvas.requestPointerLock?.();
}
canvas.addEventListener('click', () => {
  if (['inPlane', 'parachute', 'playing'].includes(state) && !mapOpened && !pointerLocked) requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  pointerHint.classList.toggle('hidden', !hud.classList.contains('reveal') || pointerLocked);
});
document.addEventListener('mousemove', event => {
  if (!pointerLocked || mapOpened) return;
  const sens = .0018 * sensitivity;
  if (state === 'inPlane' || state === 'takingPickaxe' || state === 'turning' || state === 'runningJump') {
    camera.rotation.y -= event.movementX * sens;
    camera.rotation.x = Math.max(-.75, Math.min(.65, camera.rotation.x - event.movementY * sens));
    mouseYaw = camera.rotation.y; mousePitch = camera.rotation.x;
  } else if (state === 'parachute' || state === 'playing') {
    camera.rotation.y -= event.movementX * sens;
    camera.rotation.x = Math.max(-1.25, Math.min(1.15, camera.rotation.x - event.movementY * sens));
  }
});

document.addEventListener('keydown', event => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyM' && !event.repeat && matchStarted && ['inPlane', 'parachute', 'playing'].includes(state)) { mapUI.toggle(); clickSound.click(false); return; }
  if (event.code === 'Escape' && mapOpened) { mapUI.close(); return; }
  keys.add(event.code);
  if (event.code === 'KeyE') eHeld = true;
  if (event.code === 'Space' && !event.repeat) {
    if (state === 'inPlane' && !mapOpened) beginJumpSequence();
    else if (state === 'playing' && isGrounded) { groundVerticalVelocity = 8.9; isGrounded = false; clickSound.thump(); }
  }
});
document.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'KeyE') { eHeld = false; holdProgress = 0; ringProgress.style.strokeDashoffset = '119.4'; }
});

function detachCameraFromAircraft() {
  camera.updateWorldMatrix(true, false);
  const position = camera.getWorldPosition(new THREE.Vector3());
  const quaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  aircraft.group.remove(camera); scene.add(camera);
  camera.position.copy(position); camera.quaternion.copy(quaternion);
  camera.updateMatrixWorld(true);
}
function beginJumpSequence() {
  if (state !== 'inPlane') return;
  if (mapOpened) mapUI.close();
  document.exitPointerLock?.(); pointerLocked = false;
  state = 'takingPickaxe'; sequenceTime = 0; jumpStartYaw = camera.rotation.y;
  aircraft.pickaxe.visible = true;
  hands.setPose('take', 0);
  setCaption('SPITZHACKE AUFNEHMEN', true);
  queueScreen.classList.add('hidden');
}
function startFalling() {
  detachCameraFromAircraft();
  const tangent = planeJumpTangent.clone().setY(0).normalize();
  chuteVelocity.copy(tangent).multiplyScalar(17.5);
  camera.rotation.x = -.08;
  state = 'falling'; fallTime = 0;
  hands.setPose('freefall', 0);
  setCaption('FREIER FALL', true);
}
function openParachute() {
  state = 'parachute'; parachuteOpenTime = 0; canopyOpened = true;
  parachuteRig.visible = true; ropeLine.visible = true;
  clickSound.thump();
  // A short downward snap simulates the canopy catching air.
  camera.position.y -= 1.35;
  camera.rotation.x = -.11;
  hands.setPose('parachute', 0);
  hud.classList.remove('hidden'); hud.classList.remove('reveal');
  void hud.offsetWidth; hud.classList.add('reveal');
  pointerHint.classList.toggle('hidden', pointerLocked);
  setCaption('FALLSCHIRM GEÖFFNET', true);
  setTimeout(() => { if (state === 'parachute' || state === 'playing') setCaption('', false); }, 1800);
}

function moveInsideAircraft(dt) {
  const speed = 5.4;
  const yaw = camera.rotation.y;
  let dx = 0, dz = 0;
  const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  if (keys.has('KeyW')) { dx += forwardX; dz += forwardZ; }
  if (keys.has('KeyS')) { dx -= forwardX; dz -= forwardZ; }
  if (keys.has('KeyD')) { dx += rightX; dz += rightZ; }
  if (keys.has('KeyA')) { dx -= rightX; dz -= rightZ; }
  const len = Math.hypot(dx, dz) || 1;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x + dx / len * speed * dt, -2.3, 2.3);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z + dz / len * speed * dt, -7.9, 5.1);
  camera.position.y = 1.62;
}
function moveAirborne(dt) {
  const pos = getWorldPosition();
  let forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; if (forward.lengthSq() < .0001) forward.set(0, 0, -1); forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  let dx = 0, dz = 0;
  if (state !== 'falling' && !mapOpened) {
    if (keys.has('KeyW')) { dx += forward.x; dz += forward.z; }
    if (keys.has('KeyS')) { dx -= forward.x; dz -= forward.z; }
    if (keys.has('KeyD')) { dx += right.x; dz += right.z; }
    if (keys.has('KeyA')) { dx -= right.x; dz -= right.z; }
  }
  const len = Math.hypot(dx, dz) || 1;
  const steering = state === 'falling' ? 0 : 8.3;
  camera.position.x += (chuteVelocity.x + (dx / len) * steering) * dt;
  camera.position.z += (chuteVelocity.z + (dz / len) * steering) * dt;
  if (state === 'falling') camera.position.y -= 23.5 * dt;
  else camera.position.y -= 7.9 * dt;
  const ground = world.heightAt(camera.position.x, camera.position.z) + 1.75;
  if (camera.position.y <= ground) {
    camera.position.y = ground; state = 'playing'; isGrounded = true; groundVerticalVelocity = 0;
    parachuteRig.visible = false; ropeLine.visible = false; canopyOpened = false;
    hands.setPose('idle', matchElapsed); setCaption('', false);
    showToast(`GELANDET · ${world.locationNameAt(pos.x, pos.z)}`, 2800);
  }
}
function moveOnGround(dt) {
  let forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; if (forward.lengthSq() < .0001) forward.set(0, 0, -1); forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  let dx = 0, dz = 0;
  if (keys.has('KeyW')) { dx += forward.x; dz += forward.z; }
  if (keys.has('KeyS')) { dx -= forward.x; dz -= forward.z; }
  if (keys.has('KeyD')) { dx += right.x; dz += right.z; }
  if (keys.has('KeyA')) { dx -= right.x; dz -= right.z; }
  const moving = Math.hypot(dx, dz) > .01;
  if (moving && !mapOpened) {
    const len = Math.hypot(dx, dz); const speed = keys.has('ShiftLeft') ? 23 : 15;
    camera.position.x += dx / len * speed * dt; camera.position.z += dz / len * speed * dt;
  }
  groundVerticalVelocity -= 26 * dt;
  camera.position.y += groundVerticalVelocity * dt;
  const ground = world.heightAt(camera.position.x, camera.position.z) + 1.72;
  if (camera.position.y <= ground) { camera.position.y = ground; groundVerticalVelocity = 0; isGrounded = true; }
  else isGrounded = false;
  hands.setPose(moving ? 'walk' : 'idle', matchElapsed);
}
function updateChestInteraction(dt) {
  if (!['playing', 'parachute'].includes(state) || mapOpened) {
    chestPrompt.classList.add('hidden'); focusedChest = null; holdProgress = 0; ringProgress.style.strokeDashoffset = '119.4'; return;
  }
  camera.updateWorldMatrix(true, false);
  const chest = world.findFocusedChest(camera);
  focusedChest = chest;
  if (!chest || state !== 'playing') {
    chestPrompt.classList.add('hidden'); holdTarget = null; holdProgress = 0; ringProgress.style.strokeDashoffset = '119.4'; return;
  }
  chestPrompt.classList.remove('hidden');
  if (holdTarget !== chest) { holdTarget = chest; holdProgress = 0; }
  if (eHeld) {
    holdProgress = Math.min(1, holdProgress + dt / HOLD_SECONDS);
    ringProgress.style.strokeDashoffset = String(119.4 * (1 - holdProgress));
    if (holdProgress >= 1) {
      if (world.openChest(chest)) { network.sendAction('chest-open', { id: chest.userData.chestData.id }); showToast('TRUHE GEÖFFNET · LEER', 2400); }
      eHeld = false; keys.delete('KeyE'); holdTarget = null; focusedChest = null; holdProgress = 0;
      chestPrompt.classList.add('hidden'); ringProgress.style.strokeDashoffset = '119.4';
    }
  } else {
    holdProgress = 0; ringProgress.style.strokeDashoffset = '119.4';
  }
}

function updateHud() {
  healthValue.textContent = String(MAX_HEALTH); shieldValue.textContent = String(MAX_SHIELD);
  healthFill.style.width = `${MAX_HEALTH}%`; shieldFill.style.width = `${MAX_SHIELD / 50 * 100}%`;
  const pos = getWorldPosition(); mapUI.updatePlayerPosition(pos.x, pos.z, world.locationNameAt(pos.x, pos.z));
  pointerHint.classList.toggle('hidden', pointerLocked || hud.classList.contains('hidden') || mapOpened);
}

function updatePeerState(dt) {
  ownPeerStateTimer += dt;
  if (ownPeerStateTimer < .12 || !matchStarted) return;
  ownPeerStateTimer = 0;
  camera.updateWorldMatrix(true, false);
  const p = getWorldPosition();
  network.sendState({ x: p.x, y: p.y, z: p.z, phase: state, yaw: getWorldYaw() });
}

function animate() {
  const dt = Math.min(clock.getDelta(), .035);
  const elapsed = clock.elapsedTime;
  if (state === 'lobby') {
    lobbyAvatar.avatar.position.y = 31 + Math.sin(elapsed * 1.25) * .35;
    lobbyAvatar.avatar.rotation.y = Math.sin(elapsed * .35) * .23;
    lobbyAvatar.halo.rotation.z = elapsed * .16;
  }
  world.updateChests(dt);
  if (matchStarted) {
    matchElapsed += dt;
    aircraft.update(matchElapsed);
    if (state === 'inPlane') {
      planeJumpTangent.set(0, 0, -1).applyQuaternion(aircraft.group.quaternion).normalize();
      if (!mapOpened) moveInsideAircraft(dt);
      if (!mapOpened) hands.setPose('hidden');
    } else if (state === 'takingPickaxe') {
      sequenceTime += dt;
      const t = Math.min(1, sequenceTime / 1.15); hands.setPose('take', t);
      if (sequenceTime > .72) aircraft.pickaxe.visible = false;
      if (sequenceTime > 1.15) { state = 'turning'; sequenceTime = 0; jumpStartYaw = camera.rotation.y; }
    } else if (state === 'turning') {
      sequenceTime += dt;
      const t = Math.min(1, sequenceTime / 1.25); const smooth = t * t * (3 - 2 * t);
      camera.rotation.y = jumpStartYaw + Math.PI * smooth;
      camera.rotation.x = -.04 - .08 * smooth;
      camera.position.z = THREE.MathUtils.lerp(-2.4, 4.3, smooth);
      camera.position.y = 1.62 + .08 * Math.sin(t * Math.PI);
      hands.setPose('run-jump', t);
      setCaption('HECKKLAPPE · ABSRPUNG', true);
      if (sequenceTime > 1.25) { state = 'runningJump'; sequenceTime = 0; jumpStartPos.copy(camera.position); jumpStartYaw = camera.rotation.y; }
    } else if (state === 'runningJump') {
      sequenceTime += dt;
      const t = Math.min(1, sequenceTime / .82); const smooth = t * t * (3 - 2 * t);
      camera.position.z = THREE.MathUtils.lerp(4.3, 10.1, smooth);
      camera.position.y = 1.62 + Math.sin(t * Math.PI) * .48 - Math.max(0, t - .76) * 2.8;
      camera.rotation.x = -.08 - Math.sin(t * Math.PI) * .1;
      hands.setPose('run-jump', t);
      if (sequenceTime > .82) {
        clickSound.thump(); startFalling(); sequenceTime = 0;
      }
    } else if (state === 'falling') {
      fallTime += dt; moveAirborne(dt); hands.setPose('freefall', fallTime);
      if (fallTime >= 3 && state === 'falling') openParachute();
    } else if (state === 'parachute') {
      parachuteOpenTime += dt; moveAirborne(dt); if (state === 'parachute') hands.setPose('parachute', parachuteOpenTime);
      updateParachuteRig();
    } else if (state === 'playing') {
      moveOnGround(dt); updateChestInteraction(dt);
    }
    if (mapOpened) hands.setPose('map');
    updateHud(); updatePeerState(dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

textures.ready.then(loaded => world.applyTextures(loaded)).catch(() => {});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});
window.addEventListener('blur', () => { keys.clear(); eHeld = false; holdProgress = 0; });
window.addEventListener('contextmenu', event => event.preventDefault());
requestAnimationFrame(animate);
