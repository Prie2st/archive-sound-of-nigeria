import type { CSSProperties, ReactNode } from "react";
import { getHomeMedia } from "@/content/homeMedia";
import {
  AFROBEAT,
  AFROBEATS,
  BEATS,
  CITY,
  DIGITAL,
  ESSENCE,
  EXPLOSION,
  FESTAC,
  FINALE,
  GLOBAL,
  HIGHLIFE,
  INDEPENDENCE,
  KENNIS,
  KING_1937,
  LINEAGE,
  LOCAL_SOUND,
  MODERNITIES,
  NAIJA,
  ONE_DANCE,
  OPENING,
  RECORD_1922,
  SYSTEMS,
  WAR_1967,
  YOUTH,
  resolveRecord,
  type BeatId,
  type RecordRef,
} from "@/content/homeStory";
import { ERA_VISUALS } from "@/data/eraVisuals";
import { getEra } from "@/data/eras";
import { Display, Media, Micro, RecordIndex, Reveal, WordList } from "./parts";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * The homepage compositions (docs/PROLOGUE.md §6): one component per historical beat, each art-directed for what
 * changed Nigerian music at that point. Copy: src/content/homeStory.ts · images: src/content/homeMedia.ts.
 */

const LIGHT = new Set(["paper", "chrome"]);

function Beat({ id, className = "", children, labelledBy, steps }: { id: BeatId; className?: string; children: ReactNode; labelledBy?: string; steps?: boolean }) {
  const meta = BEATS.find((beat) => beat.id === id)!;
  const visual = meta.era ? ERA_VISUALS[meta.era] : null;
  const style = visual ? ({ "--era-primary": visual.primary, "--era-secondary": visual.secondary, "--era-accent": visual.accent, "--era-paper": visual.paper, "--era-light": visual.light } as Vars) : undefined;
  return (
    <section
      className={`pro-chapter pro-theme--${meta.theme}${LIGHT.has(meta.theme) ? " pro-tone-light" : ""} pro-${id} ${className}`}
      data-chapter={id}
      aria-labelledby={labelledBy}
      data-steps={steps ? "0" : undefined}
      style={style}
    >
      {children}
    </section>
  );
}

/** "02 · Recording · 1922" — the quiet mark above a beat's first composition. */
function Mark({ id, className = "" }: { id: BeatId; className?: string }) {
  const meta = BEATS.find((beat) => beat.id === id)!;
  if (!meta.era) return null;
  const era = getEra(meta.era);
  return (
    <Micro className={`pro-eramark ${className}`}>
      <span>{String(era.index + 1).padStart(2, "0")}</span>
      <span>{era.title}</span>
      {meta.year && <span>{meta.year}</span>}
    </Micro>
  );
}

/** A sleeve's printed lettering laid over the supplied cover: artist at the top, title at the bottom. */
function SleeveType({ record: ref }: { record: RecordRef }) {
  const record = resolveRecord(ref);
  return (
    <span className="pro-sleevetype" aria-hidden="true">
      <span className="pro-sleevetype__artist">{record.artist}</span>
      <span className="pro-sleevetype__title">{record.title}</span>
    </span>
  );
}

const Body = ({ lines, className = "" }: { lines: readonly string[]; className?: string }) => (
  <Reveal className={`pro-copy ${className}`}>
    {lines.map((line) => (
      <p key={line} className="pro-body">
        {line}
      </p>
    ))}
  </Reveal>
);

// ---------------------------------------------------------------------------------------------------------------

export function Opening() {
  return (
    <Beat id="opening" labelledBy="pro-title">
      <div className="pro-grid pro-opening__top">
        <span className="pro-wordmark pro-opening__mark" role="img" aria-label="Archive" />
      </div>
      <div className="pro-grid pro-opening__middle">
        <div className="pro-opening__lead">
          <Micro className="pro-opening__years">{OPENING.years}</Micro>
          <Display as="p" lines={OPENING.premise} className="pro-opening__premise" />
        </div>
      </div>
      <div className="pro-grid pro-opening__foot">
        <Display as="h1" id="pro-title" lines={OPENING.title} end={[1]} className="pro-display--title pro-opening__title" />
      </div>
    </Beat>
  );
}

/** Before an industry: systems. A pinned talking-drum image beside the scrolling evidence; 1914 as a margin note. */
export function Systems() {
  return (
    <Beat id="systems" labelledBy="pro-systems-title">
      <div className="pro-grid pro-systems__head">
        <Display id="pro-systems-title" lines={SYSTEMS.headline} className="pro-display--headline pro-systems__headline" />
      </div>
      <div className="pro-grid pro-systems__grid">
        <div className="pro-systems__pin">
          <Media id={SYSTEMS.media.drum} className="pro-systems__drum" sizes="(max-width: 760px) 90vw, 36vw" />
        </div>
        <div className="pro-systems__flow">
          <Reveal as="p" className="pro-sub pro-systems__lead">
            {SYSTEMS.lead}
          </Reveal>
          <ol className="pro-systems__list" data-reveal="list" aria-label="Musical systems before recording">
            {SYSTEMS.systems.map((system, index) => (
              <li key={system.text} style={{ "--i": index } as Vars}>
                <span className="pro-systems__people">{system.people}</span>
                <span className="pro-systems__text">{system.text}</span>
              </li>
            ))}
          </ol>
          <Media id={SYSTEMS.media.kakaki} className="pro-systems__kakaki" sizes="(max-width: 760px) 34vw, 14vw" />
          <Reveal as="aside" className="pro-context pro-systems__context">
            <span className="pro-context__year">{SYSTEMS.context.year}</span>
            <span className="pro-context__text">{SYSTEMS.context.text}</span>
            <span className="pro-context__turn">{SYSTEMS.context.turn}</span>
          </Reveal>
        </div>
      </div>
      <div className="pro-grid pro-systems__close">
        <Display lines={SYSTEMS.statement} className="pro-display--statement pro-systems__statement" />
      </div>
    </Beat>
  );
}

/** 1922: the oversized year, the object that changed circulation, and the verbs recording made possible. */
export function Record1922() {
  return (
    <Beat id="record1922" labelledBy="pro-1922-title">
      <div className="pro-grid pro-record1922__top">
        <p className="pro-year pro-record1922__year" aria-hidden="true" data-reveal="">
          {RECORD_1922.year}
        </p>
        <Media id={RECORD_1922.media} className="pro-record1922__disc" sizes="(max-width: 760px) 60vw, 26vw" />
      </div>
      <div className="pro-grid pro-record1922__main">
        <Display id="pro-1922-title" lines={RECORD_1922.headline} className="pro-display--display pro-record1922__headline" />
        <Reveal className="pro-copy pro-record1922__body">
          <p className="pro-body">{RECORD_1922.body[0]}</p>
          <p className="pro-record1922__key">{RECORD_1922.body[1]}</p>
        </Reveal>
        <div className="pro-record1922__verbs">
          <Micro>{RECORD_1922.verbsLead}</Micro>
          <WordList words={RECORD_1922.verbs} className="pro-verbs" label="What recording made possible" />
        </div>
      </div>
      <div className="pro-grid pro-record1922__chain-row">
        <ol className="pro-chain" data-reveal="list" aria-label={RECORD_1922.chain.join(", then ")}>
          {RECORD_1922.chain.map((step, index) => (
            <li key={step} style={{ "--i": index } as Vars}>
              {index > 0 && (
                <i className="pro-chain__arrow" aria-hidden="true">
                  →
                </i>
              )}
              {step}
            </li>
          ))}
        </ol>
      </div>
    </Beat>
  );
}

/** The city: an archival strip — City → Medium → Record. */
export function City() {
  return (
    <Beat id="city" labelledBy="pro-city-title">
      <div className="pro-grid pro-city__head">
        <Display id="pro-city-title" lines={CITY.headline} className="pro-display--display pro-city__headline" />
        <Body lines={CITY.body} className="pro-city__body" />
      </div>
      <ol className="pro-grid pro-strip" aria-label="City, then medium, then record">
        {CITY.sequence.map((step, index) => (
          <li key={step.label} className={`pro-strip__item pro-strip__item--${index}`}>
            <Micro className="pro-strip__label">{step.label}</Micro>
            <Media id={step.media} sizes="(max-width: 760px) 80vw, 30vw" caption={index === 2 ? "none" : "below"}>
              {index === 2 && <SleeveType record={KING_1937.record} />}
            </Media>
          </li>
        ))}
      </ol>
    </Beat>
  );
}

/** 1937: the archive record itself, large — not a random photograph. */
export function King1937() {
  const record = resolveRecord(KING_1937.record);
  return (
    <Beat id="king1937" labelledBy="pro-1937-title">
      <div className="pro-grid pro-king1937__grid">
        <Media id={KING_1937.media} className="pro-king1937__sleeve" sizes="(max-width: 760px) 80vw, 40vw" caption="none">
          <SleeveType record={KING_1937.record} />
        </Media>
        <div className="pro-king1937__card">
          <p className="pro-year pro-king1937__year" aria-hidden="true" data-reveal="">
            {KING_1937.year}
          </p>
          <h2 className="pro-king1937__record" id="pro-1937-title" data-reveal="">
            <span className="ui-visually-hidden">{KING_1937.year}: </span>
            <span className="pro-king1937__artist">{record.artist}</span>
            <span className="pro-king1937__title">{record.title}</span>
          </h2>
          <Micro className="pro-king1937__number">
            {record.catalogueNumber} · {record.genre}
          </Micro>
        </div>
      </div>
      <div className="pro-grid pro-king1937__close">
        <Display lines={KING_1937.keyLine} className="pro-display--statement pro-king1937__key" />
      </div>
    </Beat>
  );
}

export function Highlife() {
  return (
    <Beat id="highlife" labelledBy="pro-highlife-title">
      <div className="pro-grid pro-highlife__head">
        <Display id="pro-highlife-title" lines={HIGHLIFE.headline} className="pro-display--display pro-highlife__headline" />
      </div>
      <div className="pro-grid pro-highlife__grid">
        <Body lines={HIGHLIFE.body} className="pro-highlife__body" />
        <RecordIndex records={HIGHLIFE.records} variant="names" className="pro-highlife__names" label="Highlife bandleaders in the archive" />
        <div className="pro-highlife__mix">
          <Micro>{HIGHLIFE.ingredientsLead}</Micro>
          <WordList words={HIGHLIFE.ingredients} className="pro-highlife__ingredients" label="What highlife combined" />
        </div>
      </div>
    </Beat>
  );
}

/** 1 October 1960 — near full-screen, the only place independence imagery appears. */
export function Independence() {
  return (
    <Beat id="independence" labelledBy="pro-1960-title">
      <div className="pro-independence__scene">
        <Media id={INDEPENDENCE.media} className="pro-independence__media" sizes="100vw" caption="none" reveal="none" />
        <div className="pro-independence__veil" aria-hidden="true" />
        <div className="pro-grid pro-independence__over">
          <p className="pro-independence__date" data-reveal="">
            <span className="pro-year">{INDEPENDENCE.year}</span>
            <span className="pro-independence__day">{INDEPENDENCE.date}</span>
          </p>
          <Display id="pro-1960-title" lines={INDEPENDENCE.headline} shifts={[0, 2, 1]} className="pro-display--display pro-independence__headline" />
        </div>
      </div>
      <div className="pro-grid pro-independence__after">
        <Display lines={INDEPENDENCE.follow} className="pro-display--statement pro-independence__follow" />
        <Reveal as="p" className="pro-body pro-independence__body">
          {INDEPENDENCE.body}
        </Reveal>
        <p className="pro-independence__caption pro-media__credit">{getHomeMedia(INDEPENDENCE.media).caption}</p>
      </div>
    </Beat>
  );
}

/** 1967 — typographic. The regions drift apart as the beat arrives: the landscape reorganises. */
export function War1967() {
  return (
    <Beat id="war1967" labelledBy="pro-1967-title">
      <div className="pro-grid pro-war1967__head">
        <p className="pro-year pro-war1967__year" aria-hidden="true" data-reveal="">
          {WAR_1967.year}
        </p>
        <Display id="pro-1967-title" lines={WAR_1967.headline} end className="pro-display--headline pro-war1967__headline" />
        <Body lines={WAR_1967.body} className="pro-war1967__body" />
      </div>
      <ol className="pro-grid pro-regions" data-reveal="" aria-label="How the popular-music landscape reorganised">
        {WAR_1967.regions.map((region, index) => (
          <li key={region.place} className={`pro-regions__item pro-regions__item--${index}`}>
            <span className="pro-regions__place">{region.place}</span>
            <span className="ui-visually-hidden">: </span>
            <span className="pro-regions__sound">{region.sound}</span>
          </li>
        ))}
      </ol>
    </Beat>
  );
}

/** Authored positions for the genre field (percent; size 1–4; weight; scroll drift). */
const FIELD: readonly { x: number; y: number; size: number; weight: number; drift: number }[] = [
  { x: 2, y: 48, size: 4, weight: 800, drift: 10 },
  { x: 62, y: 52, size: 3, weight: 500, drift: 8 },
  { x: 79.3, y: 60, size: 4, weight: 700, drift: 6 },
  { x: 4, y: 82, size: 2, weight: 300, drift: 12 },
  { x: 38, y: 88.6, size: 3, weight: 600, drift: -10 },
  { x: 72, y: 86, size: 2, weight: 400, drift: 16 },
  { x: 46.3, y: 73, size: 1, weight: 300, drift: -18 },
  { x: 20, y: 70.6, size: 1, weight: 500, drift: 6 },
];

export function Explosion() {
  return (
    <Beat id="explosion" labelledBy="pro-explosion-title">
      <div className="pro-grid pro-explosion__head">
        <Display id="pro-explosion-title" lines={EXPLOSION.headline} className="pro-display--headline pro-explosion__headline" />
        <Body lines={EXPLOSION.body} className="pro-explosion__body" />
      </div>
      <div className="pro-explosion__field">
        <ul className="pro-explosion__genres" aria-label="Genres existing at once">
          {EXPLOSION.genres.map((genre, index) => {
            const at = FIELD[index];
            return (
              <li key={genre} className={`pro-genre pro-genre--${at.size}`} style={{ "--x": `${at.x}%`, "--y": `${at.y}%`, "--w": at.weight, "--drift": at.drift, "--delay": `${index * 60}ms` } as Vars} data-reveal="">
                {genre}
              </li>
            );
          })}
        </ul>
        <Display lines={EXPLOSION.burst} shifts={[0, 3]} className="pro-display--mega pro-explosion__burst" />
      </div>
    </Beat>
  );
}

/** Afrobeat — Fela here, and only here. */
export function Afrobeat() {
  const record = resolveRecord(AFROBEAT.record);
  return (
    <Beat id="afrobeat" labelledBy="pro-afrobeat-title">
      <div className="pro-grid pro-afrobeat__grid">
        <Media id={AFROBEAT.media} className="pro-afrobeat__fela" sizes="(max-width: 760px) 80vw, 34vw" />
        <div className="pro-afrobeat__copy">
          <Display id="pro-afrobeat-title" lines={AFROBEAT.name} className="pro-display--display pro-afrobeat__name" />
          <Micro className="pro-afrobeat__record">
            {record.title} · {record.date}
          </Micro>
          <div className="pro-dna" role="group" aria-label={`${AFROBEAT.dna.inputs.join(" plus ")} became ${AFROBEAT.dna.result}`}>
            <p className="pro-dna__inputs" data-reveal="list" aria-hidden="true">
              {AFROBEAT.dna.inputs.map((input, index) => (
                <span key={input} style={{ "--i": index } as Vars}>
                  {index > 0 && <i>+</i>}
                  {input}
                </span>
              ))}
            </p>
            <p className="pro-dna__result" aria-hidden="true" data-reveal="">
              {AFROBEAT.dna.result}
            </p>
          </div>
          <Reveal as="p" className="pro-body pro-afrobeat__note">
            {AFROBEAT.note}
          </Reveal>
        </div>
      </div>
    </Beat>
  );
}

/** Jùjú / Fuji / Apala — three modernities side by side, deliberately away from Fela. */
export function Modernities() {
  const { juju, fuji, apala } = MODERNITIES;
  return (
    <Beat id="modernities" labelledBy="pro-modernities-title">
      <h2 className="ui-visually-hidden" id="pro-modernities-title">
        Jùjú, fuji and apala
      </h2>
      <div className="pro-grid pro-modernities__grid">
        <article className="pro-modern pro-modern--juju">
          <p className="pro-modern__genre" data-reveal="">
            {juju.name}
          </p>
          <Media id={juju.media} className="pro-modern__media" sizes="(max-width: 760px) 80vw, 26vw" />
          <WordList words={juju.artists} className="pro-modern__artists" label="Jùjú artists" />
          <WordList words={juju.traits} className="pro-modern__traits" label="What modern jùjú used" />
        </article>
        <article className="pro-modern pro-modern--fuji">
          <p className="pro-modern__genre" data-reveal="">
            {fuji.name}
          </p>
          <ol className="pro-modern__lineage" data-reveal="list" aria-label={fuji.lineage.join(", then ")}>
            {fuji.lineage.map((step, index) => (
              <li key={step} style={{ "--i": index } as Vars}>
                {index > 0 && <i aria-hidden="true">↓</i>}
                {step}
              </li>
            ))}
          </ol>
          <WordList words={fuji.artists} className="pro-modern__artists" label="Fuji artists" />
        </article>
        <article className="pro-modern pro-modern--apala">
          <p className="pro-modern__genre" data-reveal="">
            {apala.name}
          </p>
          <Media id={apala.media} className="pro-modern__media pro-modern__sleeve" sizes="(max-width: 760px) 60vw, 18vw" caption="none" reveal="fade" />
          <WordList words={apala.artists} className="pro-modern__artists" label="Apala artist" />
        </article>
      </div>
      <div className="pro-grid pro-modernities__close">
        <Display lines={MODERNITIES.keyLine} end={[3, 4]} className="pro-display--display pro-modernities__key" />
      </div>
    </Beat>
  );
}

export function Festac() {
  return (
    <Beat id="festac" labelledBy="pro-festac-title">
      <div className="pro-grid pro-festac__head">
        <p className="pro-festac__name" data-reveal="">
          <span className="pro-year">{FESTAC.year}</span>
          <span className="pro-festac__word">{FESTAC.name}</span>
        </p>
        <Display id="pro-festac-title" lines={FESTAC.headline} end className="pro-display--headline pro-festac__headline" />
      </div>
      <Media id={FESTAC.media} className="pro-festac__media" sizes="100vw" />
      <div className="pro-grid pro-festac__after">
        <Body lines={FESTAC.body} className="pro-festac__body" />
      </div>
    </Beat>
  );
}

/** The 1980s told through the archive's sleeves, not through later photographs. */
export function LocalSound() {
  return (
    <Beat id="localsound" labelledBy="pro-localsound-title">
      <div className="pro-grid pro-localsound__head">
        <Display id="pro-localsound-title" lines={LOCAL_SOUND.headline} className="pro-display--display pro-localsound__headline" />
      </div>
      <ol className="pro-grid pro-localsound__records" aria-label="Archive records">
        {LOCAL_SOUND.records.map((ref, index) => {
          const record = resolveRecord(ref);
          return (
            <li key={record.id} className={`pro-localsound__item pro-localsound__item--${index}`}>
              <Media id={LOCAL_SOUND.sleeves[index]} sizes="(max-width: 760px) 60vw, 24vw" caption="none" />
              <p className="pro-localsound__artist">{record.artist}</p>
              <p className="pro-localsound__title">{record.title}</p>
              <Micro>{[record.catalogueNumber, record.date, record.genre].filter(Boolean).join(" · ")}</Micro>
            </li>
          );
        })}
      </ol>
    </Beat>
  );
}

export function Youth() {
  return (
    <Beat id="youth" labelledBy="pro-youth-title">
      <div className="pro-grid pro-youth__head">
        <Display id="pro-youth-title" lines={YOUTH.headline} className="pro-display--display pro-youth__headline" />
        <Media id={YOUTH.media} className="pro-youth__tape" sizes="(max-width: 760px) 80vw, 34vw" />
      </div>
      <div className="pro-grid pro-youth__flow">
        <Body lines={YOUTH.body} className="pro-youth__body" />
        <div className="pro-youth__consuming">
          <Micro>{YOUTH.consumingLead}</Micro>
          <WordList words={YOUTH.consuming} className="pro-youth__imports" label="What young musicians were listening to" />
        </div>
        <Reveal as="p" className="pro-sub pro-youth__turn">
          {YOUTH.turn}
        </Reveal>
        <WordList words={YOUTH.vocabulary} className="pro-youth__vocabulary" label="How rap became Nigerian" />
        <RecordIndex records={YOUTH.records} variant="schedule" className="pro-youth__records" label="1990s records in the archive" />
      </div>
      <div className="pro-grid pro-youth__qa">
        <Display lines={YOUTH.question} className="pro-display--statement pro-youth__question" />
        <Display lines={YOUTH.answer} end className="pro-display--headline pro-youth__answer" />
      </div>
    </Beat>
  );
}

/** 1998 — typography carries the industry moment (no forced imagery). */
export function Kennis() {
  return (
    <Beat id="kennis" labelledBy="pro-kennis-title">
      <div className="pro-grid pro-kennis__grid">
        <div className="pro-kennis__left">
          <p className="pro-year pro-kennis__year" aria-hidden="true" data-reveal="">
            {KENNIS.year}
          </p>
          <Display lines={KENNIS.name} className="pro-display--headline pro-kennis__name" />
        </div>
        <div className="pro-kennis__right">
          <Display id="pro-kennis-title" lines={KENNIS.headline} className="pro-display--headline pro-kennis__headline" />
          <Reveal as="p" className="pro-body pro-kennis__body">
            {KENNIS.body}
          </Reveal>
          <div className="pro-kennis__generation">
            <Micro>{KENNIS.generationLabel}</Micro>
            <WordList words={KENNIS.generation} className="pro-kennis__names" label="Late-1990s youth-pop names" />
          </div>
        </div>
      </div>
    </Beat>
  );
}

export function Naija() {
  return (
    <Beat id="naija" labelledBy="pro-naija-title">
      <p className="pro-naija__word" aria-hidden="true" data-reveal="">
        {NAIJA.word}
      </p>
      <div className="pro-grid pro-naija__head">
        <Display id="pro-naija-title" lines={NAIJA.headline} className="pro-display--headline pro-naija__headline" />
      </div>
      <div className="pro-grid pro-naija__mix-row">
        <div className="pro-naija__equation">
          <Micro>{NAIJA.lead}</Micro>
          <p className="pro-naija__mix" data-reveal="list">
            {NAIJA.mix.map((part, index) => (
              <span key={part} style={{ "--i": index } as Vars}>
                {index > 0 && <i aria-hidden="true">+</i>}
                {part}
              </span>
            ))}
          </p>
        </div>
        <div className="pro-naija__point">
          <p className="pro-body">{NAIJA.point[0]}</p>
          <p className="pro-naija__permission" data-reveal="">
            {NAIJA.point[1]}
          </p>
        </div>
        <div className="pro-naija__objects">
          {NAIJA.objects.map((id) => (
            <Media key={id} id={id} className="pro-naija__object" sizes="(max-width: 760px) 44vw, 16vw" />
          ))}
        </div>
      </div>
      <ul className="pro-grid pro-sleeves pro-naija__sleeves" aria-label="Naija-era records in the archive">
        {NAIJA.records.map((ref, index) => {
          const record = resolveRecord(ref);
          return (
            <li key={record.id}>
              <Media id={NAIJA.sleeves[index]} sizes="(max-width: 760px) 30vw, 16vw" caption="none" reveal="fade" />
              <span className="pro-sleeves__artist">{record.artist}</span>
              <span className="pro-sleeves__title">
                {record.title}
                {record.date ? ` · ${record.date}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="pro-grid pro-naija__close">
        <Display lines={NAIJA.keyLine} className="pro-display--statement pro-naija__key" />
      </div>
    </Beat>
  );
}

/** The distance shrinks: a directional diagram rather than a photograph. */
export function Digital() {
  return (
    <Beat id="digital" labelledBy="pro-digital-title">
      <div className="pro-grid pro-digital__head">
        <Display id="pro-digital-title" lines={DIGITAL.headline} className="pro-display--headline pro-digital__headline" />
        <WordList words={DIGITAL.channels} className="pro-digital__channels" label="Channels" />
        <Body lines={DIGITAL.body} className="pro-digital__body" />
      </div>
      <div className="pro-grid pro-route" data-reveal="" role="group" aria-label={`${DIGITAL.route.from}, through ${DIGITAL.route.via.join(", ")}, to ${DIGITAL.route.to.join(", ")}`}>
        <p className="pro-route__from" aria-hidden="true">
          {DIGITAL.route.from}
        </p>
        <span className="pro-route__arrow" aria-hidden="true">
          →
        </span>
        <ul className="pro-route__via" aria-hidden="true">
          {DIGITAL.route.via.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <span className="pro-route__arrow" aria-hidden="true">
          →
        </span>
        <ul className="pro-route__to" aria-hidden="true">
          {DIGITAL.route.to.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
      </div>
    </Beat>
  );
}

export function Afrobeats() {
  const { left, right } = AFROBEATS.distinction;
  return (
    <Beat id="afrobeats" labelledBy="pro-distinction-title">
      <div className="pro-grid pro-afrobeats__distinction">
        <h2 className="pro-afrobeats__neq" id="pro-distinction-title" data-reveal="">
          <span>{left.term}</span>
          <span className="pro-afrobeats__neq-sign" aria-label="is not">
            ≠
          </span>
          <span>{right.term}</span>
        </h2>
        <Reveal className="pro-afrobeats__def pro-afrobeats__def--left">
          <Micro>{left.term}</Micro>
          <p className="pro-body">{left.text}</p>
        </Reveal>
        <Reveal className="pro-afrobeats__def pro-afrobeats__def--right" delay={120}>
          <Micro>{right.term}</Micro>
          <p className="pro-body">{right.text}</p>
        </Reveal>
      </div>
      <div className="pro-grid pro-afrobeats__scene">
        <Media id={AFROBEATS.media.performance} className="pro-afrobeats__wizkid" sizes="(max-width: 760px) 70vw, 26vw" />
        <RecordIndex records={AFROBEATS.records} variant="credits" className="pro-afrobeats__records" label="Afrobeats-era records in the archive" />
      </div>
      <div className="pro-grid pro-afrobeats__home">
        <Media id={AFROBEATS.media.nativeland} className="pro-afrobeats__nativeland" sizes="(max-width: 760px) 100vw, 66vw" />
        <div className="pro-afrobeats__home-copy">
          <Display lines={AFROBEATS.nativelandLine} className="pro-display--statement" />
          <Reveal as="p" className="pro-body">
            {AFROBEATS.nativelandText}
          </Reveal>
        </div>
      </div>
    </Beat>
  );
}

/** 2016 — a short beat, conservatively worded. */
export function OneDance() {
  return (
    <Beat id="onedance" labelledBy="pro-onedance-title">
      <div className="pro-grid pro-onedance__grid">
        <Display id="pro-onedance-title" lines={ONE_DANCE.headline} className="pro-display--display pro-onedance__headline" />
        <Media id={ONE_DANCE.media} className="pro-onedance__sleeve" sizes="(max-width: 760px) 60vw, 22vw" caption="none" />
        <div className="pro-onedance__card" data-reveal="">
          <span className="pro-year">{ONE_DANCE.year}</span>
          <span className="pro-onedance__credit">
            {ONE_DANCE.credit.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </span>
          <span className="pro-onedance__title">{ONE_DANCE.title}</span>
        </div>
        <Reveal as="p" className="pro-body pro-onedance__body">
          {ONE_DANCE.body}
        </Reveal>
      </div>
    </Beat>
  );
}

export function Essence() {
  const record = resolveRecord(ESSENCE.record);
  return (
    <Beat id="essence" labelledBy="pro-essence-title">
      <div className="pro-grid pro-essence__grid">
        <p className="pro-year pro-essence__year" aria-hidden="true" data-reveal="">
          {ESSENCE.year}
        </p>
        <Media id={ESSENCE.media} className="pro-essence__sleeve" sizes="(max-width: 760px) 70vw, 28vw" caption="none" />
        <div className="pro-essence__copy">
          <Mark id="essence" />
          <h2 className="pro-essence__record" id="pro-essence-title" data-reveal="">
            <span className="pro-essence__artist">{record.artist}</span>
            <span className="pro-essence__title">{record.title}</span>
          </h2>
          <Reveal as="p" className="pro-body">
            {ESSENCE.body}
          </Reveal>
        </div>
      </div>
      <div className="pro-grid pro-essence__close">
        <Display lines={ESSENCE.keyLine} end className="pro-display--statement pro-essence__key" />
      </div>
    </Beat>
  );
}

/** Global: the sequenced headline over the international stage, then fragmentation, then Lagos as counterweight. */
export function Global() {
  return (
    <Beat id="global" labelledBy="pro-global-title" steps>
      <div className="pro-global__pin">
        <div className="pro-global__stage">
          <Media id={GLOBAL.media.stage} className="pro-global__media" sizes="100vw" caption="none" reveal="none" />
          <div className="pro-global__veil" aria-hidden="true" />
          <div className="pro-grid pro-global__over">
            <h2 className="pro-display pro-display--display pro-global__headline" id="pro-global-title">
              {GLOBAL.headline.map((line, index) => (
                <span key={line} className="pro-line pro-global__line" data-step-line={index + 1}>
                  <span className="pro-line__inner">
                    {line}
                    {index < GLOBAL.headline.length - 1 ? " " : ""}
                  </span>
                </span>
              ))}
            </h2>
            <p className="pro-global__answer" data-step-line={5}>
              {GLOBAL.answer.map((line) => (
                <span key={line}>{line} </span>
              ))}
            </p>
            <p className="pro-global__caption pro-media__credit">{getHomeMedia(GLOBAL.media.stage).caption}</p>
          </div>
        </div>
        <div className="pro-global__steps" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="pro-step" data-step={step} />
          ))}
        </div>
      </div>
      <div className="pro-grid pro-global__after">
        <WordList words={GLOBAL.names} className="pro-global__names" label="Nigerian artists in global pop" />
        <WordList words={GLOBAL.genres} className="pro-global__genres" label="Directions in current Nigerian pop" />
        <Reveal as="p" className="pro-sub pro-global__fragmentation">
          {GLOBAL.fragmentation}
        </Reveal>
      </div>
      <div className="pro-grid pro-global__home">
        <Media id={GLOBAL.media.home} className="pro-global__ayra" sizes="(max-width: 760px) 80vw, 30vw" />
        <Display lines={GLOBAL.contrast} shifts={[3, 3, 6]} className="pro-display--display pro-global__contrast" />
      </div>
    </Beat>
  );
}

/** The thread: earlier evidence reused as fragments, the lineages, the sentence, then — only now — the thesis. */
export function Lineage() {
  return (
    <Beat id="lineage" labelledBy="pro-lineage-title">
      <div className="pro-grid pro-lineage__head">
        <Display id="pro-lineage-title" lines={LINEAGE.headline} className="pro-display--display pro-lineage__headline" />
      </div>
      <ol className="pro-grid pro-lineages" aria-label="Musical lineages">
        {LINEAGE.lineages.map((lineage, index) => (
          <li key={lineage.steps.join()} className="pro-lineage-item" data-reveal="" style={{ "--delay": `${index * 90}ms` } as Vars}>
            <p className="pro-lineage__from">
              {lineage.from.map((source, at) => (
                <span key={source}>
                  {at > 0 && <i aria-hidden="true"> + </i>}
                  {source}
                </span>
              ))}
            </p>
            {lineage.steps.map((step) => (
              <p key={step} className="pro-lineage__step">
                <i aria-hidden="true">↓</i>
                <span className="ui-visually-hidden">then </span>
                {step}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <div className="pro-grid pro-lineage__statement-row">
        <Display lines={LINEAGE.statement} className="pro-display--statement pro-lineage__statement" />
      </div>
      <div className="pro-grid pro-thesis-row">
        <ol className="pro-thesis" data-reveal="list" aria-label={`The archive's thesis: ${LINEAGE.thesis.join(", then ").toLowerCase()}`}>
          {LINEAGE.thesis.map((stage, index) => (
            <li key={stage} style={{ "--i": index } as Vars}>
              {index > 0 && <i aria-hidden="true">↓</i>}
              <span>{stage}</span>
            </li>
          ))}
        </ol>
      </div>
    </Beat>
  );
}

export function Finale() {
  return (
    <Beat id="finale" labelledBy="pro-finale-title">
      <div className="pro-grid pro-finale__grid">
        <dl className="pro-finale__figures" data-reveal="list">
          {FINALE.figures.map((figure, index) => (
            <div key={figure.label} style={{ "--i": index } as Vars}>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
        <Display id="pro-finale-title" lines={FINALE.unfinished} className="pro-display--display pro-finale__unfinished" />
        <Display as="p" lines={FINALE.invitation} end className="pro-display--headline pro-finale__invitation" />
      </div>
      <div className="pro-finale__wordmark" aria-hidden="true">
        <span className="pro-finale__wordmark-art" />
      </div>
    </Beat>
  );
}

