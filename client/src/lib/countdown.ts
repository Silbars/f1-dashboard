export function countdownParts(targetIso: string, nowMs: number) {
  const diff = Math.max(0, Date.parse(targetIso) - nowMs);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}
