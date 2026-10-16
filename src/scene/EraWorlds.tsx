"use client";

import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { QUALITY_SETTINGS, type ExperienceQuality } from "@/config/quality";
import { ERAS, getEra } from "@/data/eras";
import { ERA_ATLAS, ERA_VISUALS, ERA_WORLD_LAYOUT, eraPanelPose, eraVisualTier, type EraVisualSettings } from "@/data/eraVisuals";
import { getHallLayout } from "@/data/hallLayout";
import type { EraId } from "@/data/types";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import { createEraProp } from "@/scene/eraPropGeometry";
import { LISTENING_DESK } from "@/stations/albumStack";

const noRaycast = () => undefined;

function createNextEdges() {
  return ERAS.map((_,index)=>{
    const geometry=new THREE.PlaneGeometry(ERA_WORLD_LAYOUT.nextEdge.width,ERA_WORLD_LAYOUT.nextEdge.height);
    const uv=geometry.getAttribute("uv"), next=(index+1)%8;
    for(let i=0;i<uv.count;i++) uv.setXY(i, (next%4+(250+uv.getX(i)*50)/512)/4, (1-Math.floor(next/4)/2-.5)+(32+uv.getY(i)*170)/1024);
    return geometry;
  });
}

function createPanels() {
  return ERAS.map((_, index) => {
    const geometry = new THREE.PlaneGeometry(ERA_WORLD_LAYOUT.panel.width, ERA_WORLD_LAYOUT.panel.height);
    const uv=geometry.getAttribute("uv");
    // One shared atlas/material. UVs stay inside the tile's transparent gutter at all mip levels.
    for(let i=0;i<uv.count;i++) uv.setXY(i, (index%4+uv.getX(i))/4, (1-Math.floor(index/4)/2-.5)+uv.getY(i)/2);
    return geometry;
  });
}

/** Cheap, static installations. Only discrete LOD visibility and the one light change with active era. */
export function EraWorlds({ activeEra: activeStore, settings: settingsStore, quality }: { activeEra: ValueStore<EraId>; settings: ValueStore<EraVisualSettings>; quality: ExperienceQuality }) {
  const budget=QUALITY_SETTINGS[quality];
  const semanticEra=useStoreValue(activeStore);
  const settings=useStoreValue(settingsStore);
  const active=getEra(settings.forcedEra ?? semanticEra).index;
  const atlas=useTexture(ERA_ATLAS.url, texture => { texture.colorSpace = THREE.SRGBColorSpace; });
  const resources=useMemo(() => ({
    panels:createPanels(),
    edges:createNextEdges(),
    props:ERAS.map(era=>createEraProp(ERA_VISUALS[era.id])),
    material:new THREE.MeshBasicMaterial({map:atlas,alphaTest:.5,toneMapped:false}),
    hint:new THREE.BoxGeometry(.18,.9,.12),
    hintMaterials:ERAS.map(era=>new THREE.MeshBasicMaterial({color:ERA_VISUALS[era.id].secondary})),
  }),[atlas]);
  useEffect(() => () => {
    resources.panels.forEach(g=>g.dispose()); resources.edges.forEach(g=>g.dispose()); resources.props.forEach(p=>p.dispose());
    resources.material.dispose(); resources.hint.dispose(); resources.hintMaterials.forEach(m=>m.dispose());
  },[resources]);
  const layout=getHallLayout();
  const current=layout.stations[active];
  const lightTarget=useMemo(()=>new THREE.Object3D(),[]);
  const palette=ERA_VISUALS[ERAS[active].id];
  const lightPosition: [number,number,number]=[current.position[0],1.9,current.position[2]];
  return (
    <group name="EraVisualWorlds" visible={settings.enabled} dispose={null}>
      {ERAS.map((era,index)=>{
        const station=layout.stations[index];
        const pose=eraPanelPose(station);
        const tier=eraVisualTier(index,active);
        const prop=resources.props[index];
        return <group key={era.id} name={`EraWorld_${era.id}_${tier}`}>
          <mesh geometry={resources.panels[index]} material={resources.material} position={pose.position} rotation={[0,pose.heading,0]} raycast={noRaycast}/>
          <group position={[...station.position]} rotation={[0,station.heading,0]}>
            <mesh visible={tier==="active" || (tier==="nearby" && budget.nearbyDecoration)} geometry={resources.edges[index]} material={resources.material} position={[ERA_WORLD_LAYOUT.nextEdge.x,ERA_WORLD_LAYOUT.nextEdge.y,ERA_WORLD_LAYOUT.nextEdge.z]} raycast={noRaycast}/>
            <group position={[ERA_WORLD_LAYOUT.prop.x,0,ERA_WORLD_LAYOUT.prop.z]}>
              <group visible={tier==="active" && budget.activeProps}>
                {prop.geometry.map((geometry,batch)=><mesh key={batch} geometry={geometry} material={prop.materials[batch]} raycast={noRaycast}/>)}
              </group>
              <mesh visible={tier==="nearby" && budget.nearbyDecoration} geometry={resources.hint} material={resources.hintMaterials[index]} position={[0,.45,0]} raycast={noRaycast}/>
            </group>
          </group>
        </group>;
      })}
      {/* Reuse the one era light for a tight live shadow map. Its colour / power / reach stay intact;
          the wide soft cone covers the desk, never the whole hall or all eight detailed decks. */}
      <primitive object={lightTarget} position={[current.position[0]-.25*Math.cos(current.heading),current.position[1]+LISTENING_DESK.top,current.position[2]+.25*Math.sin(current.heading)]}/>
      <spotLight name="EraDeskLight" position={lightPosition} target={lightTarget} color={palette.light} intensity={1.4} distance={3.2} decay={2}
        angle={.95} penumbra={.65} castShadow
        shadow-mapSize={[budget.stationShadowMapSize,budget.stationShadowMapSize]}
        shadow-camera-near={.08} shadow-camera-far={3.2}
        shadow-bias={-.00006} shadow-normalBias={.0006} shadow-radius={3 * budget.stationShadowMapSize / 1024} shadow-intensity={.7}/>
    </group>
  );
}

