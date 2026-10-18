import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { getHomeMedia } from "@/content/homeMedia";
import { MOBILE_BREAK, resolveRecord, type Lines, type RecordRef } from "@/content/homeStory";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Display typography with authored line breaks (docs/PROLOGUE.md §5). Each line is its own block inside a mask so
 * it can rise from its baseline; `shifts` indents single lines by twelfths of the block (the line breaks and the
 * offsets ARE the composition). " | " inside a line is the extra break phones take; *…* marks an accent run (styled
 * per composition). `align` lines up to the end: `true` for every line, or the indices that should (a block can
 * turn from flush-left to flush-right half way). A space is kept between lines for copy / paste and assistive
 * technology.
 */
export function Display({
  lines,
  as: Tag = "h2",
  className = "",
  id,
  shifts,
  end,
  reveal = true,
}: {
  lines: Lines;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  id?: string;
  shifts?: readonly number[];
  /** Lines set flush right: all of them, or these indices. */
  end?: true | readonly number[];
  reveal?: boolean;
}) {
  const atEnd = (index: number) => end === true || (Array.isArray(end) && end.includes(index));
  return (
    <Tag className={`pro-display ${className}`} id={id} data-reveal={reveal ? "lines" : undefined}>
      {lines.map((line, index) => (
        <span key={index} className={`pro-line${atEnd(index) ? " pro-line--end" : ""}`} style={{ "--i": index, "--shift": shifts?.[index] ?? 0 } as Vars}>
          <span className="pro-line__inner">
            {line.split(MOBILE_BREAK).map((part, at) => (
              <span key={at}>
                {at > 0 && <span className="pro-br"> </span>}
                <Accents text={part} />
              </span>
            ))}
            {index < lines.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/** "*…*" runs become accent spans (emphasis carried by colour or weight, per composition). */
function Accents({ text }: { text: string }) {
  if (!text.includes("*")) return <>{text}</>;
  return (
    <>
      {text.split("*").map((run, index) => (index % 2 === 1 ? <em key={index} className="pro-accent">{run}</em> : run))}
    </>
  );
}

/** A short editorial block that fades / lifts in once (IntersectionObserver in Prologue). */
export function Reveal({ as: Tag = "div", className = "", children, delay = 0 }: { as?: "div" | "p" | "ul" | "ol" | "aside"; className?: string; children: ReactNode; delay?: number }) {
  return (
    <Tag className={className} data-reveal="" style={delay ? ({ "--delay": `${delay}ms` } as Vars) : undefined}>
      {children}
    </Tag>
  );
}

/**
 * One homepage image (src/content/homeMedia.ts). Final images render with their crop (`objectPosition`), lazily.
 * A pending slot with a designed image (`placeholderSrc`) shows that image; photographs carry the archive-card
 * words over it (title · place · year · kind, in `overlay.ink`), sleeves show the cover alone. A slot with no image
 * at all renders the archive card itself (IMAGE PENDING …). Replacing an image is a mapping change only.
 * `children` are extra words laid over the frame by a composition (e.g. a sleeve's printed lettering).
 * `variant="fragment"`: small reused evidence crops.
 */
export function Media({
  id,
  className = "",
  sizes,
  caption = "below",
  reveal = "mask",
  variant = "full",
  children,
}: {
  id: string;
  className?: string;
  sizes: string;
  caption?: "below" | "none";
  reveal?: "mask" | "fade" | "none";
  variant?: "full" | "fragment";
  children?: ReactNode;
}) {
  const media = getHomeMedia(id);
  const pending = media.status === "placeholder";
  const shown = media.src ?? media.placeholderSrc;
  const words = pending && shown && media.placeholder && media.overlay && variant === "full" ? media.placeholder : null;
  return (
    <figure
      className={`pro-media pro-media--${media.status} pro-media--${media.role} pro-media--${variant} ${className}`}
      data-reveal={reveal === "none" ? undefined : reveal}
      data-slot={pending ? media.label : undefined}
      style={
        {
          "--aspect": media.aspectRatio.replace("/", " / "),
          "--focus": media.objectPosition,
          ...(media.overlay ? { "--over-ink": media.overlay.ink, "--over-scrim": media.overlay.scrim ?? "none" } : {}),
        } as Vars
      }
    >
      <div className="pro-media__frame">
        {shown ? (
          <>
            <Image className="pro-media__img" src={shown} alt={media.alt} fill sizes={sizes} style={{ objectFit: "cover", objectPosition: media.objectPosition }} />
            {words && (
              <div className="pro-media__over" aria-hidden="true">
                <span className="pro-media__slot-title">{words.title}</span>
                <span className="pro-media__slot-foot">
                  <span>{words.place}</span>
                  {words.year && <span>{words.year}</span>}
                  <span>{words.kind}</span>
                </span>
              </div>
            )}
            {children}
          </>
        ) : (
          <div className="pro-media__slot" role="img" aria-label={`Image pending: ${media.alt}`}>
            <span className="pro-media__slot-kicker" aria-hidden="true">
              Image pending
            </span>
            <span className="pro-media__slot-title" aria-hidden="true">
              {media.placeholder?.title}
            </span>
            {variant === "full" && media.placeholder && (
              <span className="pro-media__slot-foot" aria-hidden="true">
                <span>{media.placeholder.place}</span>
                <span>{media.placeholder.year}</span>
                <span>{media.placeholder.kind}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {caption !== "none" && (
        <figcaption className="pro-media__caption">
          <span>{media.caption}</span>
          {pending && !shown && <span className="pro-media__credit">Archive image pending</span>}
          {!pending && media.credit && <span className="pro-media__credit">{[media.credit, media.source, media.license].filter(Boolean).join(" · ")}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Records cited by a beat, worded by the catalogue (`resolveRecord` → describeTrack). The variant decides the
 * typographic treatment — beats set their records differently.
 */
export function RecordIndex({ records, variant, className = "", label }: { records: readonly RecordRef[]; variant: "names" | "index" | "schedule" | "stack" | "credits" | "sleeves"; className?: string; label: string }) {
  return (
    <ol className={`pro-records pro-records--${variant} ${className}`} aria-label={label} data-reveal="list">
      {records.map((ref, index) => {
        const record = resolveRecord(ref);
        return (
          <li key={record.id} className="pro-record" style={{ "--i": index } as Vars}>
            <span className="pro-record__number">{record.catalogueNumber}</span>
            <span className="pro-record__artist">{record.artist}</span>
            <span className="pro-record__title">{record.title}</span>
            {record.date && <span className="pro-record__date">{record.date}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Small uppercase label (functional sans, wide tracking). */
export function Micro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`pro-micro ${className}`}>{children}</p>;
}

/** Plain list of names or words, set as typography (no records behind them). */
export function WordList({ words, className = "", label }: { words: Lines; className?: string; label?: string }) {
  return (
    <ul className={className} aria-label={label} data-reveal="list">
      {words.map((word, index) => (
        <li key={word} style={{ "--i": index } as Vars}>
          {word}
        </li>
      ))}
    </ul>
  );
}
