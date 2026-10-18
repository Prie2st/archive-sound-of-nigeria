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
import { LISTENING_DESK } from "@/stations/albumStack";

const noRaycast = () => undefined;

function createPanels() {
  return ERAS.map((_, index) => {
    const geometry = new THREE.PlaneGeometry(ERA_WORLD_LAYOUT.panel.width, ERA_WORLD_LAYOUT.panel.height);
    const uv=geometry.getAttribute("uv");
    // One shared atlas/material. UVs stay inside the tile's transparent gutter at all mip levels.
    for(let i=0;i<uv.count;i++) uv.setXY(i, (index%4+uv.getX(i))/4, (1-Math.floor(index/4)/2-.5)+uv.getY(i)/2);
    return geometry;
  });
}

/** One backdrop panel behind each station; only the desk light follows the active era. */
export function EraWorlds({ activeEra: activeStore, settings: settingsStore, quality }: { activeEra: ValueStore<EraId>; settings: ValueStore<EraVisualSettings>; quality: ExperienceQuality }) {
  const budget=QUALITY_SETTINGS[quality];
  const semanticEra=useStoreValue(activeStore);
  const settings=useStoreValue(settingsStore);
  const active=getEra(settings.forcedEra ?? semanticEra).index;
  const atlas=useTexture(ERA_ATLAS.url, texture => { texture.colorSpace = THREE.SRGBColorSpace; });
  const resources=useMemo(() => ({
    panels:createPanels(),
    material:new THREE.MeshBasicMaterial({map:atlas,alphaTest:.5,toneMapped:false}),
  }),[atlas]);
  useEffect(() => () => {
    resources.panels.forEach(g=>g.dispose());
    resources.material.dispose();
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
        return <group key={era.id} name={`EraWorld_${era.id}_${tier}`}>
          <mesh geometry={resources.panels[index]} material={resources.material} position={pose.position} rotation={[0,pose.heading,0]} raycast={noRaycast}/>
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

