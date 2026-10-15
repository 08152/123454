import * as THREE from 'three';
import { MAP_SIZE, HALF_MAP, LOCATIONS } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist2 = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
let seed = 791937; // Deterministic layout so both local multiplayer tabs share the same map and chest positions.
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function randRange(a, b) { return a + (b - a) * rand(); }
function gauss(x, z, cx, cz, sigma, height) { const d = ((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma); return height * Math.exp(-d); }

export function heightAt(x, z) {
  // Crowns Rest is a separate small island near the south-eastern coast.
  const crownDistance = dist2(x, z, 380, 360);
  if (crownDistance < 62) return -20 + 36 * smooth(0, 14, 62 - crownDistance);
  const r = Math.sqrt((x / 520) ** 2 + (z / 550) ** 2);
  const a = Math.atan2(z, x);
  const edge = 1 + .033 * Math.sin(a * 4 + .4) + .025 * Math.cos(a * 7) + .015 * Math.sin(a * 13 + 2);
  if (r >= edge) return -24;
  const edgeFade = smooth(0, .045, edge - r);
  const rolling = Math.sin(x * .021 + Math.cos(z * .017) * 2) * 2.8 + Math.cos(z * .026 - x * .008) * 3.2 + Math.sin((x + z) * .044) * 1.2;
  let h = 4 + (1 - r) * 8 + rolling;
  h += gauss(x, z, -340, -360, 98, 52); // Frosty Peaks
  h += gauss(x, z, 280, -375, 104, 61); // Snowfall Ridge
  h += gauss(x, z, 230, -45, 78, 26); // Rift Rocks
  h += gauss(x, z, -310, 95, 100, 22); // Willow Heights
  h += gauss(x, z, -120, 260, 105, 15);
  h += gauss(x, z, 345, 345, 67, 10);
  if (x > 170 && z > -20) h = h * .65 + 7; // desert plateau
  return -24 + (h + 24) * edgeFade;
}

function biomeAt(x, z, y = heightAt(x, z)) {
  if (dist2(x, z, -340, -360) < 124 || dist2(x, z, 280, -375) < 128 || y > 54) return 'snow';
  if (x > 175 && z > -5 && dist2(x, z, 365, 75) < 270) return 'desert';
  if ((x < -80 && z > -210 && z < 30) || (x > 90 && z > 145 && z < 300)) return 'forest';
  if (dist2(x, z, 230, -45) < 95) return 'rock';
  return 'grass';
}
function makeLabel(text) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const c = canvas.getContext('2d'); c.clearRect(0, 0, 512, 96);
  c.fillStyle = 'rgba(5,15,23,.78)'; c.beginPath(); c.roundRect(5, 7, 502, 82, 10); c.fill();
  c.strokeStyle = 'rgba(229,243,251,.5)'; c.lineWidth = 3; c.stroke();
  c.font = '800 35px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f3f8fb'; c.shadowColor = '#000'; c.shadowBlur = 8; c.fillText(text.toUpperCase(), 256, 49, 470);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(26, 4.9, 1); sprite.userData.isLocationLabel = true;
  return sprite;
}
function makeBox(THREE, parent, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function createBuilding(THREE, scene, loc, idx, materials) {
  const group = new THREE.Group();
  const angle = rand() * Math.PI * 2;
  const radius = loc.kind === 'city' || loc.kind === 'port' ? randRange(18, 62) : randRange(12, 49);
  let x = loc.x + Math.cos(angle) * radius;
  let z = loc.z + Math.sin(angle) * radius;
  // Keep buildings on the actual land surface.
  if (heightAt(x, z) < 0) { x = loc.x + Math.cos(angle) * radius * .55; z = loc.z + Math.sin(angle) * radius * .55; }
  const ground = heightAt(x, z);
  group.position.set(x, ground, z);
  group.rotation.y = Math.round(rand() * 3) * Math.PI / 2 + randRange(-.08, .08);
  const urban = loc.kind === 'city' || loc.kind === 'port' || loc.kind === 'town';
  const w = urban ? randRange(8, 15) : randRange(6, 11);
  const d = urban ? randRange(7, 14) : randRange(6, 10);
  const h = loc.kind === 'city' ? randRange(9, 22) : loc.kind === 'port' ? randRange(7, 15) : randRange(4.5, 10);
  const tone = loc.biome === 'desert' ? ['#c7a16d', '#b58b58', '#d3b987'][Math.floor(rand() * 3)] : loc.biome === 'industrial' ? ['#4c5c65', '#6d777b', '#566b72'][Math.floor(rand() * 3)] : ['#a7b2b6', '#8d9b9f', '#c0c4bc', '#788f96'][Math.floor(rand() * 4)];
  const wall = new THREE.MeshStandardMaterial({ color: tone, map: (loc.biome === 'industrial' ? materials.metal : materials.brick), roughness: .91 });
  const roofColors = loc.biome === 'desert' ? ['#674a36', '#946d45'] : loc.biome === 'industrial' ? ['#323f48', '#4b5961'] : ['#394a58', '#794d45', '#596e73'];
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColors[Math.floor(rand() * roofColors.length)], roughness: .8, metalness: loc.biome === 'industrial' ? .35 : .06 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1d3d4c', emissive: '#143140', emissiveIntensity: .22, roughness: .25, metalness: .35 });
  makeBox(THREE, group, w, h, d, wall, 0, h / 2, 0);
  // Flat, slightly overhanging roof keeps buildings simple and robust.
  makeBox(THREE, group, w + 1, .75, d + 1, roofMat, 0, h + .35, 0);
  // Windows and doors on the front face.
  const windowW = Math.max(1.0, w * .13), windowH = Math.max(1.2, h * .13);
  for (let row = 0; row < Math.min(3, Math.floor(h / 3.4)); row++) {
    for (let col = -1; col <= 1; col++) {
      if (rand() < .18) continue;
      const wx = col * w * .27;
      makeBox(THREE, group, windowW, windowH, .12, glass, wx, 2 + row * 2.65, d / 2 + .08);
    }
  }
  const door = new THREE.MeshStandardMaterial({ color: '#263742', roughness: .8 });
  makeBox(THREE, group, 1.35, 2.35, .14, door, w * .17, 1.18, d / 2 + .1);
  if (loc.kind === 'port') {
    // Shipping containers outside the main building.
    for (let c = 0; c < (idx % 3) + 1; c++) {
      const boxMat = new THREE.MeshStandardMaterial({ color: ['#9f493e', '#496f83', '#b18a45'][c % 3], metalness: .42, roughness: .65, map: materials.metal });
      makeBox(THREE, group, 5, 2.5, 2.7, boxMat, (c - 1) * 6, 1.25, -d / 2 - 3.5);
    }
  }
  scene.add(group);
  return group;
}
function createRoad(THREE, scene, a, b, width = 3.1) {
  const start = new THREE.Vector3(a.x, heightAt(a.x, a.z) + .75, a.z);
  const end = new THREE.Vector3(b.x, heightAt(b.x, b.z) + .75, b.z);
  const mid1 = new THREE.Vector3(a.x * .67 + b.x * .33, 0, a.z * .67 + b.z * .33);
  const mid2 = new THREE.Vector3(a.x * .33 + b.x * .67, 0, a.z * .33 + b.z * .67);
  mid1.y = heightAt(mid1.x, mid1.z) + .75; mid2.y = heightAt(mid2.x, mid2.z) + .75;
  const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, end]);
  const points = curve.getPoints(100); const vertices = [], indices = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], tangent = curve.getTangent(i / (points.length - 1));
    const nx = -tangent.z, nz = tangent.x; const len = Math.hypot(nx, nz) || 1;
    vertices.push(p.x + nx / len * width, p.y, p.z + nz / len * width);
    vertices.push(p.x - nx / len * width, p.y + .025, p.z - nz / len * width);
    if (i < points.length - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#565e5d', roughness: 1, side: THREE.DoubleSide });
  const road = new THREE.Mesh(geo, mat); road.receiveShadow = true; scene.add(road);
  // Dashed painted road centreline.
  const linePoints = points.filter((_, i) => i % 5 === 0).map(p => new THREE.Vector3(p.x, p.y + .07, p.z));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineBasicMaterial({ color: '#d2c7a2', transparent: true, opacity: .62 })); scene.add(line);
}
function createChest(THREE, scene, x, z, id) {
  const group = new THREE.Group(); group.position.set(x, heightAt(x, z) + .1, z); group.userData.isChest = true;
  const dark = new THREE.MeshStandardMaterial({ color: '#604021', roughness: .67, metalness: .12 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e7ad2c', roughness: .33, metalness: .62, emissive: '#7a4a0c', emissiveIntensity: .13 });
  const seam = new THREE.MeshStandardMaterial({ color: '#392a1e', roughness: .72, metalness: .25 });
  makeBox(THREE, group, 2.55, 1.25, 1.65, dark, 0, .68, 0);
  makeBox(THREE, group, 2.7, .17, 1.77, gold, 0, .93, 0);
  makeBox(THREE, group, .22, 1.28, 1.83, gold, 0, .66, 0);
  makeBox(THREE, group, .52, .44, .13, gold, 0, .78, .91);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 1.18, -.76); group.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.65, .63, .25), dark); lid.position.set(0, .05, .76); lid.castShadow = true; lidPivot.add(lid);
  const lidTop = new THREE.Mesh(new THREE.BoxGeometry(2.76, .14, 1.77), gold); lidTop.position.set(0, .36, .76); lidTop.castShadow = true; lidPivot.add(lidTop);
  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(.22, .68, 1.82), gold); lidBand.position.set(0, .16, .76); lidBand.castShadow = true; lidPivot.add(lidBand);
  // Faint glow and interaction target make empty loot chests easy to recognize.
  const glow = new THREE.PointLight('#ffb526', 1.3, 7, 2); glow.position.set(0, 1.5, 0); group.add(glow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, .055, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffcc45', transparent: true, opacity: .46 })); ring.rotation.x = Math.PI / 2; ring.position.y = .04; group.add(ring);
  group.traverse(o => { if (o.isMesh) { o.userData.chestGroup = group; o.castShadow = true; o.receiveShadow = true; } });
  group.userData.chestData = { id, opened: false, lidPivot, targetRotation: 0, meshes: [] };
  scene.add(group);
  return group;
}

export function createWorld(THREE, scene, texturePack) {
  scene.background = new THREE.Color('#82cce9');
  scene.fog = new THREE.Fog('#a9d3df', 300, 1050);
  const hemi = new THREE.HemisphereLight('#d9f1ff', '#263b2c', 2.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3d7', 3.1); sun.position.set(-220, 350, -160); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -600; sun.shadow.camera.right = 600; sun.shadow.camera.top = 600; sun.shadow.camera.bottom = -600; sun.shadow.bias = -.00025; scene.add(sun);
  const oceanGeo = new THREE.PlaneGeometry(3600, 3600, 1, 1); oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshStandardMaterial({ color: '#0c6789', roughness: .3, metalness: .12, normalMap: texturePack.waterNormal, normalScale: new THREE.Vector2(.25, .25) });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat); ocean.position.y = -19; ocean.receiveShadow = true; scene.add(ocean);

  const terrainExtent = 1300;
  const segments = 200, vertices = [], colors = [], uvs = [];
  const indexGroups = { grass: [], forest: [], desert: [], snow: [], rock: [] };
  const biomeOrder = ['grass', 'forest', 'desert', 'snow', 'rock'];
  const cGrass = new THREE.Color('#4e9149'), cForest = new THREE.Color('#235c3b'), cDesert = new THREE.Color('#c6a363'), cSnow = new THREE.Color('#dce7e8'), cRock = new THREE.Color('#777b78'), cDune = new THREE.Color('#e3bd78');
  for (let iz = 0; iz <= segments; iz++) {
    const z = -terrainExtent / 2 + (iz / segments) * terrainExtent;
    for (let ix = 0; ix <= segments; ix++) {
      const x = -terrainExtent / 2 + (ix / segments) * terrainExtent;
      const y = heightAt(x, z); vertices.push(x, y, z); uvs.push((x + HALF_MAP) / 22, (z + HALF_MAP) / 22);
      const biome = biomeAt(x, z, y);
      let color = biome === 'snow' ? cSnow : biome === 'desert' ? cDune : biome === 'forest' ? cForest : biome === 'rock' ? cRock : cGrass;
      const shade = .87 + .13 * (Math.sin(x * .043) * Math.cos(z * .033) + 1) / 2;
      const cc = color.clone().multiplyScalar(shade);
      if (y < 1 && y > -20) cc.lerp(new THREE.Color('#b5ba91'), .55);
      colors.push(cc.r, cc.g, cc.b);
      if (ix < segments && iz < segments) {
        const a = iz * (segments + 1) + ix;
        const centerX = x + terrainExtent / segments * .5, centerZ = z + terrainExtent / segments * .5;
        const centerBiome = biomeAt(centerX, centerZ, heightAt(centerX, centerZ));
        const key = indexGroups[centerBiome] ? centerBiome : 'grass';
        indexGroups[key].push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2);
      }
    }
  }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const indices = [];
  for (let materialIndex = 0; materialIndex < biomeOrder.length; materialIndex++) {
    const groupIndices = indexGroups[biomeOrder[materialIndex]];
    const start = indices.length; for (const index of groupIndices) indices.push(index); terrainGeo.addGroup(start, groupIndices.length, materialIndex);
  }
  terrainGeo.setIndex(indices); terrainGeo.computeVertexNormals();
  const terrainMat = [
    new THREE.MeshStandardMaterial({ map: texturePack.grass, vertexColors: true, roughness: 1, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: texturePack.grass, vertexColors: true, roughness: 1, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: texturePack.sand, vertexColors: true, roughness: 1, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: texturePack.snow, vertexColors: true, roughness: 1, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: texturePack.rock, vertexColors: true, roughness: 1, metalness: 0 })
  ];
  const terrain = new THREE.Mesh(terrainGeo, terrainMat); terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  // Small islands and coastal rocks.
  for (let i = 0; i < 45; i++) {
    const angle = rand() * Math.PI * 2, r = randRange(500, 690), x = Math.cos(angle) * r, z = Math.sin(angle) * r * 1.04;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(randRange(2, 12), 0), new THREE.MeshStandardMaterial({ color: rand() > .5 ? '#687a7b' : '#4a797b', roughness: 1 }));
    rock.position.set(x, -15 + randRange(-1, 3), z); rock.scale.y = .38; rock.rotation.set(rand(), rand(), rand()); scene.add(rock);
  }

  // The named POIs are aligned with the uploaded top-down map.
  for (const loc of LOCATIONS) {
    const markerY = heightAt(loc.x, loc.z);
    const label = makeLabel(loc.name); label.position.set(loc.x, Math.max(markerY + 26, 30), loc.z); scene.add(label);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, .24, 6, 36), new THREE.MeshBasicMaterial({ color: loc.biome === 'desert' ? '#f4c46a' : '#dbeeff', transparent: true, opacity: .55 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(loc.x, markerY + .35, loc.z); scene.add(ring);
    for (let i = 0; i < loc.buildings; i++) createBuilding(THREE, scene, loc, i, texturePack);
  }

  // Roads link neighbouring POIs as a broad island road network.
  const roadPairs = [[2,3],[3,4],[2,6],[6,5],[6,7],[7,8],[7,10],[10,11],[10,13],[9,10],[9,12],[13,14],[14,15],[12,13],[3,8],[1,3],[0,2]];
  for (const [a, b] of roadPairs) createRoad(THREE, scene, LOCATIONS[a], LOCATIONS[b], (LOCATIONS[a].kind === 'city' || LOCATIONS[b].kind === 'city') ? 3.5 : 2.6);

  // Forests: instanced meshes keep hundreds of trees affordable in a browser.
  const trunkGeo = new THREE.CylinderGeometry(.45, .75, 4.5, 6);
  const pineGeo = new THREE.ConeGeometry(3.2, 8, 7); pineGeo.translate(0, 4.6, 0);
  const leafGeo = new THREE.IcosahedronGeometry(3.2, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#62452d', roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: '#236a3e', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#347d45', roughness: 1 });
  const treeCount = 1050;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, treeCount);
  const leafy = new THREE.InstancedMesh(leafGeo, leafMat, Math.floor(treeCount * .32));
  trunks.castShadow = pines.castShadow = leafy.castShadow = true; trunks.receiveShadow = true;
  const dummy = new THREE.Object3D(); let used = 0, usedLeaf = 0;
  for (let attempts = 0; attempts < 4400 && used < treeCount; attempts++) {
    const x = randRange(-480, 480), z = randRange(-500, 500), y = heightAt(x, z);
    if (y < 1 || y > 62 || rand() < .22) continue;
    let clear = false;
    for (const loc of LOCATIONS) if (dist2(x, z, loc.x, loc.z) < (loc.kind === 'forest' ? 35 : 72)) { clear = true; break; }
    if (clear) continue;
    const biome = biomeAt(x, z, y);
    const desert = biome === 'desert'; if (desert && rand() < .92) continue;
    const scale = randRange(.64, 1.55);
    dummy.position.set(x, y + 2.2 * scale, z); dummy.rotation.set(0, rand() * Math.PI * 2, 0); dummy.scale.set(scale, scale, scale); dummy.updateMatrix();
    trunks.setMatrixAt(used, dummy.matrix); pines.setMatrixAt(used, dummy.matrix);
    const foliageColor = biome === 'snow' ? new THREE.Color('#dbe9ee') : biome === 'forest' ? new THREE.Color(rand() > .5 ? '#1c5339' : '#2a6740') : new THREE.Color(rand() > .5 ? '#2c7540' : '#428448');
    pines.setColorAt(used, foliageColor); trunks.setColorAt(used, new THREE.Color('#62452d'));
    if (usedLeaf < leafy.count && rand() < .27 && biome !== 'snow') { leafy.setMatrixAt(usedLeaf, dummy.matrix); leafy.setColorAt(usedLeaf, foliageColor); usedLeaf++; }
    used++;
  }
  trunks.count = used; pines.count = used; leafy.count = usedLeaf; scene.add(trunks, pines, leafy);

  // Rocks, boulders and desert spires.
  for (let i = 0; i < 260; i++) {
    const x = randRange(-480, 480), z = randRange(-500, 500), y = heightAt(x, z);
    if (y < 2 || y > 80) continue;
    const biome = biomeAt(x, z, y);
    if (biome === 'grass' && rand() < .72) continue;
    if (LOCATIONS.some(loc => dist2(x, z, loc.x, loc.z) < 28)) continue;
    const size = biome === 'desert' ? randRange(2, 8) : randRange(1, 5.5);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 1), new THREE.MeshStandardMaterial({ color: biome === 'snow' ? '#aebdc2' : biome === 'desert' ? '#9a6b3b' : '#666f70', roughness: 1 }));
    rock.position.set(x, y + size * .35, z); rock.rotation.set(rand(), rand(), rand()); rock.scale.set(1, randRange(.55, 1.4), randRange(.8, 1.3)); rock.castShadow = true; rock.receiveShadow = true; scene.add(rock);
  }

  // River bends through the centre, small ponds, and two lagoons.
  function waterShape(x, z, rx, rz, rotation = 0) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 44), new THREE.MeshStandardMaterial({ color: '#168eb0', roughness: .24, metalness: .18, transparent: true, opacity: .93 }));
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rotation; mesh.scale.set(rx, rz, 1); mesh.position.set(x, heightAt(x, z) + .45, z); scene.add(mesh); return mesh;
  }
  waterShape(-7, -90, 34, 65, .35); waterShape(65, 105, 27, 43, -.42); waterShape(-235, 245, 22, 36, .1); waterShape(355, 270, 28, 55, .3);
  // Decorative bridge over one narrow waterway.
  const bridge = new THREE.Group(); bridge.position.set(28, heightAt(28, -70) + 1.1, -70); bridge.rotation.y = .28; scene.add(bridge);
  const wood = new THREE.MeshStandardMaterial({ color: '#805b3c', roughness: 1 });
  makeBox(THREE, bridge, 9, .45, 22, wood, 0, 0, 0);
  for (const s of [-1, 1]) { makeBox(THREE, bridge, .35, 1.3, 22, wood, s * 4.1, .6, 0); for (let k = -4; k <= 4; k++) makeBox(THREE, bridge, .45, 1.05, .45, wood, s * 4.1, .6, k * 2.5); }

  // Empty chests randomized in clearings around the island.
  const chests = [];
  let tries = 0;
  while (chests.length < 46 && tries++ < 5000) {
    let x = randRange(-455, 455), z = randRange(-475, 475); const y = heightAt(x, z);
    if (y < 2 || y > 58 || biomeAt(x, z, y) === 'snow' && rand() < .55) continue;
    if (LOCATIONS.some(loc => dist2(x, z, loc.x, loc.z) < 18)) continue;
    if (chests.some(c => dist2(x, z, c.position.x, c.position.z) < 22)) continue;
    const chest = createChest(THREE, scene, x, z, chests.length + 1); chests.push(chest);
  }

  const waypointGroup = new THREE.Group(); scene.add(waypointGroup);
  const chestRaycaster = new THREE.Raycaster(); chestRaycaster.far = 7.5;
  const chestTargets = chests;
  const applyTextures = loaded => {
    if (loaded.grass) scene.traverse(o => { if (o.isMesh && o.material && (Array.isArray(o.material) ? o.material.some(m => m.map === texturePack.grass) : o.material.map === texturePack.grass)) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) if (m.map === texturePack.grass) { m.map = loaded.grass; m.needsUpdate = true; } } });
    if (loaded.brick) scene.traverse(o => { if (o.isMesh && o.material?.map === texturePack.brick) { o.material.map = loaded.brick; o.material.needsUpdate = true; } });
    if (loaded.metal) scene.traverse(o => { if (o.isMesh && o.material?.map === texturePack.metal) { o.material.map = loaded.metal; o.material.needsUpdate = true; } });
    if (loaded.waterNormal) { oceanMat.normalMap = loaded.waterNormal; oceanMat.needsUpdate = true; }
  };

  function findFocusedChest(camera) {
    chestRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const all = chestRaycaster.intersectObjects(chestTargets, true);
    if (!all.length) return null;
    const group = all[0].object.userData.chestGroup;
    if (!group || group.userData.chestData.opened) return null;
    const playerPos = new THREE.Vector3(); camera.getWorldPosition(playerPos);
    if (playerPos.distanceTo(group.position) > 7.2) return null;
    return group;
  }
  function updateChests(delta) {
    for (const chest of chests) {
      const data = chest.userData.chestData;
      data.lidPivot.rotation.x = THREE.MathUtils.damp(data.lidPivot.rotation.x, data.targetRotation, 6.5, delta);
    }
  }
  function openChest(chest) {
    if (!chest || chest.userData.chestData.opened) return false;
    chest.userData.chestData.opened = true; chest.userData.chestData.targetRotation = -1.65;
    chest.traverse(o => { if (o.isPointLight) { o.intensity = .15; o.distance = 2; } });
    return true;
  }
  function setWaypoints(markers) {
    while (waypointGroup.children.length) {
      const child = waypointGroup.children[0];
      waypointGroup.remove(child);
      child.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } });
    }
    for (const marker of markers) {
      const x = (marker.u - .5) * MAP_SIZE, z = (marker.v - .5) * MAP_SIZE, y = heightAt(x, z);
      const group = new THREE.Group(); group.position.set(x, Math.max(0, y), z);
      const red = new THREE.MeshBasicMaterial({ color: '#ff2424' });
      const glow = new THREE.MeshBasicMaterial({ color: '#ff2222', transparent: true, opacity: .28, side: THREE.DoubleSide });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), red); sphere.position.y = 5; group.add(sphere);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.22, .6, 11, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ff2727', transparent: true, opacity: .8 })); beam.position.y = 8.2; group.add(beam);
      const groundRing = new THREE.Mesh(new THREE.TorusGeometry(4, .24, 8, 28), red); groundRing.rotation.x = Math.PI / 2; groundRing.position.y = .35; group.add(groundRing);
      const aura = new THREE.Mesh(new THREE.CircleGeometry(6, 28), glow); aura.rotation.x = -Math.PI / 2; aura.position.y = .18; group.add(aura);
      waypointGroup.add(group);
    }
  }
  function locationNameAt(x, z) {
    let nearest = null, distance = Infinity;
    for (const loc of LOCATIONS) { const d = dist2(x, z, loc.x, loc.z); if (d < distance) { distance = d; nearest = loc; } }
    return distance < 90 ? nearest.name.toUpperCase() : 'WILDE INSEL';
  }
  return { terrain, ocean, chests, applyTextures, findFocusedChest, updateChests, openChest, setWaypoints, heightAt, locationNameAt, locations: LOCATIONS };
}
