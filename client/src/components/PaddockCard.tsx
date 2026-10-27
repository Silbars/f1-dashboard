import { useState } from 'react';

/** The team colour washed into the dark surface, so every card reads as its team without a flat fill. */
export const cardBackground = (colour: string | null) =>
  `linear-gradient(155deg, color-mix(in oklab, ${colour ?? '#52525b'} 55%, #0b0b0d) 0%, #121214 78%)`;

/** Jolpica names some teams "Alpine F1 Team"; the cards use the short name. */
export const shortTeam = (name: string) => name.replace(/ F1 Team$/, '');

/** A driver photo that fills its box from the bottom; the driver's code stands in when there is no photo. */
export function Headshot({ src, code, className }: { src: string | null; code: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden className={`${className} grid place-items-end justify-center pb-4 text-5xl font-black text-white/15`}>
        {code}
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" className={`${className} object-contain object-bottom`} onError={() => setFailed(true)} />;
}

/** Outer frame shared by driver and team cards; matches the schedule cards. */
export const cardFrame =
  'group block h-full rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/10 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:ring-accent';
