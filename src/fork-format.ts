/**
 * Fork (matt/single-pane, FORK.md §8): compact value badges.
 *
 * Badges on small markers have room for about five characters. Data rates
 * and durations get a compact SI form computed from the raw state and its
 * unit; everything else keeps Home Assistant's formatting, but never with the
 * unit twice. Pure and unit-tested.
 */

const RATE_UNITS: Record<string, { bits: number; bytes: boolean }> = {
  'bit/s': { bits: 1, bytes: false }, 'bps': { bits: 1, bytes: false },
  'kbit/s': { bits: 1e3, bytes: false }, 'kbps': { bits: 1e3, bytes: false }, 'kb/s': { bits: 1e3, bytes: false },
  'Mbit/s': { bits: 1e6, bytes: false }, 'Mbps': { bits: 1e6, bytes: false }, 'Mb/s': { bits: 1e6, bytes: false },
  'Gbit/s': { bits: 1e9, bytes: false }, 'Gbps': { bits: 1e9, bytes: false }, 'Gb/s': { bits: 1e9, bytes: false },
  'Tbit/s': { bits: 1e12, bytes: false },
  'B/s': { bits: 1, bytes: true }, 'kB/s': { bits: 1e3, bytes: true }, 'KB/s': { bits: 1e3, bytes: true },
  'MB/s': { bits: 1e6, bytes: true }, 'GB/s': { bits: 1e9, bytes: true },
  'KiB/s': { bits: 1024, bytes: true }, 'MiB/s': { bits: 1024 ** 2, bytes: true }, 'GiB/s': { bits: 1024 ** 3, bytes: true },
};

const DURATION_UNITS: Record<string, number> = {
  ms: 0.001, s: 1, sec: 1, min: 60, h: 3600, hr: 3600, d: 86400,
};

/** Short number: no decimals from 10 up, one below 10, two below 1. */
function short(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return String(Number(n.toFixed(digits)));
}

/** 1000 Mbit/s → "1G", 100 → "100M", 2500 → "2.5G"; bytes keep a "B". */
export function compactRate(value: number, unit: string): string | null {
  const spec = RATE_UNITS[unit.trim()];
  if (!spec || !Number.isFinite(value)) return null;
  const base = value * spec.bits;
  const steps: Array<[number, string]> = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, '']];
  if (base === 0) return `0${spec.bytes ? 'B' : ''}`;
  for (let i = 0; i < steps.length; i++) {
    const [size, prefix] = steps[i];
    if (Math.abs(base) >= size) {
      const scaled = base / size;
      // 999.7 M rounds to "1000M" → promote to the next larger prefix.
      if (Math.abs(Number(short(scaled))) >= 1000 && i > 0) {
        return `${short(scaled / 1000)}${steps[i - 1][1]}${spec.bytes ? 'B' : ''}`;
      }
      return `${short(scaled)}${prefix}${spec.bytes ? 'B' : ''}`;
    }
  }
  return `${short(base)}${spec.bytes ? 'B' : ''}`;
}

/** Duration suffixes (minutes is "m"; kept as named constants so a length
 *  formatter can never be mistaken for one, see test/single-source-numbers). */
const SUFFIX = { s: 's', min: 'm', h: 'h', d: 'd' } as const;

/** 95 min → "95m", 135 min → "2h15m", 3 d → "3d", 45 s → "45s". */
export function compactDuration(value: number, unit: string): string | null {
  const factor = DURATION_UNITS[unit.trim()];
  if (factor === undefined || !Number.isFinite(value)) return null;
  const seconds = Math.round(Math.abs(value) * factor);
  const sign = value < 0 ? '-' : '';
  if (seconds < 60) return sign + String(seconds) + SUFFIX.s;
  const minutes = Math.round(seconds / 60);
  if (minutes < 100) return sign + String(minutes) + SUFFIX.min;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes - hours * 60;
    return sign + String(hours) + SUFFIX.h + (rest ? String(rest) + SUFFIX.min : '');
  }
  return sign + String(Math.round(seconds / 86400)) + SUFFIX.d;
}

/**
 * Badge text for a numeric state with a unit: compact data rate or duration,
 * or null to keep the ordinary formatting.
 */
export function compactBadgeValue(state: unknown, unit: string, deviceClass?: string): string | null {
  const n = typeof state === 'number' ? state : Number(String(state ?? '').trim());
  if (!Number.isFinite(n) || String(state ?? '').trim() === '') return null;
  const u = String(unit || '').trim();
  if (!u) return null;
  return compactRate(n, u) ?? (deviceClass === 'duration' || DURATION_UNITS[u] !== undefined && deviceClass !== 'speed'
    ? compactDuration(n, u) : null);
}

/**
 * True when HA's formatted text already carries its own unit text (e.g. a
 * duration formatted as "95m" or "1 h 35 min" for a `min` sensor), so the
 * unit must not be appended a second time.
 */
export function formattedCarriesUnit(text: string): boolean {
  const rest = text.replace(/[\d\s.,'’  +\-−:]/g, '');
  return rest.length > 0;
}
