import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EraVisualToken } from "@/data/eraVisuals";

/** Original low-poly references, not reconstructions of historic collection objects. Two batches per set. */
export function createEraProp(token: EraVisualToken) {
  const batches: THREE.BufferGeometry[][] = [[], []];
  const add = (geometry: THREE.BufferGeometry, batch: number, x = 0, y = 0, z = 0, rz = 0, rx = 0) => {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,0,rz)), new THREE.Vector3(1,1,1)));
    batches[batch].push(geometry);
  };
  const box = (w:number,h:number,d:number,b:number,x=0,y=0,z=0) => add(new THREE.BoxGeometry(w,h,d),b,x,y,z);
  const cylinder = (rt:number,rb:number,h:number,b:number,x=0,y=0,z=0,rz=0,rx=0) => add(new THREE.CylinderGeometry(rt,rb,h,12),b,x,y,z,rz,rx);
  // Restrained common base ties the eight installations to the same museum furniture language.
  box(.34,.035,.34,0,0,.018);
  box(.13,.48,.13,0,0,.275);
  box(.32,.025,.30,1,0,.525);
  switch(token.motif) {
    case "weave": {
      const profile=[new THREE.Vector2(.15,0),new THREE.Vector2(.08,.2),new THREE.Vector2(.16,.42)];
      add(new THREE.LatheGeometry(profile,12),0,0,.55);
      cylinder(.17,.17,.025,1,0,.975);
      cylinder(.16,.16,.025,1,0,.555);
      for(let i=0;i<8;i++) { const a=i*Math.PI/4; cylinder(.007,.007,.40,1,Math.sin(a)*.12,.76,Math.cos(a)*.12); }
      break;
    }
    case "shellac":
      for(let i=0;i<7;i++) cylinder(.185,.185,.013,0,0,.56+i*.025);
      cylinder(.055,.055,.014,1,0,.724);
      box(.27,.28,.045,1,0,.88,-.08);
      box(.24,.003,.05,0,0,.95,-.05);
      break;
    case "brass":
      cylinder(.025,.025,.25,1,-.08,.68,0);
      cylinder(.025,.025,.19,1,.03,.79,0,-Math.PI/2);
      cylinder(.17,.025,.20,1,.09,.91,0,Math.PI/2);
      cylinder(.146,.146,.008,0,-.01,.91,0,Math.PI/2);
      break;
    case "print":
      box(.30,.38,.025,1,-.035,.75,0);
      add(new THREE.BoxGeometry(.27,.34,.03),0,.035,.87,.025,-.16);
      cylinder(.12,.09,.14,1,0,.635,.11);
      cylinder(.125,.125,.01,0,0,.71,.11);
      break;
    case "cassette":
      box(.38,.29,.16,0,0,.735);
      box(.33,.20,.012,1,0,.76,.087);
      box(.25,.13,.10,1,0,.96,.04);
      for(const x of [-.075,.075]) cylinder(.038,.038,.015,0,x,.975,.10,0,Math.PI/2);
      break;
    case "disc":
      add(new THREE.RingGeometry(.025,.20,28),1,0,.82,.01);
      box(.29,.045,.18,1,0,.57);
      box(.10,.18,.045,0,.12,.72,.06);
      box(.065,.12,.008,1,.12,.735,.087);
      break;
    case "city":
      for(let i=0;i<4;i++) box(.07,.20+i*.07,.09,0,-.14+i*.09,.67+i*.035,-.05);
      box(.34,.025,.04,1,0,1.02,.06);
      for(const x of [-.155,.155]) box(.025,.46,.04,1,x,.80,.06);
      box(.20,.15,.02,1,0,.86,.065);
      break;
    case "arena":
      for(let i=0;i<5;i++) { box(.035,.26+Math.sin(i*.78)*.22,.08,0,-.16+i*.08,.78); box(.018,.015,.009,1,-.16+i*.08,.82,.045); }
      box(.39,.025,.07,1,0,1.06);
      break;
  }
  const geometry = batches.map(parts => { const merged=mergeGeometries(parts); parts.forEach(part=>part.dispose()); if(!merged) throw new Error("Era prop batch failed"); return merged; });
  const materials = [new THREE.MeshStandardMaterial({color: token.motif==="shellac"?"#1a1816":token.primary, roughness:.8,metalness:token.motif==="arena"?.45:.1}), new THREE.MeshStandardMaterial({color:token.motif==="disc"?"#ced4db":token.accent,roughness:token.motif==="disc"?.25:.6,metalness:token.motif==="disc"||token.motif==="brass"?.65:.15})];
  return { geometry, materials, dispose() { geometry.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); } };
}

