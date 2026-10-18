"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PCFShadowMap } from "three";
import { getAudioEngine, useAudioLifecycle } from "@/audio/browserAudio";
import { QUALITY_SETTINGS } from "@/config/quality";
import { resolveDevConfig, type CameraMode } from "@/config/dev";
import { DEFAULT_ERA_VISUAL_SETTINGS, type EraVisualSettings } from "@/data/eraVisuals";
import { EraWorlds } from "@/scene/EraWorlds";
import { Exhibits } from "@/scene/Exhibits";
import { ERAS, getEra } from "@/data/eras";
import { GALLERIES } from "@/data/galleries";
import { getHallLayout } from "@/data/hallLayout";
import { useAudioInput } from "@/input/useAudioInput";
import { useRecordInput } from "@/input/useRecordInput";
import type { StationQuality } from "@/data/stationLod";
import type { EraId } from "@/data/types";
import { AudioListenerBridge } from "@/scene/AudioListenerBridge";
import { CameraRig } from "@/scene/CameraRig";
import { Exhibition } from "@/scene/Exhibition";
import { Gallery, type GalleryStats } from "@/scene/Gallery";
import { DevEnvironment } from "@/scene/dev/DevEnvironment";
import { DevInspector } from "@/scene/dev/DevInspector";
import { TonearmDiagnostics } from "@/scene/dev/tonearmDiagnostics";
import { DEFAULT_HALL_DEBUG, type CameraPreview, type HallDebugOptions } from "@/scene/dev/hallDebugState";
import { FOCUS_CONFIG, FocusController } from "@/state/focus";
import { resolveTravelConfig, TravelController } from "@/state/travel";
import { createValueStore } from "@/state/valueStore";
import { preloadStationModels } from "@/stations/ListeningStation";
import { PlatterMotionSystem } from "@/stations/platterMotion";
import { prepareTrackArtwork, trackArtworkReady } from "@/stations/recordArtwork";
import { RecordChangeController } from "@/stations/recordChange";
import { TonearmMotionSystem } from "@/stations/tonearmMotion";
import type { StationRig } from "@/stations/ListeningStation";
import { ArchiveErrorBoundary, ArchiveFallback, supportsWebGL } from "@/ui/ArchiveFallback";
import { FocusOverlay } from "@/ui/FocusOverlay";
import { ExitArchive } from "@/ui/ExitArchive";
import { SoundToggle } from "@/ui/SoundToggle";
import { TravelHud } from "@/ui/TravelHud";
import { DevPanel } from "@/ui/dev/DevPanel";
import { Prologue } from "@/ui/prologue/Prologue";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Client-only root of the 3D experience (rendered without SSR, see Museum.tsx). Browsers that cannot create
 * a WebGL context get the textual fallback; a failure while starting the 3D archive is caught and shown the
 * same way (and still reported to the console).
 */
export default function MuseumCanvas() {
  const [webgl] = useState(supportsWebGL);
  if (!webgl) return <ArchiveFallback />;
  return (
    <ArchiveErrorBoundary>
      <MuseumExperience />
    </ArchiveErrorBoundary>
  );
}

function MuseumExperience() {
  const [config] = useState(() => {
    const resolved = resolveDevConfig();
    if (resolved.stations) preloadStationModels(resolved.textureProfile);
    return { ...resolved, inspector: process.env.NODE_ENV === "development" && resolved.inspector, platterMarker: process.env.NODE_ENV === "development" && resolved.inspector && resolved.platterMarker, stationLog: process.env.NODE_ENV === "development" && resolved.stationLog };
  });
  const definition = GALLERIES[config.gallery];
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const readoutRef = useRef<HTMLPreElement>(null);
  const handleLoaded = useCallback((next: GalleryStats) => setStats(next), []);
  // The visit: the loading moment and the scrollable prologue once per page load (docs/PROLOGUE.md), then ENTER
  // ARCHIVE. `entered` releases input and shows the HUD; `introGone` unmounts the prologue after its exit.
  // `covered`: the prologue fully hides the museum, which then draws only on demand (resize) instead of every
  // frame — the story scrolls without a 1M-triangle hall rendering underneath. Every driver clamps its frame
  // delta (0.1 s), so resuming after the pause is seamless.
  const [entered, setEntered] = useState(!config.intro);
  const [introGone, setIntroGone] = useState(!config.intro);
  const [covered, setCovered] = useState(false);
  const [returningHome, setReturningHome] = useState(false);
  const handleEnter = useCallback(() => {
    setCovered(false);
    setEntered(true);
  }, []);
  const handleIntroExited = useCallback(() => setIntroGone(true), []);
  // Until ENTER ARCHIVE, the museum's window-level keys (travel arrows, Enter-to-focus, M, Escape) are held
  // back so nothing moves behind the intro. Only propagation is stopped: the intro button's own Enter / Space
  // activation (a browser default action) and Tab still work.
  useEffect(() => {
    if (entered) return;
    const hold = (event: KeyboardEvent) => {
      if (event.key !== "Tab") event.stopPropagation();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, [entered]);
  const [hallOptions, setHallOptions] = useState<HallDebugOptions>(DEFAULT_HALL_DEBUG);
  const [preview, setPreview] = useState<CameraPreview>({ mode: "orbit" });
  // Active era: a small external store, so an era change re-renders only its readers
  // (the stations), never this whole tree. Written by the CameraRig (TRAVEL) or the dev panel (INSPECT).
  const [activeEra] = useState(() => createValueStore<EraId>(config.activeEra));
  const [visualSettings] = useState(() => createValueStore<EraVisualSettings>(DEFAULT_ERA_VISUAL_SETTINGS));
  const [lodOverride, setLodOverride] = useState<StationQuality | null>(config.lodOverride);
  const stationStatsRef = useRef<HTMLPreElement>(null);
  const hall = definition.hasHallLayout ? { options: hallOptions, preview } : undefined;

  // Visitor travel: one controller for wheel / touch / keys, read by the CameraRig each frame.
  const [travel] = useState(() => {
    const layout = getHallLayout();
    const controller = new TravelController(resolveTravelConfig(false), layout.length, layout.stations[getEra(config.activeEra).index].progress);
    controller.setReducedMotion(window.matchMedia(REDUCED_MOTION_QUERY).matches);
    return controller;
  });
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => travel.setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [travel]);
  // Listening-station focus: one controller (mode, transition progress, frozen travel position).
  const [focus] = useState(() => {
    const layout = getHallLayout();
    // Flight distance from the travel position to the station's focus camera (sets the transition durations).
    return new FocusController(FOCUS_CONFIG, (station, loopProgress) => {
      const from = layout.curve.getPointAt(loopProgress);
      const [x, y, z] = layout.stations[station].focusCamera.position;
      return Math.hypot(x - from.x, y - from.y, z - from.z);
    });
  });
  // Audio: the page's one engine (one AudioContext, created by the ENTER ARCHIVE gesture). It follows the
  // active-era store above — the same value the stations' LOD uses — and never sees the camera or focus.
  const [audio] = useState(() => getAudioEngine({ initialEra: config.activeEra, failEra: config.audioFail }));
  useAudioLifecycle(audio, activeEra);
  useAudioInput(audio);
  // The decks: platter motion and tonearm mechanics (one state per era), and the ONE record-change
  // controller that sequences them with the audio engine (docs/RECORD_CHANGE.md). The platter follows the
  // audio layer's semantic answer, except on the era whose record is being changed — there the change decides.
  const [deck] = useState(() => {
    const platterSystem = new PlatterMotionSystem(ERAS.length);
    const tonearmMechanics = { system: new TonearmMotionSystem(ERAS.length), rigs: new Map<EraId, StationRig>(), diagnostics: process.env.NODE_ENV === "development" ? new TonearmDiagnostics() : null };
    const controller = new RecordChangeController({
      audio: {
        unlocked: () => audio.getSnapshot().unlocked,
        playbackWanted: () => audio.isPlaybackWanted(),
        selected: (eraId) => audio.selection.get(eraId),
        select: (eraId, trackId) => audio.selectTrack(eraId, trackId),
        voiceTrack: (eraId) => audio.eraVoiceTrack(eraId),
        hold: (eraId, seconds) => audio.holdEra(eraId, seconds),
        release: (eraId) => audio.releaseEra(eraId),
        prepare: (eraId, trackId) => audio.prepareTrack(eraId, trackId),
        loadState: (eraId, trackId) => audio.trackLoadState(eraId, trackId),
      },
      artwork: { prepare: prepareTrackArtwork, ready: trackArtworkReady },
      platterRpm: (index) => platterSystem.states[index].currentRpm,
      tonearm: (index) => tonearmMechanics.system.states[index],
      tonearmAnimated: (index) => ERAS[index].id === activeEra.get() && tonearmMechanics.rigs.get(ERAS[index].id)?.quality === "active",
      focus: { mode: () => focus.mode, station: () => focus.station, exit: () => void focus.requestExit("record-change-deferred") },
      activeIndex: () => getEra(activeEra.get()).index,
    });
    return {
      platters: { system: platterSystem, isPlaying: (index: number) => controller.platterDemand(index, audio.isEraPlaying(ERAS[index].id)) },
      tonearms: tonearmMechanics,
      records: { controller, selected: (eraId: EraId) => audio.selection.get(eraId) },
    };
  });
  const { platters, tonearms, records } = deck;
  const handleExit = useCallback(() => {
    if (records.controller.changing) return;
    audio.stop();
    setReturningHome(true);
    setEntered(false);
    setIntroGone(false);
    setCovered(true);
  }, [audio, records]);
  // Focus exit is locked while a record is being changed (remembered, then honoured once stable).
  useEffect(() => {
    focus.setExitGuard(() => records.controller.allowFocusExit());
    return () => focus.setExitGuard(null);
  }, [focus, records]);
  // Development: every focus-exit request (accepted or vetoed) with its source, input event and the deck
  // state — kept in window.__archiveFocusExits (last 50) and logged. Nothing is logged per frame.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & { __archiveFocusExits?: unknown[] };
    const log: unknown[] = (devWindow.__archiveFocusExits = []);
    focus.setExitObserver((request) => {
      const controller = records.controller;
      const entry = { time: Math.round(performance.now()), ...request, recordPhase: controller.phase, changing: controller.changing, exitPending: controller.exitPending };
      log.push(entry);
      if (log.length > 50) log.shift();
      console.info("[focus-exit]", entry);
    });
    return () => {
      focus.setExitObserver(null);
      delete devWindow.__archiveFocusExits;
    };
  }, [focus, records]);
  useRecordInput(records.controller);
  // Intro readiness (polled by the intro while it loads): the hall is loaded and every station has mounted and
  // presented its selected record's artwork (station rigs register in tonearms.rigs; see Exhibition).
  const hallLoaded = stats !== null;
  const isSceneReady = useCallback(
    () => hallLoaded && (!config.stations || ERAS.every((era) => tonearms.rigs.get(era.id)?.presentation.trackId != null)),
    [hallLoaded, config.stations, tonearms],
  );
  const canTravel = definition.hasHallLayout;
  const [cameraMode, setCameraMode] = useState<CameraMode>(canTravel ? config.cameraMode : "inspect");
  // In TRAVEL the camera position decides the active era; dev era buttons jump there instead.
  const chooseEra = useCallback(
    (era: EraId) => {
      if (cameraMode === "travel") travel.devJumpTo(getHallLayout().stations[getEra(era).index].progress);
      else activeEra.set(era);
    },
    [cameraMode, travel, activeEra],
  );

  return (
    <>
      {/* The fixed stage: the canvas layer stays put while the prologue scrolls the document above it. */}
      <div className="museum-stage">
        <Canvas
          className="museum-canvas"
          dpr={[1, QUALITY_SETTINGS[config.quality].maxDpr]}
          frameloop={covered && !entered ? "demand" : "always"}
          camera={{ fov: 50, near: 0.05, far: 1000, position: [40, 30, 40] }}
          gl={{ antialias: QUALITY_SETTINGS[config.quality].antialias }}
          shadows={{ type: PCFShadowMap }}
        >
          <color attach="background" args={["#1d1d1f"]} />
          <DevEnvironment quality={config.quality} shadowsReady={isSceneReady} />
          <Suspense fallback={null}>
            <Gallery definition={definition} opaqueFix={config.opaqueFix} quality={config.quality} onLoaded={handleLoaded} />
          </Suspense>
          {definition.hasHallLayout && config.stations && (
            <Suspense fallback={null}>
              <Exhibition
                textures={config.textureProfile}
                experienceQuality={config.quality}
                activeEra={activeEra}
                qualityOverride={lodOverride}
                statsRef={config.inspector ? stationStatsRef : undefined}
                logAlignment={config.stationLog}
                interaction={cameraMode === "travel" && entered ? { focus, travel, showVolume: hallOptions.volumes } : undefined}
                platters={platters}
                rotationMarker={config.platterMarker}
                tonearms={tonearms}
                records={records}
              />
            </Suspense>
          )}
          {definition.hasHallLayout && config.stations && <Suspense fallback={null}><EraWorlds activeEra={activeEra} settings={visualSettings} quality={config.quality} /></Suspense>}
          {definition.hasHallLayout && <Exhibits ready={isSceneReady} />}
          {cameraMode === "travel" && <CameraRig travel={travel} focus={focus} onActiveEraChange={activeEra.set} />}
          {/* After the CameraRig: the audio listener follows the camera pose it just set. */}
          <AudioListenerBridge audio={audio} travel={travel} focus={focus} />
          {config.inspector && (
            <DevInspector
              quality={config.quality}
              bounds={stats?.bounds ?? null}
              readoutRef={readoutRef}
              hall={hall}
              mode={cameraMode}
              travel={canTravel ? travel : undefined}
              focus={canTravel ? focus : undefined}
            />
          )}
        </Canvas>
      </div>
      {config.inspector && (
        <DevPanel
          config={config}
          definition={definition}
          stats={stats}
          readoutRef={readoutRef}
          hall={hall && { ...hall, setOptions: setHallOptions, setPreview }}
          stations={{ activeEra, setActiveEra: chooseEra, lodOverride, setLodOverride, statsRef: stationStatsRef }}
          camera={canTravel ? { mode: cameraMode, setMode: setCameraMode, travel, focus } : undefined}
          audio={audio}
          platters={platters.system}
          tonearms={tonearms}
          records={records.controller}
          visualSettings={visualSettings}
        />
      )}
      {cameraMode === "travel" && entered && <TravelHud activeEra={activeEra} focus={focus} />}
      {cameraMode === "travel" && entered && <FocusOverlay focus={focus} audio={audio} records={records.controller} />}
      {entered && (
        <div className="ui-sound-slot">
          {introGone && <ExitArchive records={records.controller} onExit={handleExit} />}
          <SoundToggle audio={audio} />
        </div>
      )}
      {!introGone && <Prologue returningHome={returningHome} audio={audio} isSceneReady={isSceneReady} onEnter={handleEnter} onExited={handleIntroExited} onCoverChange={setCovered} />}
    </>
  );
}

