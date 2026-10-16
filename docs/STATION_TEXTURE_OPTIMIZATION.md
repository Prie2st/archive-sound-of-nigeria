# Station Texture Memory Optimization

Status: **done** (pipeline + profiles 2026-10-14; memory and visual check completed
2026-10-14 together with the eight-station milestone, see §6–7).

Source of truth: [`src/data/textureProfiles.ts`](../src/data/textureProfiles.ts)
(`STATION_TEXTURE_RULES`: one rule per material slot and profile). Build:
`scripts/build-models.mjs`. Audit: `npm run audit:textures` (`-- --detail` adds content
spread, down-scaling error and texel density).

---

## 1. Before

The station models carried 20 textures; 17 of them 2048² (uniform 2048 px cap in the
build), decoded as RGBA8 + mips on the GPU: **366.7 MB** (table 64.0 · turntable 170.7 ·
vinyl 132.0). Measured renderer estimate for hall + ROOTS at the time: ≈596 MB.

## 2. Audit findings (`npm run audit:textures -- --detail`)

| Model · material slot(s) | Source | Map / data | Alpha | Detail (σ, ½-res RMS error /255) | Texel density @2048 | Seen close? |
|---|---|---|---|---|---|---|
| Table · `End_Table.baseColor` | 4096² PNG | colour (wood grain + frame) | — | σ 65/49/38 · ½: 8.1 | 1.44 /mm | yes (focus) |
| Table · `End_Table.normal` | 4096² PNG | non-colour | — | σ 37/36/24 · ½: 4.0 | 1.44 /mm | yes |
| Table · `End_Table.metallicRoughness` | 4096² PNG | non-colour (roughness + metal mask) | — | σ 34/92 · ½: 3.5 | 1.44 /mm | yes |
| Turntable · `chrome` + `metalbrushedblack` MR (shared) | 2048² PNG | non-colour, **tiling** | — | σ ≤ 6 · ½: 1.3 | 59–134 /mm | yes, but always minified |
| Turntable · `chrome.CHINCHE` (gold) MR | 2048² PNG | non-colour, tiling | — | σ ≤ 6 · ½: 2.1 | 197 /mm | idem |
| Turntable · `chrome.CHINCHE` normal | 2048² JPEG | non-colour, tiling, almost flat | — | σ < 1 · ½: 0.8 | 197 /mm | idem |
| Turntable · `metalbrushedblack` normal + clearcoat normal (shared) | 2048² PNG | non-colour, tiling, almost flat | — | σ < 1 · ½: 0.6 | 134 /mm | idem |
| Turntable · `plasticshiny` MR | 2048² PNG | non-colour, tiling | — | σ ≤ 7 · ½: 1.7 | 199 /mm | idem |
| Turntable · `plasticshiny` + `rubber` normal (shared) | 2048² PNG | non-colour, almost flat | — | σ < 0.5 · ½: 0.4 | 199 / 3.4 /mm | idem |
| Turntable · `rubber` MR (slip mat) | 2048² PNG | non-colour noise | — | σ 7 · ½: 2.1 | 3.4 /mm | hidden under the record |
| Turntable · `rubber.specular` | 2048² PNG | non-colour, **alpha = specular strength** | used | α σ 4.5 | 3.4 /mm | hidden under the record |
| Vinyl · `VinylSideA` base / MR / normal | 4096² PNG | colour + non-colour (grooves) | — | normal ½: 6.1 (fine grooves) | 6.6 /mm | **yes — closest surface** |
| Vinyl · `VinylSideB` base / MR / normal | 4096² PNG | underside | — | idem | 6.6 /mm | only while a record is lifted |
| Vinyl · `Label` / `SleeveFront` / `SleeveBack` | 512² placeholders | colour, flat | — | σ ≈ 4 | 5.1 / 1.6 /mm | yes; replaced per track at runtime |

Screen density in the closest authored view (focus, 2 m, 50° FOV): ≈0.46 px/mm at the test
viewport (852 px tall), ≈0.58 at 1080p, ≈1.2 on a 4K screen. Where a texture's density stays
above that, the GPU samples a smaller mip level anyway — extra resolution is never seen.

## 3. Profiles (after)

Maximum edge per profile (every texture has a rule; the build fails otherwise):

| Rule | HIGH | MEDIUM (default) | LOW | Why |
|---|---:|---:|---:|---|
| Table base colour + normal | **2048** | 1024 | 512 | real wood-grain detail; 2048 only pays off on ≥1440p |
| Table metallic-roughness | 1024 | 1024 | 512 | soft content |
| Turntable tiling detail maps (7 textures) | 512 | 512 | 256 | ≥15 texels/mm even at 512 — always minified |
| Turntable slip mat MR + specular | 1024 | 512 | 256 | the only non-tiling turntable maps; hidden under the record |
| Vinyl side A (3) | 1024 | 1024 | 512 | 3.3 texels/mm at 1024 ≈ 3× the focus screen density, even on 4K |
| Vinyl side B (3) | 1024 | 512 | 256 | underside, seen only mid-switch |
| Label / sleeve placeholders (3) | 512 | 512 | 256 | flat placeholders |

**Only texture above 1024 in any profile: the table's base colour and normal map in HIGH**
(justified only for ≥1440p displays at focus distance). No texture exceeds 1024 in MEDIUM.

Decoded memory and file sizes of the station models:

| | reference (before) | HIGH | **MEDIUM** | LOW |
|---|---:|---:|---:|---:|
| Table textures | 64.0 MB | 48.0 MB | **16.0 MB** | 4.0 MB |
| Turntable textures | 170.7 MB | 18.7 MB | **10.7 MB** | 2.7 MB |
| Vinyl textures | 132.0 MB | 36.0 MB | **24.0 MB** | 6.0 MB |
| **Station textures total** | **366.7 MB** | 102.7 MB | **50.7 MB** | 12.7 MB |
| Files (table / turntable / vinyl, MiB, before LOD tiers) | 0.53 / 7.53 / 0.83 | 0.49 / 5.77 / 0.44 | 0.15 / 5.40 / 0.40 | 0.05 / 5.31 / 0.32 |

(The turntable / vinyl files grew later by the LOD tiers' geometry: medium 6.88 / 0.41 MiB.)

Geometry is identical in every profile (same triangles, vertices and buffer bytes — verified);
the `reference` variant is byte-identical to the pre-optimisation build.

## 4. Format: WebP kept, KTX2 deferred

WebP (`EXT_texture_webp`) stays. It is lossy on disk but decodes to RGBA8 on the GPU, so the
memory saving comes from the resolutions above. **KTX2 / Basis** (UASTC → BC7/ASTC 1 byte/px,
ETC1S → BC1/ETC 0.5 byte/px: 4–8× less GPU memory) was evaluated but not adopted:
three's KTX2Loader and Basis transcoder are available, but no encoder is installed here
(`toktx` CLI absent, no npm encoder in the project), normal maps need UASTC to avoid
artefacts, and the remaining saving on the station models is ≈37 MB of 50.7 MB. The bigger
KTX2 target is the marble hall (≈165 MB of textures) — a possible later optimisation.

## 5. Dev usage

`?textures=high|medium|low|reference` (DEV INSPECTOR links). `reference` must be built first:
`npm run models -- table turntable --profiles=reference`.

## 6. Measured memory (renderer estimate, eight stations, 2026-10-14)

Same scene (hall + 8 stations, ROOTS active), estimate = unique geometry + textures as RGBA8
with mips:

| | reference textures | MEDIUM |
|---|---:|---:|
| Station model textures | 366.7 MB (20) | **50.7 MB (20)** |
| Renderer total | 618 MB | **301 MB** |

Hall only: 207 MB. Station textures are shared by all eight stations and all LOD tiers (no
duplication). FPS is unaffected by texture size (same draw calls / triangles); see
docs/STATION_LOD.md §7 for frame rates.

## 7. Visual comparison

ROOTS, reference vs MEDIUM, in the dev view at 758 × 426 @ DPR 2: worst-case close-up
(focus axis, 1 m) and the authored focus view (2.02 m). Gold top plate, chrome, controls,
platter strobe ring, tonearm, record grooves, label, sleeve and table show **no visible
difference** at the test resolution; route views (6 m) are identical. Not yet checked on a
≥1440p display at focus distance — that is where HIGH's 2048 table maps would matter.

## 8. Remaining risks

- Real label / sleeve artwork will be loaded at runtime per track; size it to the same
  densities (sleeve 1024², label 512–1024²) and dispose replaced textures (CLAUDE.md §8).
- The marble hall's ≈165 MB of textures is now the dominant texture cost (not in scope).
- Lanczos down-scaling of normal maps is not renormalised; at these resolutions the error is
  below visibility, but re-check if a normal-mapped surface ever looks flat.
