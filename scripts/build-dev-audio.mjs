/**
 * Generates the DEVELOPMENT audio placeholders (docs/AUDIO_ENGINE.md §12): one synthetic test
 * tone per era hero record and per development fixture, written to public/audio/<eraId>/dev-placeholder--<trackId>.wav.
 *
 * These are NOT recordings and contain no third-party material — pure sine synthesis from the
 * spec in src/audio/devAudioAssets.ts. Each loops seamlessly and identifies its era by ear:
 * <era number> soft plucks per bar over a quiet drone, pitch rising from ROOTS to GLOBAL; an era's
 * dev record B is a fifth higher, dev record C an octave higher with the plucks off the beat.
 *
 * Usage: npm run audio:dev
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_AUDIO_ASSETS, DEV_AUDIO_SPEC } from "../src/audio/devAudioAssets.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { sampleRate, seconds, barSeconds, frequencies, pluckSpacing, pluckDecay, pluckLevel, droneLevel, variants } = DEV_AUDIO_SPEC;
const frames = Math.round(sampleRate * seconds);
const TAU = Math.PI * 2;

/** Mono float samples → 16-bit PCM WAV. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function synthesize(index, variant) {
  const out = new Float32Array(frames);
  const { pitch, offset } = variants[variant];
  const f = frequencies[index] * pitch;
  // Drone an octave below, rounded to whole cycles per loop so the loop point is seamless;
  // its slow swell (0.25 Hz = 2 cycles per loop) is seamless too.
  const drone = Math.round((f / 2) * seconds) / seconds;
  for (let n = 0; n < frames; n++) {
    const t = n / sampleRate;
    out[n] += droneLevel * Math.sin(TAU * drone * t) * (0.75 + 0.25 * Math.sin(TAU * 0.25 * t));
  }
  // <era number> plucks per bar; tails wrap around the loop end (sample-accurate, seamless).
  const pluckFrames = Math.round(pluckDecay * 8 * sampleRate);
  const plucks = index + 1;
  for (let bar = 0; bar < seconds / barSeconds; bar++) {
    for (let k = 0; k < plucks; k++) {
      const start = Math.round((bar * barSeconds + offset + k * pluckSpacing) * sampleRate);
      for (let m = 0; m < pluckFrames; m++) {
        const t = m / sampleRate;
        const envelope = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / pluckDecay);
        const tone = Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t);
        out[(start + m) % frames] += (pluckLevel * envelope * tone) / 1.47;
      }
    }
  }
  return out;
}

const only = new Set(process.argv.slice(2));
for (const { eraId, eraIndex: index, trackId, url, variant } of DEV_AUDIO_ASSETS) {
  if (only.size && !only.has(trackId)) continue;
  const file = join(root, "public", url);
  const samples = synthesize(index, variant);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak >= 1) throw new Error(`${eraId}: clipping (peak ${peak.toFixed(3)})`);
  mkdirSync(dirname(file), { recursive: true });
  const bytes = wav(samples);
  writeFileSync(file, bytes);
  console.log(`${url}  ${(bytes.length / 1024).toFixed(0)} KiB  ${seconds} s  ${(frequencies[index] * variants[variant].pitch).toFixed(2)} Hz × ${index + 1} plucks (variant ${String.fromCharCode(65 + variant)})  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
}
