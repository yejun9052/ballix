import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* 테이블 축구(풍지엽) — 실제 라인업 11명으로. A/D 이동 · Space 차기 · 파랑은 AI. */
const TW = 17, TL = 23, GW = 4.4, R = 0.34, WALL = 0.6, HZ = TL / 2;

function numText(num, color) {
  const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d");
  x.fillStyle = color; x.beginPath(); x.arc(48, 48, 44, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = "#fff"; x.stroke();
  x.fillStyle = "#fff"; x.font = "bold 52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(num ?? ""), 48, 52);
  return new THREE.CanvasTexture(c);
}
function ballTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#f2f2f2"; x.fillRect(0, 0, 256, 256);
  const pent = (cx, cy, r, rot) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / 5, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.closePath(); x.fillStyle = "#161616"; x.fill(); };
  [[128, 64], [54, 150], [202, 150], [128, 224], [40, 40], [216, 40], [40, 232], [216, 232]].forEach((p, i) => pent(p[0], p[1], 24, i * 0.8));
  return new THREE.CanvasTexture(c);
}
const offsetsFor = (n) => { const sp = (TW / (n + 1)) * 0.95; return Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * sp); };
const slideMaxFor = (n) => { const sp = (TW / (n + 1)) * 0.95; return Math.max(0.6, TW / 2 - ((n - 1) / 2) * sp - 0.4); };

// DB 포메이션 문자열 → 라인별 인원 배열(GK 1명 자동 prepend). 예: "4-3-3" → [1,4,3,3], "4-2-3-1" → [1,4,2,3,1].
// 없거나 못 읽으면 4-3-3로 폴백.
function parseFormation(formation) {
  const nums = String(formation || "").match(/\d+/g);
  if (nums && nums.length) {
    const outfield = nums.map(Number).filter((n) => n > 0);
    const sum = outfield.reduce((a, b) => a + b, 0);
    if (outfield.length && sum >= 6 && sum <= 10) return [1, ...outfield];  // GK + 필드 라인
  }
  return [1, 4, 3, 3];
}

// DB 포메이션·좌표로 라인 구성: posX(깊이)로 정렬해 GK→수비→미드→공격으로 묶고,
// 각 라인은 posY(좌우)로 정렬해 로드 위 좌우 순서까지 실제 라인업과 맞춘다(프론트 임의 배치 X).
function assign(players, formation) {
  const st = (players || []).filter((p) => p.starter !== false)
    .slice().sort((a, b) => (a.posX ?? 0) - (b.posX ?? 0));
  const lines = parseFormation(formation), out = [];
  let i = 0;
  lines.forEach((c) => {
    const g = st.slice(i, i + c).sort((a, b) => (a.posY ?? 0.5) - (b.posY ?? 0.5)); // 좌→우
    while (g.length < c) g.push(null);
    out.push(g);
    i += c;
  });
  return out;
}

function Figure({ color, num, badge }) {
  const tex = useMemo(() => numText(num, badge || color), [num, badge, color]);
  return (
    <group>
      <mesh position={[0, -0.78, 0]} castShadow><boxGeometry args={[0.36, 1.95, 0.34]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.28, 0]} castShadow><sphereGeometry args={[0.3, 14, 10]} /><meshStandardMaterial color="#e7b48b" /></mesh>
      <mesh position={[0, -1.85, 0.14]} castShadow><boxGeometry args={[0.5, 0.42, 0.8]} /><meshStandardMaterial color={color} /></mesh>
      {num != null && <sprite position={[0, 1.0, 0]} scale={[0.7, 0.7, 0.7]}><spriteMaterial map={tex} depthTest={false} /></sprite>}
    </group>
  );
}

function Table() {
  const seg = (w, d, x, z) => <mesh position={[x, 0.5, z]} castShadow receiveShadow><boxGeometry args={[w, 1.2, d]} /><meshStandardMaterial color="#8a5a2b" roughness={0.8} /></mesh>;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[TW, TL]} /><meshStandardMaterial color="#1f7d3a" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><planeGeometry args={[TW, 0.12]} /><meshBasicMaterial color="#cfe8d6" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[1.7, 1.82, 40]} /><meshBasicMaterial color="#cfe8d6" side={THREE.DoubleSide} /></mesh>
      <mesh position={[-TW / 2 - WALL / 2, 0.6, 0]} castShadow><boxGeometry args={[WALL, 1.4, TL + 2 * WALL]} /><meshStandardMaterial color={0x7c4f26} roughness={0.8} /></mesh>
      <mesh position={[TW / 2 + WALL / 2, 0.6, 0]} castShadow><boxGeometry args={[WALL, 1.4, TL + 2 * WALL]} /><meshStandardMaterial color={0x7c4f26} roughness={0.8} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          {seg((TW - GW) / 2, WALL, -(GW + (TW - GW) / 2) / 2, s * (TL / 2 + WALL / 2))}
          {seg((TW - GW) / 2, WALL, (GW + (TW - GW) / 2) / 2, s * (TL / 2 + WALL / 2))}
          <mesh position={[0, 0.5, s * (TL / 2 + WALL)]}><boxGeometry args={[GW, 1.0, 0.15]} /><meshStandardMaterial color={s > 0 ? 0x1850c0 : 0xc4172c} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Game({ rdefs, onScore }) {
  const ball = useRef();
  const bv = useRef({ x: 0, z: 0 });
  const rods = useRef(rdefs.map(() => ({ grp: null, slide: 0, rot: 0, rvel: 0 })));
  const keys = useRef({}), kick = useRef(false), ac = useRef(), hi = useRef();
  const btex = useMemo(() => ballTex(), []);
  const beep = (f, d, type = "square", vol = 0.05) => {
    try {
      if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)();
      const a = ac.current; if (a.state === "suspended") a.resume();
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = vol; o.connect(g); g.connect(a.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d); o.stop(a.currentTime + d);
    } catch { return; }
  };
  useEffect(() => {
    bv.current = { x: (Math.random() - 0.5) * 6, z: (Math.random() < 0.5 ? -1 : 1) * 5 };
    const act = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"];
    const dn = (e) => { keys.current[e.code] = true; if (["ArrowUp", "KeyW", "Space"].includes(e.code)) kick.current = true; if (act.includes(e.code)) e.preventDefault(); };
    const up = (e) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);
  useFrame((_, dt) => {
    if (!ball.current) return;
    const step = Math.min(dt, 0.04), k = keys.current, rr = rods.current, p = ball.current.position, v = bv.current;
    // 화면(레드 골대 시점) 기준: → 가 화면 오른쪽(=월드 -x)
    const dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    // 활성 빨강 로드 = 공 z에 가장 가까운 것(자동 전환)
    let active = -1, best = 1e9, activeB = -1, bestB = 1e9;
    rdefs.forEach((rd, i) => { const d = Math.abs(rd.z - p.z); if (rd.team === 1) { if (d < best) { best = d; active = i; } } else if (d < bestB) { bestB = d; activeB = i; } });
    rdefs.forEach((rd, i) => {
      const r = rr[i];
      if (rd.team === 1) {
        if (i === active) { r.slide = THREE.MathUtils.clamp(r.slide - dir * 12 * step, -rd.smax, rd.smax); if (kick.current) r.rvel = -18; }
      } else if (i === activeB) {
        // 상대 AI도 활성 로드 1개만 추적·킥
        const aim = THREE.MathUtils.clamp(p.x + v.x * 0.15, -rd.smax, rd.smax);
        r.slide += THREE.MathUtils.clamp(aim - r.slide, -12 * step, 12 * step);
        const reach = rd.offs.some((o) => Math.abs(p.x - (r.slide + o)) < 1.1);
        if (Math.abs(p.z - rd.z) < 1.7 && reach && Math.abs(r.rvel) < 3) { r.rvel = -16 * rd.team; beep(150, 0.06); }
      }
      r.rvel += -r.rot * 80 * step; r.rvel *= Math.pow(0.012, step); r.rot = THREE.MathUtils.clamp(r.rot + r.rvel * step, -1.6, 1.6);
      if (r.grp) { r.grp.position.x = r.slide; r.grp.rotation.x = r.rot; }
    });
    if (hi.current && active >= 0) hi.current.position.z = rdefs[active].z;
    if (kick.current) beep(200, 0.07);
    kick.current = false;
    p.x += v.x * step; p.z += v.z * step;
    v.x *= Math.pow(0.35, step); v.z *= Math.pow(0.35, step);
    const HX = TW / 2 - R + 0.05;
    if (p.x < -HX) { p.x = -HX; v.x = Math.abs(v.x) * 0.65; beep(360, 0.04); }
    if (p.x > HX) { p.x = HX; v.x = -Math.abs(v.x) * 0.65; beep(360, 0.04); }
    if (Math.abs(p.z) > HZ - R) {
      if (Math.abs(p.x) < GW / 2) { onScore(p.z > 0 ? "red" : "blue"); beep(520, 0.12, "sawtooth", 0.07); setTimeout(() => beep(740, 0.14, "sawtooth", 0.07), 110); p.set(0, R, 0); v.x = (Math.random() - 0.5) * 6; v.z = (Math.random() < 0.5 ? -1 : 1) * 5; }
      else { p.z = Math.sign(p.z) * (HZ - R); v.z *= -0.65; beep(360, 0.04); }
    }
    rdefs.forEach((rd, i) => {
      const r = rr[i], kicking = Math.abs(r.rvel) > 5;
      if (Math.abs(p.z - rd.z) > 1.05) return;
      rd.offs.forEach((off) => {
        const fx = r.slide + off;
        if (Math.abs(p.x - fx) < 0.95) {
          if (kicking) { v.z = rd.team * 15; v.x += (p.x - fx) * 5 + (Math.random() - 0.5) * 7; beep(140, 0.06); }
          else { v.z = (p.z >= rd.z ? 1 : -1) * Math.max(3.5, Math.abs(v.z) * 0.7); v.x += (Math.random() - 0.5) * 3; p.z = rd.z + (p.z >= rd.z ? 0.9 : -0.9); }
        }
      });
    });
    ball.current.rotation.x += v.z * step / R; ball.current.rotation.z -= v.x * step / R;
  });
  return (
    <>
      <mesh ref={hi} position={[0, 2.7, 0]}><boxGeometry args={[TW + 1, 0.14, 0.55]} /><meshStandardMaterial color="#ffd400" emissive="#aa8800" emissiveIntensity={0.5} /></mesh>
      <mesh ref={ball} position={[0, R, 0]} castShadow><sphereGeometry args={[R, 26, 18]} /><meshStandardMaterial map={btex} roughness={0.45} /></mesh>
      {rdefs.map((rd, i) => {
        const col = rd.team === 1 ? "#c4172c" : "#1850c0";
        return (
          <group key={i} position={[0, 2.0, rd.z]} ref={(el) => (rods.current[i].grp = el)}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.11, 0.11, TW + 4, 10]} /><meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.3} /></mesh>
            {[-1, 1].map((s) => <mesh key={s} position={[s * (TW / 2 + 1.6), 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.28, 0.28, 0.8, 10]} /><meshStandardMaterial color="#222" /></mesh>)}
            {rd.offs.map((off, j) => { const pl = rd.players[j]; return <group key={j} position={[off, 0, 0]}><Figure color={col} num={pl ? (pl.shirt ?? pl.shirtNumber) : null} badge={col} /></group>; })}
          </group>
        );
      })}
    </>
  );
}

export default function Foosball({ lineups, homeFormation, awayFormation }) {
  const rdefs = useMemo(() => {
    const home = (lineups || []).filter((p) => p.home ?? p.isHome), away = (lineups || []).filter((p) => !(p.home ?? p.isHome));
    const h = assign(home, homeFormation), a = assign(away, awayFormation);
    // 각 팀의 라인 수(포메이션)에 맞춰 로드 z를 동적으로 배치 — 홈은 -z(자기 골문)에서 공격(+z),
    // 원정은 +z에서 공격(-z). 라인 수가 4가 아니어도(예: 4-2-3-1=5라인) 그대로 반영된다.
    const reach = 2.0, homeGoal = -(HZ - 1.5), awayGoal = HZ - 1.5;
    const lerp = (p, q, t) => p + (q - p) * t;
    const rods = [];
    h.forEach((players, i) => rods.push({ z: lerp(homeGoal, reach, h.length > 1 ? i / (h.length - 1) : 0), team: 1, players }));
    a.forEach((players, i) => rods.push({ z: lerp(awayGoal, -reach, a.length > 1 ? i / (a.length - 1) : 0), team: -1, players }));
    rods.sort((p, q) => p.z - q.z);
    return rods.map((rd) => ({ ...rd, offs: offsetsFor(rd.players.length), smax: slideMaxFor(rd.players.length) }));
  }, [lineups, homeFormation, awayFormation]);
  const [red, setRed] = useState(0), [blue, setBlue] = useState(0), [flash, setFlash] = useState("");
  const ft = useRef();
  const onScore = (who) => { if (who === "red") setRed((s) => s + 1); else setBlue((s) => s + 1); setFlash(who === "red" ? "🔴 RED 골!" : "🔵 BLUE 골!"); clearTimeout(ft.current); ft.current = setTimeout(() => setFlash(""), 1200); };
  return (
    <div style={{ position: "relative", width: "100%", height: 480, borderRadius: 12, overflow: "hidden", background: "#cdb89a" }}>
      <Canvas shadows camera={{ position: [0, 26, -15], fov: 46 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0.5)}>
        <color attach="background" args={["#cdb89a"]} />
        <hemisphereLight intensity={0.7} groundColor="#5a4a30" />
        <directionalLight position={[6, 24, 4]} intensity={1.0} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <Table />
        <Game rdefs={rdefs} onScore={onScore} />
      </Canvas>
      <div style={{ position: "absolute", left: 0, right: 0, top: 10, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#3a2a14" }}>
        <span style={{ color: "#c4172c" }}>홈 {red}</span> : <span style={{ color: "#1850c0" }}>{blue} 원정</span>
      </div>
      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 12, color: "rgba(40,30,15,.85)" }}>←/→ 활성 로드 이동 · ↑(또는 Space) 차기 · 노란 표시 = 조작 중인 열(공 따라 자동 전환) · 원정=AI</div>
      {flash && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ fontSize: 44, fontWeight: 800, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>{flash}</span></div>}
    </div>
  );
}
