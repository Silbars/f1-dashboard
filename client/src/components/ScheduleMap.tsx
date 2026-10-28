import type { Race } from '@f1/shared';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';

const PIN = 'grid size-6 cursor-pointer place-items-center rounded-full text-[11px] font-bold tabular-nums ring-4 ring-zinc-950';
const PIN_COLOUR = {
  next: 'bg-accent text-accent-ink',
  past: 'bg-zinc-700 text-zinc-200',
  upcoming: 'bg-zinc-100 text-zinc-900',
};

/** One numbered pin per circuit; clicking a pin scrolls to that race's card. The map frames the whole calendar once, on load. */
export default function ScheduleMap({ races, nextRound, token }: { races: Race[]; nextRound: number | undefined; token: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mapboxgl.accessToken = token;
    // cooperativeGestures: the page scrolls, so zooming needs ctrl/cmd + wheel instead of hijacking the scroll.
    // mercator: the default globe hides the circuits on its far side.
    const map = new mapboxgl.Map({
      container: container.current!,
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'mercator',
      cooperativeGestures: true,
    });
    const bounds = new mapboxgl.LngLatBounds();
    for (const r of races) {
      const { lat, long } = r.circuit;
      const start = r.sessions.find((s) => s.type === 'race')?.startsAt;
      const state = r.round === nextRound ? 'next' : start && Date.parse(start) < Date.now() ? 'past' : 'upcoming';
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.textContent = String(r.round);
      pin.ariaLabel = `${r.name}, round ${r.round}`;
      pin.className = `${PIN} ${PIN_COLOUR[state]}`;
      pin.onclick = () => document.getElementById(`round-${r.round}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      new mapboxgl.Marker({ element: pin }).setLngLat([long, lat]).addTo(map);
      bounds.extend([long, lat]);
    }
    map.fitBounds(bounds, { padding: 48, duration: 0 });
    return () => map.remove();
  }, [races, nextRound, token]);

  return (
    <div className="rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/10">
      <div ref={container} className="h-72 overflow-hidden rounded-lg sm:h-96" />
    </div>
  );
}
