import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

/*
 * 올드 트래포드 — 코드 생성 모델. 계단식 좌석 · 외벽 패널/기둥/WORLD CUP 배너 ·
 * 바깥 잔디 바닥 · 하늘색 배경. 경기장·라인업 같은 단위 → 선수 자동 정렬.
 */
const PITCH = { width: 15, length: 24, playerScale: 1.0 };
const S = 1.9; // 경기장 전체 확대(선수 대비). 선수 몸은 S로 역보정해 크기 유지.

function buildStadium(width, length) {
  const g = new THREE.Group();
  const HX = width / 2, HZ = length / 2, e = 0.34;
  const axI = HX + 2.7, azI = HZ + 3.1, axO = HX * 2.9, azO = HZ * 2.35;
  const RW = axO + 2.2, RZ = azO + 2.2; // 외벽 하단 반경
  const LEAN = 2.6, RWt = RW + LEAN, RZt = RZ + LEAN; // 외벽 상단이 바깥으로 기욺(경사)
  // 출입구 위치(외벽·관중석 공용): 긴 측면(±X) 2개씩 · 짧은 측면(±Z) 가운데 1개씩 · 모서리 4개
  const ENTRY = [-0.06, 0.06, Math.PI - 0.06, Math.PI + 0.06, Math.PI / 2, 3 * Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  const sq = (th, ax, az) => { const c = Math.cos(th), s = Math.sin(th); return [ax * Math.sign(c) * Math.pow(Math.abs(c), e), az * Math.sign(s) * Math.pow(Math.abs(s), e)]; };
  const hTop = () => 10.5; // 사방 일정 높이(비대칭 슬로프 제거)
  const L = (a, b, t) => a + (b - a) * t;
  // 벽 면의 바깥 법선(xz) — 출입구가 벽에 수직(정면)으로 향하게
  const wallNorm = (th, ax, az) => { const d = 0.012, a = sq(th - d, ax, az), b = sq(th + d, ax, az), tx = b[0] - a[0], tz = b[1] - a[1], len = Math.hypot(tx, tz) || 1; return [tz / len, -tx / len]; };
  const ROWS = 32, N = 188;

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
  const MC = 9, U_LOW = 0.40, SB = 0.18, U_UP0 = U_LOW + SB; // 콘코스: 6행 높이 · 하부끝 u0.40 · 안쪽 셋백 0.18(≈2~3칸)
  const prof = [[0, 0]];
  const sLow = U_LOW / MC, sUp = (1 - U_UP0) / (ROWS - MC);
  for (let m = 0; m < MC; m++) { prof.push([(m + 1) * sLow, m / ROWS]); prof.push([(m + 1) * sLow, (m + 1) / ROWS]); }
  prof.push([U_UP0, MC / ROWS]); // 콘코스 평지: 같은 높이에서 안쪽으로 들어간 회색 통로(셋백)
  for (let m = 0; m < ROWS - MC; m++) { prof.push([U_UP0 + (m + 1) * sUp, (MC + m) / ROWS]); prof.push([U_UP0 + (m + 1) * sUp, (MC + m + 1) / ROWS]); }
  const P = prof.length;
  const pos = [], idx = [], colA = [], red = new THREE.Color(0xc4172c), red2 = new THREE.Color(0x9c0f1c), concourse = new THREE.Color(0x6f747b), adBoard = new THREE.Color(0x14397a);
  for (let i = 0; i < N; i++) { const th = (i / N) * Math.PI * 2, h = hTop(th); for (let k = 0; k < P; k++) { const u = prof[k][0], v = prof[k][1], p = sq(th, L(axI, axO, u), L(azI, azO, u)); pos.push(p[0], v * h, p[1]); let c; if (v < 0.05) c = adBoard; else if (u >= U_LOW - 0.001 && u <= U_UP0 + 0.001) c = concourse; else c = Math.round(v * ROWS) % 2 ? red : red2; colA.push(c.r, c.g, c.b); } }
  const id = (i, k) => (i % N) * P + k;
  for (let i = 0; i < N; i++) for (let k = 0; k < P - 1; k++) { const a = id(i, k), b = id(i + 1, k), c = id(i + 1, k + 1), d = id(i, k + 1); idx.push(a, b, c, a, c, d); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const bowlMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, flatShading: true });
  // CSG: 좌석에 박스를 빼서 출입구 구멍을 진짜로 뚫는다(계단·빨강이 실제로 제거됨).
  let bowl;
  try {
    const ev = new Evaluator(); ev.attributes = ["position", "normal", "color"]; ev.useGroups = false;
    let res = new Brush(bg.toNonIndexed()); res.updateMatrixWorld();
    const cutY = (MC / ROWS) * hTop() + 1.1;
    ENTRY.forEach((th) => {
      const p0 = sq(th, L(axI, axO, U_UP0), L(azI, azO, U_UP0)), n = wallNorm(th, axI, azI);
      const cg = new THREE.BoxGeometry(1.7, 2.2, 2.6); cg.deleteAttribute("uv");
      cg.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(cg.attributes.position.count * 3).fill(0.04), 3));
      const cut = new Brush(cg);
      cut.position.set(p0[0] + n[0] * 1.25, cutY, p0[1] + n[1] * 1.25);
      cut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], 0, n[1]).normalize());
      cut.updateMatrixWorld();
      res = ev.evaluate(res, cut, SUBTRACTION);
    });
    bowl = res; bowl.material = bowlMat;
  } catch { bowl = new THREE.Mesh(bg, bowlMat); }
  bowl.castShadow = true; bowl.receiveShadow = true; g.add(bowl);

  // ── 피치 둘레 넓은 트랙(회색) + 파란 광고판 ──
  band(N, (f) => { const th = f * 2 * Math.PI, a = sq(th, HX - 0.4, HZ - 0.4), b = sq(th, axI, azI); return [[a[0], 0.008, a[1]], [b[0], 0.008, b[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x9a9c95, side: THREE.DoubleSide, roughness: 1 }));
  const adTex = (() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 128; const x = c.getContext("2d");
    const ads = [["#0b3d91", "HYUNDAI"], ["#e1140a", "Coca-Cola"], ["#0a0a0a", "adidas"], ["#1a3a8f", "VISA"], ["#4d0f86", "FedEx"], ["#7a0a14", "Qatar Airways"], ["#003087", "SONY"], ["#0e7a3a", "EA SPORTS"]];
    const w = c.width / ads.length;
    ads.forEach((a, i) => { x.fillStyle = a[0]; x.fillRect(i * w, 0, w, c.height); x.fillStyle = "#fff"; x.font = "bold 30px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(a[1], i * w + w / 2, c.height / 2); });
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
  })();
  band(N, (f) => { const th = f * 2 * Math.PI, p = sq(th, axI, azI); return [[p[0], 0.05, p[1]], [p[0], 1.05, p[1]]]; }, new THREE.MeshStandardMaterial({ map: adTex, emissive: 0x2a2a2a, side: THREE.DoubleSide }), 5);

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
  // 3단 파사드: 콘크리트 베이스 / 유리 띠(함입) / 상부 붉은 패널
  band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, 0), wallPt(th, 2.6)]; }, new THREE.MeshStandardMaterial({ color: 0x8d9094, side: THREE.DoubleSide, roughness: 0.9 }));
  band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, 2.6, -0.12), wallPt(th, 4.5, -0.12)]; }, new THREE.MeshStandardMaterial({ color: 0x20323f, metalness: 0.55, roughness: 0.12, side: THREE.DoubleSide }));
  band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, 4.5), wallPt(th, topY(th))]; }, new THREE.MeshStandardMaterial({ color: 0x9b1c2a, side: THREE.DoubleSide, roughness: 0.85 }));
  // 돌출 가로 코니스(층 구분 띠) — 입체감
  const corn = new THREE.MeshStandardMaterial({ color: 0xc0c3c7, roughness: 0.8, side: THREE.DoubleSide });
  [2.6, 4.5].forEach((yy) => {
    band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, yy, 0.0), wallPt(th, yy, 0.42)]; }, corn);
    band(N, (f) => { const th = f * 2 * Math.PI; return [wallPt(th, yy - 0.32, 0.42), wallPt(th, yy, 0.42)]; }, corn);
  });
  // 유리 수직 멀리언(창틀 격자)
  const mullMat = new THREE.MeshStandardMaterial({ color: 0x9398a0, roughness: 0.7 });
  for (let k = 0; k < 80; k++) { const th = (k / 80) * Math.PI * 2, c = wallPt(th, 3.55, -0.03); const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.85, 0.14), mullMat); m.position.set(c[0], c[1], c[2]); m.rotation.y = Math.atan2(c[0], c[2]); g.add(m); }
  // 상부 붉은 패널 수직 분할선
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x6c1320, roughness: 0.95 });
  for (let k = 0; k < 44; k++) { const th = (k / 44) * Math.PI * 2, yc = (4.5 + topY(th)) / 2, c = wallPt(th, yc, 0.03); const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, topY(th) - 4.6, 0.1), seamMat); m.position.set(c[0], c[1], c[2]); m.rotation.y = Math.atan2(c[0], c[2]); g.add(m); }
  // 출입구 차양(캐노피)
  const canMat = new THREE.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.8 });
  ENTRY.forEach((th) => { const c = wallPt(th, 2.9, 0.0), n = wallNorm(th, RW, RZ); const can = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 1.5), canMat); can.position.set(c[0] + n[0] * 0.7, c[1], c[2] + n[1] * 0.7); can.rotation.y = Math.atan2(n[0], n[1]); can.castShadow = true; g.add(can); });

  // ── 입체 버트레스 기둥(경사 따라 기욺) ──
  const colMat = new THREE.MeshStandardMaterial({ color: 0xa7abae, roughness: 0.8 });
  const NC = 20;
  for (let k = 0; k < NC; k++) { const th = ((k + 0.5) / NC) * Math.PI * 2; boxBetween(wallPt(th, -0.3, 0.18), wallPt(th, topY(th), 0.18), 1.2, 0.5, colMat); }

  // ── WORLD CUP 배너(경사 벽에 밀착, 바깥 향함) ──
  const tt = (txt) => { const c = document.createElement("canvas"); c.width = 1024; c.height = 256; const x = c.getContext("2d"); x.clearRect(0, 0, 1024, 256); x.fillStyle = "#ffffff"; x.font = "bold 120px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, 512, 138); return new THREE.CanvasTexture(c); };
  const wcMat = new THREE.MeshStandardMaterial({ map: tt("WORLD CUP"), transparent: true, side: THREE.DoubleSide });
  for (let k = 0; k < NC; k++) { const th = (k / NC) * Math.PI * 2, c = wallPt(th, 5, 0.07); const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), wcMat); pl.position.set(c[0], c[1], c[2]); pl.lookAt(c[0] * 3, c[1], c[2] * 3); g.add(pl); }

  // ── 터널형 출입구(안쪽으로 파인 함입 + 밝은 프레임) — 외벽/관중석 공용 ──
  const tunBlack = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1, side: THREE.DoubleSide }); // 안쪽 검정
  const tunFrame = new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: 0.75, side: THREE.DoubleSide }); // 테두리 회색
  // 회색 테두리 링(구멍 뚫린 프레임) + 함입된 검은 입구. 좌석을 가려 깨짐 없음.
  // 검은 입구(표면, 가림) + 앞쪽으로 돌출한 회색 프레임 링 → 안으로 들어간 느낌. o=정면(벽 법선) 방향.
  const portal = (s, o, w, h) => {
    const dir = new THREE.Vector3(o[0] - s[0], o[1] - s[1], o[2] - s[2]).normalize(), f = 0.4;
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), tunBlack);
    mouth.position.set(s[0], s[1], s[2]).addScaledVector(dir, 0.04); mouth.lookAt(o[0], o[1], o[2]); g.add(mouth);
    const sh = new THREE.Shape();
    sh.moveTo(-(w / 2 + f), -(h / 2 + f)); sh.lineTo(w / 2 + f, -(h / 2 + f)); sh.lineTo(w / 2 + f, h / 2 + f); sh.lineTo(-(w / 2 + f), h / 2 + f); sh.closePath();
    const ho = new THREE.Path(); ho.moveTo(-w / 2, -h / 2); ho.lineTo(w / 2, -h / 2); ho.lineTo(w / 2, h / 2); ho.lineTo(-w / 2, h / 2); ho.closePath(); sh.holes.push(ho);
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(sh), tunFrame); frame.position.set(s[0], s[1], s[2]).addScaledVector(dir, 0.28); frame.lookAt(o[0], o[1], o[2]); g.add(frame);
  };
  // 외벽 문: 같은 배치, 벽에 정면, 중앙보다 약간 아래
  ENTRY.forEach((th) => { const s = wallPt(th, 1.7, 0.0), n = wallNorm(th, RW, RZ); portal(s, [s[0] + n[0] * 3, s[1], s[2] + n[1] * 3], 1.8, 2.4); });

  // ── 관중석 출입구: CSG로 뚫린 구멍 안에 어두운 함입 + 회색 테두리 ──
  const tunWall = new THREE.MeshStandardMaterial({ color: 0x8d9094, side: THREE.DoubleSide, roughness: 0.95 }); // 안쪽 회색 벽
  ENTRY.forEach((th) => {
    const p0 = sq(th, L(axI, axO, U_UP0), L(azI, azO, U_UP0)), n = wallNorm(th, axI, azI), y = (MC / ROWS) * hTop() + 1.1;
    const w = 1.85, h = 2.35, D = 2.4;
    const grp = new THREE.Group(); grp.position.set(p0[0], y, p0[1]);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], 0, n[1]).normalize());
    const wall = (geo, rx, ry, px, py, pz, mat) => { const m = new THREE.Mesh(geo, mat); m.rotation.set(rx, ry, 0); m.position.set(px, py, pz); grp.add(m); };
    wall(new THREE.PlaneGeometry(w, D), -Math.PI / 2, 0, 0, -h / 2, D / 2, tunWall); // 바닥
    wall(new THREE.PlaneGeometry(w, D), Math.PI / 2, 0, 0, h / 2, D / 2, tunWall);    // 천장
    wall(new THREE.PlaneGeometry(D, h), 0, Math.PI / 2, -w / 2, 0, D / 2, tunWall);   // 좌측벽
    wall(new THREE.PlaneGeometry(D, h), 0, -Math.PI / 2, w / 2, 0, D / 2, tunWall);   // 우측벽
    wall(new THREE.PlaneGeometry(w, h), 0, 0, 0, 0, D, tunBlack);                     // 안쪽 검은 문
    g.add(grp);
    const fw = w + 0.04, fh = h + 0.04, ff = 0.3, sh = new THREE.Shape();
    sh.moveTo(-(fw / 2 + ff), -(fh / 2 + ff)); sh.lineTo(fw / 2 + ff, -(fh / 2 + ff)); sh.lineTo(fw / 2 + ff, fh / 2 + ff); sh.lineTo(-(fw / 2 + ff), fh / 2 + ff); sh.closePath();
    const hl = new THREE.Path(); hl.moveTo(-fw / 2, -fh / 2); hl.lineTo(fw / 2, -fh / 2); hl.lineTo(fw / 2, fh / 2); hl.lineTo(-fw / 2, fh / 2); hl.closePath(); sh.holes.push(hl);
    const fr = new THREE.Mesh(new THREE.ShapeGeometry(sh), tunFrame); fr.position.set(p0[0] - n[0] * 0.05, y, p0[1] - n[1] * 0.05); fr.lookAt(p0[0] - n[0] * 3, y, p0[1] - n[1] * 3); g.add(fr);
  });

  // ── 주변 공원: 광장 링 + 나무 ──
  band(N, (f) => { const th = f * 2 * Math.PI, a = sq(th, RWt + 2, RZt + 2), b = sq(th, RWt + 16, RZt + 16); return [[a[0], 0.04, a[1]], [b[0], 0.04, b[1]]]; }, new THREE.MeshStandardMaterial({ color: 0xbdb7a8, side: THREE.DoubleSide, roughness: 1 }));
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x5b3a21 }), leafM = new THREE.MeshStandardMaterial({ color: 0x2f7d34, roughness: 1 });
  for (let k = 0; k < 48; k++) {
    const th = (k / 48) * Math.PI * 2 + (k % 2) * 0.065, off = k % 2 ? 9 : 14, p = sq(th, RWt + off, RZt + off);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7), trunkM); trunk.position.set(p[0], 1.2, p[1]); trunk.castShadow = true; g.add(trunk);
    const foli = new THREE.Mesh(new THREE.SphereGeometry(1.5, 9, 8), leafM); foli.position.set(p[0], 3.2, p[1]); foli.castShadow = true; g.add(foli);
  }

  // ── 주변: 순환 도로 + 차선 + 가로등 + 건물 + 조형물 ──
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.4, roughness: 0.4 });
  // 순환 도로(아스팔트)
  band(N, (f) => { const th = f * 2 * Math.PI, a = sq(th, RWt + 17, RZt + 17), b = sq(th, RWt + 23, RZt + 23); return [[a[0], 0.05, a[1]], [b[0], 0.05, b[1]]]; }, new THREE.MeshStandardMaterial({ color: 0x33363b, side: THREE.DoubleSide, roughness: 1 }));
  // 중앙 차선(점선)
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xdcd676, roughness: 1 });
  for (let k = 0; k < 140; k++) { if (k % 2) continue; const th = (k / 140) * Math.PI * 2, p = sq(th, RWt + 20, RZt + 20); const d = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.18), laneMat); d.position.set(p[0], 0.07, p[1]); d.rotation.y = Math.atan2(p[0], p[1]); g.add(d); }
  // 가로등
  for (let k = 0; k < 28; k++) { const th = (k / 28) * Math.PI * 2, p = sq(th, RWt + 16.2, RZt + 16.2); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), metal); pole.position.set(p[0], 2.5, p[1]); g.add(pole); const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 0.45 })); head.position.set(p[0], 5.0, p[1]); g.add(head); }
  // 주변 건물
  const bcol = [0x8a9099, 0x6f7d8c, 0x9aa0a6, 0x55687a, 0x7a8088, 0x4a6a86];
  for (let k = 0; k < 50; k++) { const th = (k / 50) * Math.PI * 2 + (k % 3) * 0.045, off = 27 + (k % 4) * 7, p = sq(th, RWt + off, RZt + off); const hgt = 6 + Math.random() * Math.random() * 24, w = 3 + Math.random() * 3.5, d = 3 + Math.random() * 3.5; const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshStandardMaterial({ color: bcol[(Math.random() * bcol.length) | 0], roughness: 0.85 })); b.position.set(p[0], hgt / 2, p[1]); b.rotation.y = Math.atan2(p[0], p[1]); b.castShadow = true; g.add(b); }
  // 조형물: 월드컵 트로피 (남측 광장, 받침 위)
  const mp = sq(Math.PI, RWt + 11, RZt + 11);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.5, 2.6, 20), new THREE.MeshStandardMaterial({ color: 0xb6bac0, roughness: 0.8 })); ped.position.set(mp[0], 1.3, mp[1]); ped.castShadow = true; g.add(ped);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b43c, metalness: 0.95, roughness: 0.22 });
  const malachite = new THREE.MeshStandardMaterial({ color: 0x0d6b3a, metalness: 0.45, roughness: 0.4 });
  const tro = new THREE.Group(); tro.position.set(mp[0], 2.6, mp[1]); tro.scale.setScalar(0.85);
  const tb1 = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.5, 24), malachite); tb1.position.y = 0.25; tro.add(tb1);
  const tb2 = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.25, 0.35, 24), malachite); tb2.position.y = 0.62; tro.add(tb2);
  const tprof = [[1.0, 0.82], [0.66, 1.15], [0.42, 1.9], [0.36, 2.9], [0.52, 3.5], [0.98, 4.05], [1.28, 4.45], [1.12, 4.72], [0.66, 4.88]].map((p) => new THREE.Vector2(p[0], p[1]));
  const tbody = new THREE.Mesh(new THREE.LatheGeometry(tprof, 30), gold); tro.add(tbody);
  const tglobe = new THREE.Mesh(new THREE.SphereGeometry(1.12, 24, 18), gold); tglobe.position.y = 5.65; tro.add(tglobe);
  tro.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(tro);
  // 깃대(남측 포어코트 앞 줄지어)
  const flagCols = [0xc4172c, 0x1a4ea8, 0xf0c020, 0x18a050, 0xffffff, 0x101418];
  for (let k = 0; k < 14; k++) { const th = Math.PI - 0.45 + 0.069 * k, p = sq(th, RWt + 9, RZt + 9), tg = wallNorm(th, RWt, RZt); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 9, 8), metal); pole.position.set(p[0], 4.5, p[1]); pole.castShadow = true; g.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshStandardMaterial({ color: flagCols[k % flagCols.length], side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(p[0] - tg[1] * 0.85, 8.1, p[1] + tg[0] * 0.85); flag.rotation.y = Math.atan2(tg[0], tg[1]); g.add(flag); }

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

// 실측 FIFA 규격(m) → 단위 스케일로 환산한 흰 선 일체
function BasePitch() {
  const W = PITCH.width, Ln = PITCH.length, HW = W / 2, HL = Ln / 2, white = "#f4f4f4", LY = 0.04, T = 0.12;
  const sx = W / 68, sz = Ln / 105; // 폭 68m / 길이 105m 기준
  const line = (w, l, x, z, k) => <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x, LY, z]}><planeGeometry args={[w, l]} /><meshBasicMaterial color={white} /></mesh>;
  const disc = (r, x, z, k) => <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x, LY, z]}><circleGeometry args={[r, 24]} /><meshBasicMaterial color={white} /></mesh>;
  const ring = (ri, ro, x, z, a0, span, k) => <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x, LY, z]}><ringGeometry args={[ri, ro, 48, 1, a0, span]} /><meshBasicMaterial color={white} side={THREE.DoubleSide} /></mesh>;
  const arc = (x, z, r, dx, dz, span, k) => { const a = Math.atan2(-dz, dx); return ring(r - 0.1, r, x, z, a - span / 2, span, k); };
  const pa = 16.5 * sz, paW = (40.32 * sx) / 2, ga = 5.5 * sz, gaW = (18.32 * sx) / 2, psp = 11 * sz, cr = 9.15 * sx, gW = (7.32 * sx) / 2;
  const ends = [-1, 1].map((s) => {
    const gz = s * HL, d = -s; // d = 필드 안쪽 방향
    return (
      <group key={"e" + s}>
        {line(2 * paW, T, 0, gz + d * pa, "pf")}{line(T, pa, -paW, gz + (d * pa) / 2, "pl")}{line(T, pa, paW, gz + (d * pa) / 2, "pr")}
        {line(2 * gaW, T, 0, gz + d * ga, "gf")}{line(T, ga, -gaW, gz + (d * ga) / 2, "gl")}{line(T, ga, gaW, gz + (d * ga) / 2, "gr")}
        {disc(0.1, 0, gz + d * psp, "ps")}
        {arc(0, gz + d * psp, cr, 0, d, 1.78, "d")}
        <mesh key="gp1" position={[-gW, 0.45, gz]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh key="gp2" position={[gW, 0.45, gz]}><boxGeometry args={[0.12, 0.9, 0.12]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh key="gc" position={[0, 0.9, gz]}><boxGeometry args={[2 * gW + 0.12, 0.12, 0.12]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh key="gn" position={[0, 0.45, gz - d * 0.5]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2 * gW, 0.9]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={THREE.DoubleSide} /></mesh>
      </group>
    );
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[W, Ln]} /><meshStandardMaterial color="#2f8a38" roughness={1} /></mesh>
      {Array.from({ length: 12 }).map((_, i) => <mesh key={"st" + i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, -HL + (Ln / 12) * (i + 0.5)]} receiveShadow><planeGeometry args={[W, Ln / 12]} /><meshStandardMaterial color={i % 2 ? "#37993f" : "#2c7f33"} roughness={1} /></mesh>)}
      {line(T, Ln, -HW, 0, "tl")}{line(T, Ln, HW, 0, "tr")}{line(W, T, 0, -HL, "g0")}{line(W, T, 0, HL, "g1")}
      {line(W, T, 0, 0, "half")}
      {ring(cr - 0.1, cr, 0, 0, 0, Math.PI * 2, "cc")}{disc(0.12, 0, 0, "cs")}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([cx, cz], i) => arc(cx * HW, cz * HL, 0.35, -cx / 1.414, -cz / 1.414, Math.PI / 2, "c" + i))}
      {ends}
    </group>
  );
}

function numTex(num, color) { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = color; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.lineWidth = 6; x.strokeStyle = "#fff"; x.stroke(); x.fillStyle = "#fff"; x.font = "bold 70px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(num ?? ""), 64, 72); return new THREE.CanvasTexture(c); }
function nameTex(name) {
  const c = document.createElement("canvas"); c.width = 320; c.height = 72; const x = c.getContext("2d");
  x.clearRect(0, 0, 320, 72); x.fillStyle = "rgba(12,18,28,0.82)";
  if (x.roundRect) { x.beginPath(); x.roundRect(6, 14, 308, 44, 16); x.fill(); } else x.fillRect(6, 14, 308, 44);
  x.fillStyle = "#fff"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(name || ""), 160, 37);
  return new THREE.CanvasTexture(c);
}
function ballTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#f2f2f2"; x.fillRect(0, 0, 256, 256);
  const pent = (cx, cy, r, rot) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / 5, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.closePath(); x.fillStyle = "#161616"; x.fill(); };
  [[128, 64], [54, 150], [202, 150], [128, 224], [40, 40], [216, 40], [40, 232], [216, 232]].forEach((p, i) => pent(p[0], p[1], 24, i * 0.8));
  return new THREE.CanvasTexture(c);
}
function Player({ x, z, kit, shorts, num, face, pid, badge, name }) {
  const tex = useMemo(() => numTex(num, badge), [num, badge]);
  const nameT = useMemo(() => nameTex(name), [name]);
  const [faceTex, setFaceTex] = useState(null);
  useEffect(() => {
    if (!pid) return undefined;
    let live = true;
    new THREE.TextureLoader().load(
      `https://images.fotmob.com/image_resources/playerimages/${pid}.png`,
      (t) => { if (live) setFaceTex(t); }, undefined, () => { if (live) setFaceTex(null); }
    );
    return () => { live = false; };
  }, [pid]);
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
      {faceTex && <sprite position={[0, 3.75, 0]} scale={[1.7, 1.7, 1.7]}><spriteMaterial map={faceTex} transparent depthTest={false} /></sprite>}
      <sprite position={[0, faceTex ? 3.05 : 2.95, 0]} scale={[0.62, 0.62, 0.62]}><spriteMaterial map={tex} depthTest={false} /></sprite>
      {name && <sprite position={[0, 2.45, 0]} scale={[2.4, 0.54, 1]}><spriteMaterial map={nameT} transparent depthTest={false} /></sprite>}
    </group>
  );
}
function Lineup({ lineups }) {
  const placed = useMemo(() => { const hl = PITCH.length / 2; return (lineups || []).filter((p) => p.starter !== false && p.posX != null && p.posY != null).map((p) => { const home = p.home ?? p.isHome; const depth = home ? -hl + p.posX * hl : hl - p.posX * hl; const lateral = (p.posY - 0.5) * PITCH.width * (home ? 1 : -1); return { x: lateral, z: depth, kit: home ? "#c4172c" : "#ffffff", shorts: home ? "#fff" : "#111", badge: home ? "#c4172c" : "#1d2740", num: p.shirt ?? p.shirtNumber, face: home ? 0 : Math.PI, pid: p.playerId ?? p.fotmobPlayerId, name: p.name }; }); }, [lineups]);
  return placed.map((p, i) => <Player key={i} {...p} />);
}

// ── 이스터에그: 공 차기 미니게임 ──
function Ball({ onGoal }) {
  const ref = useRef();
  const v = useRef({ x: 0, z: 0 });
  const keys = useRef({}), kick = useRef(false);
  const tex = useMemo(() => ballTex(), []);
  const R = 0.22;
  useEffect(() => {
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
    const dn = (e) => { keys.current[e.code] = true; if (e.code === "Space") kick.current = true; if (arrows.includes(e.code)) e.preventDefault(); };
    const up = (e) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const k = keys.current, step = Math.min(dt, 0.05), a = 16 * step, vv = v.current;
    if (k.ArrowUp || k.KeyW) vv.z -= a;
    if (k.ArrowDown || k.KeyS) vv.z += a;
    if (k.ArrowLeft || k.KeyA) vv.x -= a;
    if (k.ArrowRight || k.KeyD) vv.x += a;
    if (kick.current) { kick.current = false; const sp = Math.hypot(vv.x, vv.z); const dx = sp > 0.2 ? vv.x / sp : 0, dz = sp > 0.2 ? vv.z / sp : -1; vv.x += dx * 13; vv.z += dz * 13; }
    const fr = Math.pow(0.12, step); vv.x *= fr; vv.z *= fr;
    const p = ref.current.position;
    p.x += vv.x * step; p.z += vv.z * step;
    const HW = PITCH.width / 2 - R, HL = PITCH.length / 2 - R, gW = (7.32 * PITCH.width / 68) / 2 + 0.25;
    if (p.x < -HW) { p.x = -HW; vv.x *= -0.5; }
    if (p.x > HW) { p.x = HW; vv.x *= -0.5; }
    if (Math.abs(p.z) > HL) {
      if (Math.abs(p.x) < gW) { onGoal(); p.set(0, R, 0); vv.x = 0; vv.z = 0; }
      else { p.z = Math.sign(p.z) * HL; vv.z *= -0.5; }
    }
    const rr = step / R; ref.current.rotation.x += vv.z * rr; ref.current.rotation.z -= vv.x * rr;
  });
  return <mesh ref={ref} position={[0, R, 0]} castShadow><sphereGeometry args={[R, 28, 20]} /><meshStandardMaterial map={tex} roughness={0.45} metalness={0.05} /></mesh>;
}

const VIEWS = { 내관: { pos: [2, 16, 34], tgt: [0, 4, 0] }, 외관: { pos: [-48, 12, 6], tgt: [0, 5, 0] }, 항공: { pos: [0, 58, 40], tgt: [0, 2, 0] } };

export default function Stadium3D({ lineups, showLineup = true }) {
  const [showPlayers, setShowPlayers] = useState(showLineup);
  const [play, setPlay] = useState(false);
  const [goals, setGoals] = useState(0);
  const [flash, setFlash] = useState(false);
  const stadium = useMemo(() => buildStadium(PITCH.width, PITCH.length), []);
  const camRef = useRef(), ctrlRef = useRef(), flashT = useRef();
  const onGoal = () => { setGoals((g) => g + 1); setFlash(true); clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash(false), 1300); };
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
            {play && <Ball onGoal={onGoal} />}
          </group>
        </Suspense>
        <OrbitControls ref={ctrlRef} makeDefault enableDamping target={sc([0, 4, 0])} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <div style={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 6 }}>{Object.keys(VIEWS).map((n) => <button key={n} onClick={() => view(n)} style={btn}>{n}</button>)}</div>
      <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 6 }}>
        <button onClick={() => { setPlay((v) => !v); if (!play) view("내관"); }} style={{ ...btn, background: play ? "#16a34a" : "rgba(255,255,255,.82)", color: play ? "#fff" : "#13243a" }}>{play ? "⚽ 종료" : "⚽ 공차기"}</button>
        <button onClick={() => setShowPlayers((v) => !v)} style={btn}>{showPlayers ? "라인업 숨기기" : "라인업 표시"}</button>
      </div>
      {play && <div style={{ position: "absolute", right: 10, top: 46, textAlign: "right", color: "#13243a", fontSize: 12, background: "rgba(255,255,255,.72)", padding: "6px 9px", borderRadius: 8 }}>⚽ 골 {goals}<br /><span style={{ fontSize: 11, opacity: 0.8 }}>방향키 이동 · Space 슛</span></div>}
      {flash && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ fontSize: 46, fontWeight: 800, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>⚽ GOAL!</span></div>}
      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 11, color: "rgba(20,40,60,.8)" }}>Old Trafford · 코드 생성 모델</div>
    </div>
  );
}
const btn = { fontSize: 12, padding: "5px 10px", background: "rgba(255,255,255,.82)", color: "#13243a", border: "0.5px solid rgba(0,0,0,.15)", borderRadius: 6, cursor: "pointer" };
