import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

/*
 * 올드 트래포드 — 코드 생성 모델. 계단식 좌석 · 외벽 패널/기둥/WORLD CUP 배너 ·
 * 바깥 잔디 바닥 · 하늘색 배경. 경기장·라인업 같은 단위 → 선수 자동 정렬.
 */
const PITCH = { width: 15, length: 24, playerScale: 1.0 };
const S = 1.9; // 경기장 전체 확대(선수 대비). 선수 몸은 S로 역보정해 크기 유지.

function buildStadium(width, length) {
  const g = new THREE.Group();
  const HX = width / 2, HZ = length / 2, e = 0.34;
  const axI = HX + 1.3, azI = HZ + 1.5, axO = HX * 2.7, azO = HZ * 2.2;
  const RW = axO + 2.2, RZ = azO + 2.2; // 외벽 하단 반경
  const LEAN = 2.6, RWt = RW + LEAN, RZt = RZ + LEAN; // 외벽 상단이 바깥으로 기욺(경사)
  // 출입구 위치(외벽·관중석 공용): 긴 측면(±X) 2개씩 · 짧은 측면(±Z) 가운데 1개씩 · 모서리 4개
  const ENTRY = [-0.06, 0.06, Math.PI - 0.06, Math.PI + 0.06, Math.PI / 2, 3 * Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  const sq = (th, ax, az) => { const c = Math.cos(th), s = Math.sin(th); return [ax * Math.sign(c) * Math.pow(Math.abs(c), e), az * Math.sign(s) * Math.pow(Math.abs(s), e)]; };
  const hTop = (th) => 8.5 + 4.4 * Math.cos(th);
  const L = (a, b, t) => a + (b - a) * t;
  const ROWS = 22, N = 188;

  // ── 공용: 띠(밴드) 메시 — fn(frac)→[bottomXYZ, topXYZ] ──
  const band = (count, fn, mat, uvRepeat) => {
    const vp = [], vi = [], vuv = [];
    for (let i = 0; i <= count; i++) { const [b, t] = fn((i % count) / count, i / count); vp.push(b[0], b[1], b[2], t[0], t[1], t[2]); if (uvRepeat) { const uu = (1 - i / count) * uvRepeat; vuv.push(uu, 1, uu, 0); } }
    for (let k = 0; k < count; k++) { const o = k * 2; vi.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const ge = new THREE.BufferGeometry(); ge.setAttribute("position", new THREE.Float32BufferAttribute(vp, 3));
    if (uvRepeat) ge.setAttribute("uv", new THREE.Float32BufferAttribute(vuv, 2));
    ge.setIndex(vi); ge.computeVertexNormals(); const m = new THREE.Mesh(ge, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };

  // ── 계단식 좌석 보울 ──
  const prof = [[0, 0]];
  for (let m = 0; m < ROWS; m++) { prof.push([(m + 1) / ROWS, m / ROWS]); prof.push([(m + 1) / ROWS, (m + 1) / ROWS]); }
  const P = prof.length;
  const pos = [], idx = [], colA = [], red = new THREE.Color(0xc4172c), red2 = new THREE.Color(0x9c0f1c);
  for (let i = 0; i < N; i++) { const th = (i / N) * Math.PI * 2, h = hTop(th); for (let k = 0; k < P; k++) { const u = prof[k][0], v = prof[k][1], p = sq(th, L(axI, axO, u), L(azI, azO, u)); pos.push(p[0], v * h, p[1]); const c = Math.round(v * ROWS) % 2 ? red : red2; colA.push(c.r, c.g, c.b); } }
  const id = (i, k) => (i % N) * P + k;
  for (let i = 0; i < N; i++) for (let k = 0; k < P - 1; k++) { const a = id(i, k), b = id(i + 1, k), c = id(i + 1, k + 1), d = id(i, k + 1); idx.push(a, b, c, a, c, d); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const bowl = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 })); bowl.castShadow = true; bowl.receiveShadow = true; g.add(bowl);

  // ── 피치 둘레 잔디 + LED 보드 ──
  band(N, (f) => { const th = f * 2 * Math.PI, a = sq(th, HX - 0.2, HZ - 0.2), b = sq(th, axI, azI); return [[a[0], 0.02, a[1]], [b[0], 0.02, b[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x2c8033, side: THREE.DoubleSide, roughness: 1 }));
  band(N, (f) => { const th = f * 2 * Math.PI, p = sq(th, axI, azI); return [[p[0], 0.05, p[1]], [p[0], 0.62, p[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x0e1726, emissive: 0x16314a, emissiveIntensity: 0.6, side: THREE.DoubleSide }));

  // ── 앞 스커트(좌석 밑) ──
  band(N, (f) => { const th = f * 2 * Math.PI, p = sq(th, axI, azI); return [[p[0], 0.05, p[1]], [p[0], -1.5, p[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x5a1420, side: THREE.DoubleSide }));

  // ── 캔틸레버 지붕 + 좌석윗단↔지붕 막음 ──
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe7eaee, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.08 });
  band(N, (f) => { const th = f * 2 * Math.PI, y = hTop(th), pin = sq(th, axO * 0.78, azO * 0.78), pout = sq(th, RWt, RZt); return [[pin[0], y + 2.4, pin[1]], [pout[0], y + 3.2, pout[1]]]; }, roofMat);
  band(N, (f) => { const th = f * 2 * Math.PI, y = hTop(th), a = sq(th, axO, azO), b = sq(th, RWt, RZt); return [[a[0], y, a[1]], [b[0], y + 3.2, b[1]]]; }, roofMat);

  // ── 외벽: 바깥으로 기운 경사 스킨 + 콘크리트 베이스 ──
  const topY = (th) => hTop(th) + 3.2;
  const wallPt = (th, y, extra = 0) => { const f = Math.min(1, Math.max(0, y / topY(th))), p = sq(th, RW + extra + LEAN * f, RZ + extra + LEAN * f); return [p[0], y, p[1]]; };
  const boxBetween = (p1, p2, w, d, mat) => { const v1 = new THREE.Vector3(...p1), v2 = new THREE.Vector3(...p2), len = v1.distanceTo(v2); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat); m.castShadow = true; m.position.copy(v1).add(v2).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize()); g.add(m); return m; };
  band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, 0), wallPt(th, 2.2)]; }, new THREE.MeshStandardMaterial({ color: 0x8d9094, side: THREE.DoubleSide, roughness: 0.9 }));
  band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, 2.2), wallPt(th, topY(th))]; }, new THREE.MeshStandardMaterial({ color: 0x9b1c2a, side: THREE.DoubleSide, roughness: 0.85 }));

  // ── 입체 버트레스 기둥(경사 따라 기욺) ──
  const colMat = new THREE.MeshStandardMaterial({ color: 0xa7abae, roughness: 0.8 });
  const NC = 20;
  for (let k = 0; k < NC; k++) { const th = ((k + 0.5) / NC) * Math.PI * 2; boxBetween(wallPt(th, -0.3, 0.18), wallPt(th, topY(th), 0.18), 1.2, 0.5, colMat); }

  // ── WORLD CUP 배너(경사 벽에 밀착, 바깥 향함) ──
  const tt = (txt) => { const c = document.createElement("canvas"); c.width = 1024; c.height = 256; const x = c.getContext("2d"); x.clearRect(0, 0, 1024, 256); x.fillStyle = "#ffffff"; x.font = "bold 120px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, 512, 138); return new THREE.CanvasTexture(c); };
  const wcMat = new THREE.MeshStandardMaterial({ map: tt("WORLD CUP"), transparent: true, side: THREE.DoubleSide });
  for (let k = 0; k < NC; k++) { const th = (k / NC) * Math.PI * 2, c = wallPt(th, 5, 0.07); const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), wcMat); pl.position.set(c[0], c[1], c[2]); pl.lookAt(c[0] * 3, c[1], c[2] * 3); g.add(pl); }

  // ── 터널형 출입구(안쪽으로 파인 함입 + 밝은 프레임) — 외벽/관중석 공용 ──
  const tunBlack = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1 });        // 안쪽 검정
  const tunFrame = new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: 0.75, side: THREE.DoubleSide }); // 테두리 회색
  // 회색 테두리 링(구멍 뚫린 프레임) + 함입된 검은 입구. 좌석을 가려 깨짐 없음.
  const portal = (s, o, w, h) => {
    const dir = new THREE.Vector3(o[0] - s[0], o[1] - s[1], o[2] - s[2]).normalize(), f = 0.45;
    const sh = new THREE.Shape();
    sh.moveTo(-(w / 2 + f), -(h / 2 + f)); sh.lineTo(w / 2 + f, -(h / 2 + f)); sh.lineTo(w / 2 + f, h / 2 + f); sh.lineTo(-(w / 2 + f), h / 2 + f); sh.closePath();
    const ho = new THREE.Path(); ho.moveTo(-w / 2, -h / 2); ho.lineTo(w / 2, -h / 2); ho.lineTo(w / 2, h / 2); ho.lineTo(-w / 2, h / 2); ho.closePath(); sh.holes.push(ho);
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(sh), tunFrame); frame.position.set(s[0], s[1], s[2]); frame.lookAt(o[0], o[1], o[2]); g.add(frame);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), tunBlack); mouth.position.set(s[0], s[1], s[2]).addScaledVector(dir, -0.22); mouth.lookAt(o[0], o[1], o[2]); g.add(mouth);
  };
  // 외벽 문: 같은 배치
  ENTRY.forEach((th) => { const s = wallPt(th, 2.0, 0.0); portal(s, [s[0] * 3, s[1], s[2] * 3], 1.8, 2.5); });

  // ── 관중석 터널 입구(보미토리) — 외벽 문과 같은 배치, 스탠드 앞면에서 피치를 향함 ──
  ENTRY.forEach((th) => { const p = sq(th, axI + 0.05, azI + 0.05), y = 1.25; portal([p[0], y, p[1]], [0, y, 0], 1.5, 1.7); });

  // ── 주변 공원: 광장 링 + 나무 ──
  band(N, (f) => { const th = f * 2 * Math.PI, a = sq(th, RWt + 2, RZt + 2), b = sq(th, RWt + 16, RZt + 16); return [[a[0], 0.04, a[1]], [b[0], 0.04, b[1]]]; }, new THREE.MeshStandardMaterial({ color: 0xbdb7a8, side: THREE.DoubleSide, roughness: 1 }));
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x5b3a21 }), leafM = new THREE.MeshStandardMaterial({ color: 0x2f7d34, roughness: 1 });
  for (let k = 0; k < 48; k++) {
    const th = (k / 48) * Math.PI * 2 + (k % 2) * 0.065, off = k % 2 ? 9 : 14, p = sq(th, RWt + off, RZt + off);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7), trunkM); trunk.position.set(p[0], 1.2, p[1]); trunk.castShadow = true; g.add(trunk);
    const foli = new THREE.Mesh(new THREE.SphereGeometry(1.5, 9, 8), leafM); foli.position.set(p[0], 3.2, p[1]); foli.castShadow = true; g.add(foli);
  }

  // ── 외부 트러스(흰색) ──
  const strut = (mat, p1, p2, r) => { const v1 = new THREE.Vector3(...p1), v2 = new THREE.Vector3(...p2), len = v1.distanceTo(v2); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat); m.castShadow = true; m.position.copy(v1).add(v2).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize()); g.add(m); };
  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f2 });
  const steps = 36, apex = [];
  for (let k = 0; k <= steps; k++) { const th = (k / steps) * Math.PI * 2, y = hTop(th), pin = sq(th, axO * 0.78, azO * 0.78), pout = sq(th, RWt, RZt), ap = sq(th, axO + 0.5, azO + 0.5); const aH = y + 3.2 + 1.8 + 1.6 * Math.max(0, Math.cos(th)); const A = [pin[0], y + 2.4, pin[1]], B = [pout[0], y + 3.2, pout[1]], Pp = [ap[0], aH, ap[1]]; strut(white, B, Pp, 0.14); strut(white, A, Pp, 0.11); apex.push(Pp); }
  for (let k = 0; k < steps; k++) strut(white, apex[k], apex[k + 1], 0.09);

  // ── 좌석 글자 ──
  const seatTex = (txt) => { const c = document.createElement("canvas"); c.width = 2048; c.height = 256; const x = c.getContext("2d"); x.clearRect(0, 0, 2048, 256); x.fillStyle = "#fff"; x.font = "bold 170px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, 1024, 140); return new THREE.CanvasTexture(c); };
  const letters = (tc, span, u0, u1, txt) => {
    const M = 80, lp = [], luv = [], li = [];
    for (let i = 0; i <= M; i++) { const th = tc - span + span * 2 * (i / M), h = hTop(th); for (let j = 0; j <= 1; j++) { const u = j ? u1 : u0, p = sq(th, L(axI, axO, u), L(azI, azO, u)); lp.push(p[0], u * h + 0.18, p[1]); luv.push(1 - i / M, j ? 0 : 1); } }
    for (let k = 0; k < M; k++) { const b = k * 2; li.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute("uv", new THREE.Float32BufferAttribute(luv, 2)); lg.setIndex(li); lg.computeVertexNormals();
    g.add(new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: seatTex(txt), transparent: true, side: THREE.DoubleSide })));
  };
  letters(0, 0.6, 0.18, 0.34, "MANCHESTER UNITED");
  letters(Math.PI / 2, 0.46, 0.2, 0.36, "STRETFORD END");

  // ── 남측 유리 + 타워 ──
  band(14, (f) => { const th = Math.PI - 0.55 + 1.1 * f, p = sq(th, RW + 0.5, RZ + 0.5); return [[p[0], 0, p[1]], [p[0], 6.2, p[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x2f6f63, roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide }));
  const base = sq(Math.PI, RW + 0.5, RZ + 0.5);
  [-3, 3].forEach((off) => { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 9, 18), new THREE.MeshStandardMaterial({ color: 0xccd1d7, metalness: 0.3, roughness: 0.45 })); tw.castShadow = true; tw.position.set(base[0] - 0.8, 4.5, off * 1.9); g.add(tw); });

  // ── 조명탑 ──
  [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4].forEach((th) => { const p = sq(th, RW + 0.6, RZ + 0.6), y = hTop(th); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, y + 9, 10), new THREE.MeshStandardMaterial({ color: 0x9aa3ad })); pole.castShadow = true; pole.position.set(p[0], (y + 9) / 2, p[1]); g.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xdfe3e8 })); lamp.position.set(p[0], y + 9, p[1]); lamp.lookAt(0, y, 0); g.add(lamp); });

  return g;
}

function BasePitch() {
  const w = PITCH.width, l = PITCH.length, white = "#f3f3f3";
  const line = (W, Lh, x, z) => <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.03, z]}><planeGeometry args={[W, Lh]} /><meshBasicMaterial color={white} /></mesh>;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[w, l]} /><meshStandardMaterial color="#2f8a38" roughness={1} /></mesh>
      {Array.from({ length: 10 }).map((_, s) => (<mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -l / 2 + (l / 10) * (s + 0.5)]} receiveShadow><planeGeometry args={[w, l / 10]} /><meshStandardMaterial color={s % 2 ? "#37993f" : "#2c7f33"} roughness={1} /></mesh>))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[2.1, 2.24, 48]} /><meshBasicMaterial color={white} /></mesh>
      {line(w, 0.14, 0, 0)}
      {[-1, 1].map((d) => <group key={d}>{line(6.4, 0.14, 0, d * (l / 2 - 1.6))}{line(0.14, 3.2, -3.2, d * (l / 2 - 0.8))}{line(0.14, 3.2, 3.2, d * (l / 2 - 0.8))}</group>)}
      {line(0.14, l, -w / 2 + 0.08, 0)}{line(0.14, l, w / 2 - 0.08, 0)}
      {[-1, 1].map((d) => <mesh key={d} position={[0, 0.6, d * (l / 2 - 0.05)]}><boxGeometry args={[3.4, 1.2, 0.1]} /><meshStandardMaterial color="#ffffff" /></mesh>)}
    </group>
  );
}

function numTex(num, color) { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = color; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.lineWidth = 6; x.strokeStyle = "#fff"; x.stroke(); x.fillStyle = "#fff"; x.font = "bold 70px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(num ?? ""), 64, 72); return new THREE.CanvasTexture(c); }
function Player({ x, z, kit, shorts, num, face }) {
  const tex = useMemo(() => numTex(num, kit), [num, kit]);
  return (
    <group position={[x, 0, z]} rotation={[0, face, 0]} scale={PITCH.playerScale / S}>
      {[-0.17, 0.17].map((lx) => (<group key={lx}>
        <mesh position={[lx, 0.48, 0]} castShadow><cylinderGeometry args={[0.12, 0.1, 0.95, 8]} /><meshStandardMaterial color="#e7b48b" /></mesh>
        <mesh position={[lx, 0.95, 0]} castShadow><cylinderGeometry args={[0.16, 0.14, 0.4, 8]} /><meshStandardMaterial color={shorts} /></mesh>
      </group>))}
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.24, 0.28, 0.72, 10]} /><meshStandardMaterial color={kit} /></mesh>
      {[-0.32, 0.32].map((ax) => <mesh key={ax} position={[ax, 1.5, 0]} rotation={[0, 0, ax > 0 ? 0.28 : -0.28]} castShadow><cylinderGeometry args={[0.09, 0.08, 0.7, 7]} /><meshStandardMaterial color={kit} /></mesh>)}
      <mesh position={[0, 2.12, 0]} castShadow><sphereGeometry args={[0.22, 14, 14]} /><meshStandardMaterial color="#e7b48b" /></mesh>
      <mesh position={[0, 2.14, 0]}><sphereGeometry args={[0.225, 14, 10, 0, 6.3, 0, 1.7]} /><meshStandardMaterial color="#2a211b" /></mesh>
      <sprite position={[0, 2.75, 0]} scale={[0.7, 0.7, 0.7]}><spriteMaterial map={tex} depthTest={false} /></sprite>
    </group>
  );
}
function Lineup({ lineups }) {
  const placed = useMemo(() => { const hl = PITCH.length / 2; return (lineups || []).filter((p) => p.starter !== false && p.posX != null && p.posY != null).map((p) => { const home = p.home ?? p.isHome; const depth = home ? -hl + p.posX * hl : hl - p.posX * hl; const lateral = (p.posY - 0.5) * PITCH.width * (home ? 1 : -1); return { x: lateral, z: depth, kit: home ? "#c4172c" : "#ffffff", shorts: home ? "#fff" : "#111", num: p.shirt ?? p.shirtNumber, face: home ? 0 : Math.PI }; }); }, [lineups]);
  return placed.map((p, i) => <Player key={i} {...p} />);
}

const VIEWS = { 내관: { pos: [2, 16, 34], tgt: [0, 4, 0] }, 외관: { pos: [-48, 12, 6], tgt: [0, 5, 0] }, 항공: { pos: [0, 58, 40], tgt: [0, 2, 0] } };

export default function Stadium3D({ lineups, showLineup = true }) {
  const [showPlayers, setShowPlayers] = useState(showLineup);
  const stadium = useMemo(() => buildStadium(PITCH.width, PITCH.length), []);
  const camRef = useRef(), ctrlRef = useRef();
  const sc = (a) => a.map((v) => v * S);
  const view = (n) => { const v = VIEWS[n]; if (!camRef.current || !ctrlRef.current) return; camRef.current.position.set(...sc(v.pos)); ctrlRef.current.target.set(...sc(v.tgt)); ctrlRef.current.update(); };
  return (
    <div style={{ position: "relative", width: "100%", height: 480, borderRadius: 12, overflow: "hidden", background: "#bfe6fb" }}>
      <Canvas shadows camera={{ position: sc(VIEWS.내관.pos), fov: 42, near: 0.1, far: 4000 }} onCreated={({ camera }) => (camRef.current = camera)}>
        <color attach="background" args={["#bfe6fb"]} />
        <fog attach="fog" args={["#bfe6fb", 200, 440]} />
        <hemisphereLight intensity={0.6} groundColor="#5a6b3a" />
        <ambientLight intensity={0.35} />
        <directionalLight position={[60, 95, 48]} intensity={0.95} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-105} shadow-camera-right={105} shadow-camera-top={105} shadow-camera-bottom={-105} shadow-camera-near={1} shadow-camera-far={340} />
        <Suspense fallback={<Html center><span style={{ color: "#13243a" }}>로딩…</span></Html>}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow><planeGeometry args={[460, 460]} /><meshStandardMaterial color="#4a9e42" roughness={1} /></mesh>
          <group scale={S}>
            <primitive object={stadium} />
            <BasePitch />
            {showPlayers && <Lineup lineups={lineups} />}
          </group>
        </Suspense>
        <OrbitControls ref={ctrlRef} makeDefault enableDamping target={sc([0, 4, 0])} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <div style={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 6 }}>{Object.keys(VIEWS).map((n) => <button key={n} onClick={() => view(n)} style={btn}>{n}</button>)}</div>
      <button onClick={() => setShowPlayers((v) => !v)} style={{ ...btn, position: "absolute", right: 10, top: 10 }}>{showPlayers ? "라인업 숨기기" : "라인업 표시"}</button>
      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 11, color: "rgba(20,40,60,.8)" }}>Old Trafford · 코드 생성 모델</div>
    </div>
  );
}
const btn = { fontSize: 12, padding: "5px 10px", background: "rgba(255,255,255,.82)", color: "#13243a", border: "0.5px solid rgba(0,0,0,.15)", borderRadius: 6, cursor: "pointer" };
