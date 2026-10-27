import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { useRef } from 'react';

/** Wraps v into [min, max). */
const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

/**
 * A text band that drifts on its own. Scrolling down speeds it up, scrolling up reverses it,
 * so the band reacts to the reader's own movement. Reduced motion shows it still.
 */
export function VelocityMarquee({ items, baseVelocity = 4 }: { items: string[]; baseVelocity?: number }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], { clamp: false });

  const baseX = useMotionValue(0);
  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);
  const direction = useRef(-1);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const f = velocityFactor.get();
    if (f < 0) direction.current = -1;
    else if (f > 0) direction.current = 1;
    let moveBy = direction.current * baseVelocity * (delta / 1000);
    moveBy += direction.current * moveBy * Math.abs(f);
    baseX.set(baseX.get() + moveBy);
  });

  // Two identical copies, so moving by one copy's width loops without a seam.
  const copy = items.map((text) => (
    <span key={text} className="flex shrink-0 items-center gap-8 pr-8">
      <span>{text}</span>
      <span aria-hidden className="size-3 shrink-0 rotate-45 bg-accent-2" />
    </span>
  ));

  return (
    <div className="overflow-hidden whitespace-nowrap py-2 select-none [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]" aria-hidden>
      <motion.div className="flex w-max" style={{ x: reduce ? 0 : x }}>
        <div className="flex shrink-0">{copy}</div>
        <div className="flex shrink-0">{copy}</div>
      </motion.div>
    </div>
  );
}
