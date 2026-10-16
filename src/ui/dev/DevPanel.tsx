"use client";

import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import { useAudioSnapshot } from "@/audio/browserAudio";
import type { AudioDebugMix, AudioEngine } from "@/audio/engine";
import type { PanningModel } from "@/audio/webAudio";
import type { CameraMode, DevConfig } from "@/config/dev";
import type { EraVisualSettings } from "@/data/eraVisuals";
import { ERAS, getEra, getEraLoopDistance, getNextEra, getPreviousEra } from "@/data/eras";
import { GALLERIES, type GalleryDefinition } from "@/data/galleries";
import { getHallLayout, nearestStationIndex } from "@/data/hallLayout";
import { qualityForLoopDistance, STATION_QUALITIES, type StationQuality } from "@/data/stationLod";
import { REFERENCE_VARIANT, TEXTURE_PROFILES } from "@/data/textureProfiles";
import type { EraId } from "@/data/types";
import type { GalleryStats } from "@/scene/Gallery";
import type { CameraPreview, HallDebugOptions, StationView } from "@/scene/dev/hallDebugState";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";
import type { PlatterMotionSystem } from "@/stations/platterMotion";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import type { TonearmMechanics } from "@/scene/TonearmMotionDriver";
import { RecordChangeControls } from "@/ui/dev/RecordChangeControls";
import { TonearmControls } from "@/ui/dev/TonearmControls";
import type { RecordChangeController } from "@/stations/recordChange";

interface DevPanelProps {
  config: DevConfig;
  definition: GalleryDefinition;
  stats: GalleryStats | null;
  readoutRef: RefObject<HTMLPreElement | null>;
  /** Marble hall layout debugging; absent for galleries without a layout. */
  hall?: {
    options: HallDebugOptions;
    preview: CameraPreview;
    setOptions: Dispatch<SetStateAction<HallDebugOptions>>;
    setPreview: Dispatch<SetStateAction<CameraPreview>>;
  };
  /** Station tier assignment (active era / forced tier) and the per-station readout. */
  stations?: {
    activeEra: ValueStore<EraId>;
    setActiveEra: (era: EraId) => void;
    lodOverride: StationQuality | null;
    setLodOverride: (quality: StationQuality | null) => void;
    statsRef: RefObject<HTMLPreElement | null>;
  };
  /** Camera mode (TRAVEL / INSPECT) and dev travel controls (marble hall only). */
  camera?: { mode: CameraMode; setMode: (mode: CameraMode) => void; travel: TravelController; focus: FocusController };
  /** Audio engine state and DEV-only playback actions (development builds only). */
  audio?: AudioEngine;
  /** Platter playback motion (development builds only). */
  platters?: PlatterMotionSystem;
  tonearms?: TonearmMechanics;
  /** Record change controller (development builds only). */
  records?: RecordChangeController;
  visualSettings?: ValueStore<EraVisualSettings>;
}

/** Current URL with one query parameter replaced (keeps the other dev params). */
function withParam(key: string, value: string): string {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  return `?${params}`;
}

const v3 = (v: THREE.Vector3) => `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;

/** Temporary development overlay — not part of the museum UI. */
export function DevPanel({ config, definition, stats, readoutRef, hall, stations, camera, audio, platters, tonearms, records, visualSettings }: DevPanelProps) {
  const { active, progress, loaded, total } = useProgress();
  const size = stats?.bounds.getSize(new THREE.Vector3());
  const center = stats?.bounds.getCenter(new THREE.Vector3());

  return (
    <details className="dev-panel" open>
      <summary>
        <strong>DEV INSPECTOR</strong>
      </summary>
      <div>
        gallery:{" "}
        {Object.values(GALLERIES).map((g) => (
          <a key={g.id} href={`?gallery=${g.id}`} className={g.id === definition.id ? "active" : undefined}>
            {g.id}
          </a>
        ))}
      </div>
      <div>{definition.label}</div>
      <div className="muted">{definition.url}</div>
      <div className="muted">{definition.status}</div>
      <div className="muted">
        opaqueFix: {config.opaqueFix ? "on" : "off"} · stations: {config.stations ? "on" : "off"}
      </div>
      {config.stations && (
        <div>
          station textures:{" "}
          {[...TEXTURE_PROFILES, REFERENCE_VARIANT].map((profile) => (
            <a key={profile} href={withParam("textures", profile)} className={profile === config.textureProfile ? "active" : undefined}>
              {profile}
            </a>
          ))}
        </div>
      )}

      {active && (
        <div>
          loading {progress.toFixed(0)}% ({loaded}/{total})
        </div>
      )}

      {stats && size && center && (
        <pre>
          {`size     ${v3(size)}  (W × H × D, m)\n`}
          {`center   ${v3(center)}\n`}
          {`min      ${v3(stats.bounds.min)}\n`}
          {`max      ${v3(stats.bounds.max)}\n`}
          {`meshes ${stats.meshes}   materials ${stats.materials}   tris ${stats.triangles.toLocaleString()}`}
        </pre>
      )}

      <pre ref={readoutRef} />
      {visualSettings && <EraVisualControls settings={visualSettings} />}
      {camera && <CameraControls {...camera} />}
      {audio && process.env.NODE_ENV === "development" && <AudioControls audio={audio} />}
      {platters && stations && process.env.NODE_ENV === "development" && (
        <PlatterControls system={platters} activeEra={stations.activeEra} lodOverride={stations.lodOverride} />
      )}
      {tonearms && stations && process.env.NODE_ENV === "development" && <TonearmControls mechanics={tonearms} activeEra={stations.activeEra} />}
      {records && audio && platters && tonearms && stations && process.env.NODE_ENV === "development" && (
        <RecordChangeControls records={records} audio={audio} platters={platters} tonearms={tonearms.system} activeEra={stations.activeEra} />
      )}
      <div className="muted">axes: X red · Y green · Z blue (5 m) · grid 1 m at y = 0 · box = model bounds</div>

      {hall && <HallLayoutControls {...hall} />}
      {hall && stations && config.stations && <StationControls {...stations} setPreview={hall.setPreview} />}
    </details>
  );
}

const eraLabel = (eraId: EraId) => `${getEra(eraId).number} ${getEra(eraId).title}`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/**
 * Audio engine inspection + DEV-only actions (docs/AUDIO_ENGINE.md §14, docs/SPATIAL_AUDIO.md §11).
 * The readout is written into the DOM 4× per second (listener, gains, voices) — never React state;
 * the buttons only call the engine's public API (UNLOCK must be a real click: the engine checks
 * for a user gesture).
 */
function AudioControls({ audio }: { audio: AudioEngine }) {
  const snapshot = useAudioSnapshot(audio);
  const readout = useRef<HTMLPreElement>(null);
  const [mix, setMix] = useState<AudioDebugMix>(() => audio.getDebugInfo().mix);
  const [panning, setPanning] = useState<PanningModel>(() => audio.getDebugInfo().panningModel);
  const toggle = (change: Partial<AudioDebugMix>) => {
    audio.setDebugMix(change);
    setMix((current) => ({ ...current, ...change }));
  };

  useEffect(() => {
    const f = (n: number, digits = 2) => n.toFixed(digits);
    const write = () => {
      const pre = readout.current;
      if (!pre) return;
      const s = audio.getSnapshot();
      const d = audio.getDebugInfo();
      const gains = d.gains
        ? `master ${f(d.gains.master, 3)} · music ${f(d.gains.music, 3)} · spatial ${f(d.gains.spatial, 2)} · dry ${f(d.gains.dry, 2)} · ambient ${f(d.gains.ambient, 1)} · ui ${f(d.gains.ui, 1)}`
        : "—";
      const voices = d.voices.length
        ? d.voices
            .map(
              (v) =>
                `#${v.id} ${v.role.padEnd(8)} ${eraLabel(v.eraId).padEnd(13)} target ${f(v.target, 3)} gain ${f(v.gain, 3)} dist ${Number.isNaN(v.distance) ? "—" : `${f(v.distance, 1)} m`}` +
                ` src (${v.source.map((n) => f(n, 1)).join(", ")}) pos ${f(v.position, 1)} s · ${v.trackId}`,
            )
            .join("\n          ")
        : "—";
      const neighbourhood = d.neighbourhood.map((n) => `${n.role} ${n.eraId} ${n.load}${n.playing ? " ▶" : ""}`).join(" · ");
      pre.textContent = [
        `status    ${s.status} · context ${d.contextState} (${d.contextsCreated} created${d.sampleRate ? `, ${d.sampleRate} Hz` : ""}) · unlocked ${s.unlocked ? "yes" : "no"}`,
        `master    ${s.muted ? "MUTED" : "unmuted"} · intent ${s.wantsPlayback ? "play" : "stop"}`,
        `listener  ${d.listener ? d.listener.map((n) => f(n)).join(", ") : "—"} · station coord ${d.stationCoordinate === null ? "—" : f(d.stationCoordinate)}`,
        `eras      prev ${eraLabel(d.eras.previous)} · ACTIVE ${eraLabel(d.eras.active)} · next ${eraLabel(d.eras.next)}`,
        `records   ${neighbourhood}`,
        `active    selected ${s.selectedTrackId} (${s.selectedKind ?? "no audio"}) · playing ${s.playingTrackId ?? "—"}`,
        `error     ${s.error ? `${s.error.reason}${s.error.trackId ? ` · ${s.error.trackId}` : ""}` : "—"}`,
        `mix       spatial ${d.mix.spatial ? `on (${d.panningModel})` : "BYPASS"} · solo ${d.mix.soloActive ? "ON" : "off"} · bleed ${d.mix.bleed ? "on" : "OFF"}`,
        `gains     ${gains}`,
        `voices    ${voices}`,
        `nodes     ${d.liveNodes} live · ${d.voices.length} voices (${d.voices.filter((v) => v.role !== "fading").length} live) · ${d.sourcesCreated} sources created`,
        `buffers   ${d.cache.buffers} decoded (${mb(d.cache.bytes)}) · loading ${d.cache.loading} · errors ${d.cache.errors} · requests ${d.cache.requests}`,
      ].join("\n");
    };
    write();
    const timer = window.setInterval(write, 250);
    return () => window.clearInterval(timer);
  }, [audio]);

  return (
    <section className="dev-panel__section">
      <strong>AUDIO</strong>
      <div className="dev-panel__buttons">
        <button type="button" className={snapshot.unlocked ? "active" : undefined} onClick={() => audio.unlock()}>
          UNLOCK AUDIO
        </button>
        <button type="button" onClick={() => audio.play()}>
          PLAY ACTIVE
        </button>
        <button type="button" onClick={() => audio.stop()}>
          STOP
        </button>
        <button type="button" className={snapshot.muted ? "active" : undefined} onClick={() => audio.toggleMute()}>
          {snapshot.muted ? "UNMUTE" : "MUTE"}
        </button>
        <button type="button" onClick={() => audio.clearCache()}>
          CLEAR AUDIO CACHE
        </button>
      </div>
      <div className="dev-panel__buttons">
        mix:
        <button type="button" className={mix.spatial ? "active" : undefined} onClick={() => toggle({ spatial: !mix.spatial })}>
          SPATIAL {mix.spatial ? "ON" : "OFF"}
        </button>
        <button type="button" className={mix.soloActive ? "active" : undefined} onClick={() => toggle({ soloActive: !mix.soloActive })}>
          SOLO ACTIVE
        </button>
        <button type="button" className={mix.bleed ? "active" : undefined} onClick={() => toggle({ bleed: !mix.bleed })}>
          NEIGHBOR BLEED {mix.bleed ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={() => {
            const next: PanningModel = panning === "equalpower" ? "HRTF" : "equalpower";
            audio.setPanningModel(next);
            setPanning(next);
          }}
        >
          panning: {panning}
        </button>
      </div>
      <div className="dev-panel__buttons">
        page visibility (simulated):
        <button type="button" onClick={() => audio.setPageVisible(false)}>
          hidden
        </button>
        <button type="button" onClick={() => audio.setPageVisible(true)}>
          visible
        </button>
      </div>
      <pre ref={readout} />
      <div className="muted">M = mute. ?audioFail=&lt;era&gt; points that era&apos;s audio at a missing file.</div>
    </section>
  );
}

/**
 * Platter playback motion (docs/PLATTER_MOTION.md §9): previous / active / next era with tier, the
 * audio layer's answer, override, target / current RPM and angle. Written into the DOM 4× per second;
 * FORCE buttons are development overrides on the ACTIVE era (AUTO clears every override).
 */
function PlatterControls({ system, activeEra: activeEraStore, lodOverride }: { system: PlatterMotionSystem; activeEra: ValueStore<EraId>; lodOverride: StationQuality | null }) {
  const readout = useRef<HTMLPreElement>(null);
  const activeEra = useStoreValue(activeEraStore);
  const [marker] = useState(() => new URLSearchParams(window.location.search).get("marker") === "1");

  useEffect(() => {
    const write = () => {
      const pre = readout.current;
      if (!pre) return;
      const active = getEra(activeEraStore.get());
      const rows = [getPreviousEra(active.id), active, getNextEra(active.id)].map((era) => {
        const state = system.states[era.index];
        const role = era.id === active.id ? "active" : era.index === getPreviousEra(active.id).index ? "previous" : "next";
        const tier = lodOverride ?? qualityForLoopDistance(getEraLoopDistance(active.id, era.id));
        const degrees = (((state.angle * 180) / Math.PI) % 360 + 360) % 360;
        return (
          `${role.padEnd(8)} ${eraLabel(era.id).padEnd(13)} ${tier.padEnd(7)} audio ${state.audioPlaying ? "yes" : "no "}` +
          `${state.override ? ` FORCE ${state.override}` : ""} · target ${state.targetRpm.toFixed(2)} · rpm ${state.currentRpm.toFixed(2)} · angle ${degrees.toFixed(0).padStart(3)}°`
        );
      });
      const spinning = system.states.filter((state) => state.currentRpm > 0).length;
      pre.textContent = `${rows.join("\n")}\nspinning platters: ${spinning} of ${system.states.length}`;
    };
    write();
    const timer = window.setInterval(write, 250);
    return () => window.clearInterval(timer);
  }, [system, activeEraStore, lodOverride]);

  const index = getEra(activeEra).index;
  return (
    <section className="dev-panel__section">
      <strong>PLATTERS</strong>
      <div className="dev-panel__buttons">
        active {eraLabel(activeEra)}:
        <button type="button" onClick={() => system.setOverride(index, "play")}>
          FORCE PLAY ACTIVE
        </button>
        <button type="button" onClick={() => system.setOverride(index, "stop")}>
          FORCE STOP ACTIVE
        </button>
        <button type="button" onClick={() => system.states.forEach((_, i) => system.setOverride(i, null))}>
          AUTO (follow audio)
        </button>
        <a href={withParam("marker", marker ? "0" : "1")}>{marker ? "hide" : "show"} rotation marker</a>
      </div>
      <pre ref={readout} />
    </section>
  );
}

const OPTION_LABELS: Record<keyof HallDebugOptions, string> = {
  helpers: "axes/grid/box",
  path: "route",
  controlPoints: "control pts",
  stations: "stations",
  views: "route views",
  focus: "focus cams",
  reference: "references",
  labels: "labels",
  volumes: "focus volumes",
  focusPaths: "focus paths",
};

/**
 * Camera mode + development travel controls. "jump" TELEPORTS (sets absolute progress) —
 * development only; production era navigation must travel along the loop.
 */
function CameraControls({ mode, setMode, travel, focus }: NonNullable<DevPanelProps["camera"]>) {
  const layout = getHallLayout();
  const [paused, setPaused] = useState(travel.paused);
  const [scale, setScale] = useState(travel.config.accelerationScale);
  const jumpBefore = 8; // metres before the station's route view: shows the approach
  return (
    <section className="dev-panel__section">
      <strong>CAMERA</strong>
      <div className="dev-panel__buttons">
        mode:
        {(["travel", "inspect"] as const).map((m) => (
          <button key={m} type="button" className={m === mode ? "active" : undefined} onClick={() => setMode(m)}>
            {m.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className={paused ? "active" : undefined}
          onClick={() => {
            travel.setPaused(!paused);
            setPaused(!paused);
          }}
        >
          {paused ? "paused" : "pause travel"}
        </button>
        <button type="button" onClick={() => travel.devJumpTo(layout.stations[0].progress)}>
          reset to ROOTS
        </button>
      </div>
      <div className="dev-panel__buttons">
        focus (real CameraRig, TRAVEL only):
        <button type="button" disabled={mode !== "travel"} onClick={() => focus.requestFocus(travel.activeStation, travel.activeStation, travel)}>
          FOCUS ACTIVE
        </button>
        <button type="button" disabled={mode !== "travel"} onClick={() => focus.requestExit("dev-panel")}>
          EXIT FOCUS
        </button>
      </div>
      <div className="dev-panel__buttons">
        jump near (dev teleport, {jumpBefore} m before):
        {layout.stations.map((s) => (
          <button key={s.index} type="button" onClick={() => travel.devJumpTo(s.progress - jumpBefore / layout.length)}>
            {s.debugLabel.slice(0, 2)}
          </button>
        ))}
      </div>
      <label className="dev-panel__slider">
        input × {scale.toFixed(2)}
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => {
            const value = Number(e.target.value);
            travel.tune({ accelerationScale: value });
            setScale(value);
          }}
        />
      </label>
      <div className="muted">TRAVEL: wheel · touch drag · ↓/PageDown ↑/PageUp. INSPECT: orbit + static previews (HALL LAYOUT).</div>
    </section>
  );
}

/** LOD comparison cameras on the ACTIVE station: distance (m) along the focus axis (2.02 = focus view) or route axis (6.16 = route view). */
const LOD_PREVIEWS = [
  { axis: "focus", distance: 1 },
  { axis: "focus", distance: 1.5 },
  { axis: "focus", distance: 2.02 },
  { axis: "route", distance: 6.16 },
  { axis: "route", distance: 12 },
  { axis: "route", distance: 20 },
  { axis: "route", distance: 28 },
] as const;

/**
 * Stations: choose the ACTIVE era (its previous / next stations become NEARBY, the rest
 * DISTANT — the stand-in for the future camera rig), optionally force one tier on all
 * stations, preview the active station from fixed distances, and read per-station stats.
 */
function StationControls({
  activeEra: activeEraStore,
  setActiveEra,
  lodOverride,
  setLodOverride,
  statsRef,
  setPreview,
}: NonNullable<DevPanelProps["stations"]> & { setPreview: Dispatch<SetStateAction<CameraPreview>> }) {
  const activeEra = useStoreValue(activeEraStore);
  const station = getEra(activeEra).index;
  return (
    <section className="dev-panel__section">
      <strong>STATIONS</strong>
      <div className="dev-panel__buttons">
        active era:
        {ERAS.map((era) => (
          <button key={era.id} type="button" className={era.id === activeEra ? "active" : undefined} onClick={() => setActiveEra(era.id)}>
            {era.number} {era.title}
          </button>
        ))}
      </div>
      <div className="dev-panel__toggles">
        tiers:
        {([null, ...STATION_QUALITIES] as const).map((q) => (
          <label key={q ?? "auto"}>
            <input type="radio" name="station-lod" checked={lodOverride === q} onChange={() => setLodOverride(q)} />
            {q ? `all ${q.toUpperCase()}` : "AUTO (by active era)"}
          </label>
        ))}
      </div>
      <div className="dev-panel__buttons">
        active station:
        <button type="button" onClick={() => setPreview({ mode: "station", station, view: "route" })}>
          route view
        </button>
        <button type="button" onClick={() => setPreview({ mode: "station", station, view: "focus" })}>
          focus view
        </button>
        {LOD_PREVIEWS.map(({ axis, distance }) => (
          <button key={distance} type="button" onClick={() => setPreview({ mode: "distance", station, axis, distance })}>
            {axis} {distance} m
          </button>
        ))}
      </div>
      <pre ref={statsRef} />
    </section>
  );
}

/** Layout debug toggles and the static route preview (composition check only). */
function HallLayoutControls({ options, preview, setOptions, setPreview }: NonNullable<DevPanelProps["hall"]>) {
  const layout = getHallLayout();
  const progress =
    preview.mode === "progress" ? preview.progress : preview.mode === "station" ? layout.stations[preview.station].progress : 0;
  const look = preview.mode === "progress" ? preview.look : "ahead";
  const near = layout.stations[nearestStationIndex(progress, layout)];
  const [stationView, setStationView] = useState<StationView>("route");
  const selected = preview.mode === "station" ? layout.stations[preview.station] : null;
  const v3 = (p: readonly number[]) => p.map((n) => n.toFixed(2)).join(", ");

  return (
    <section className="dev-panel__section">
      <strong>HALL LAYOUT</strong>
      <div className="dev-panel__toggles">
        {(Object.keys(OPTION_LABELS) as (keyof HallDebugOptions)[]).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
            />
            {OPTION_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="dev-panel__buttons">
        <button type="button" className={preview.mode === "orbit" ? "active" : undefined} onClick={() => setPreview({ mode: "orbit" })}>
          orbit
        </button>
        {layout.stations.map((s) => (
          <button
            key={s.index}
            type="button"
            className={preview.mode === "station" && preview.station === s.index ? "active" : undefined}
            onClick={() => setPreview({ mode: "station", station: s.index, view: stationView })}
          >
            {s.debugLabel}
          </button>
        ))}
      </div>

      <div className="dev-panel__toggles">
        station view:
        {(["route", "focus"] as const).map((view) => (
          <label key={view}>
            <input
              type="radio"
              name="station-view"
              checked={stationView === view}
              onChange={() => {
                setStationView(view);
                if (preview.mode === "station") setPreview({ ...preview, view });
              }}
            />
            {view === "route" ? "ROUTE VIEW" : "FOCUS VIEW"}
          </label>
        ))}
      </div>
      {selected && (
        <pre className="muted">
          {`${selected.debugLabel}  heading ${((selected.heading * 180) / Math.PI).toFixed(1)}°  progress ${selected.progress.toFixed(4)}
`}
          {`route view  ${v3(selected.view.position)} → ${v3(selected.view.target)}
`}
          {`focus view  ${v3(selected.focusCamera.position)} → ${v3(selected.focusCamera.target)}`}
        </pre>
      )}

      <label className="dev-panel__slider">
        route
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => setPreview({ mode: "progress", progress: Number(e.target.value), look })}
        />
      </label>
      <div className="dev-panel__toggles">
        look:
        {(["ahead", "station"] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="preview-look"
              checked={preview.mode === "progress" && look === mode}
              onChange={() => setPreview({ mode: "progress", progress, look: mode })}
            />
            {mode === "ahead" ? "along route" : "nearest station"}
          </label>
        ))}
      </div>
      <div className="muted">
        progress {progress.toFixed(3)} · {(progress * layout.length).toFixed(1)} / {layout.length.toFixed(1)} m · nearest {near.debugLabel}
      </div>
    </section>
  );
}

function EraVisualControls({ settings }: { settings: ValueStore<EraVisualSettings> }) {
  const value = useStoreValue(settings);
  return <section>
    <strong>ERA VISUAL WORLDS</strong>
    <div><button onClick={() => settings.set({ ...value, enabled: !value.enabled })}>ERA VISUALS {value.enabled ? "ON" : "OFF"}</button></div>
    <label>FORCE ACTIVE ERA visuals <select aria-label="Force active era visuals" value={value.forcedEra ?? "auto"} onChange={event => settings.set({ ...value, forcedEra: event.target.value === "auto" ? null : event.target.value as EraId })}>
      <option value="auto">AUTO (follow route)</option>
      {ERAS.map(era => <option key={era.id} value={era.id}>{era.number} {era.title}</option>)}
    </select></label>
    <div className="muted">Preview changes visual detail/light only. Camera, station LOD and audio keep their real era. One atlas · decorative detail follows QUALITY · one bounded desk shadow light.</div>
  </section>;
}
