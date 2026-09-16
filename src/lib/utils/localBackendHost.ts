/**
 * Dev-only helpers resolving the host of the **local** Supabase stack.
 *
 * `EXPO_PUBLIC_*` values are inlined by Metro at bundle time, so a LAN IP
 * written in `.env` is frozen into the JS. The Mac takes its address over DHCP,
 * so the value goes stale on the next lease change and every request times out
 * (the project has already burned through three addresses). Metro always knows
 * the current one — it is the host behind the QR code — so we derive the
 * backend host from it instead of trusting the file.
 */

/** Android emulator alias for the host machine. */
export const ANDROID_EMULATOR_LOOPBACK = ["10", "0", "2", "2"].join(".");

/** Hostnames that always designate the machine running the dev stack. */
const MACHINE_LOCAL_NAMES = new Set(["localhost", "host.docker.internal"]);

/** Loopback, link-local and RFC 1918 ranges — the addresses DHCP can move. */
function isMachineLocalIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4) return false;
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

/**
 * Host part of Expo's `hostUri` — `10.176.226.240:8081` → `10.176.226.240`.
 * Returns null when unavailable (release builds, Jest, tunnel URLs without host).
 */
export function hostFromHostUri(hostUri?: string | null): string | null {
  const raw = hostUri?.replace(/^[a-z]+:\/\//i, "").trim();
  if (!raw) return null;

  const host = raw.split(":")[0]?.trim();
  return host?.length ? host : null;
}

/**
 * A device cannot reach the Mac through loopback: inside the Android emulator,
 * `127.0.0.1` is the emulator itself.
 */
export function deviceHostFor(host: string, platform: string): string {
  const isLoopback = host === "127.0.0.1" || host === "localhost";
  if (platform === "android" && isLoopback) return ANDROID_EMULATOR_LOOPBACK;
  return host;
}

/**
 * True when `url` targets the machine-local stack over plain HTTP — the only
 * case where the Metro host may override the `.env` value. A cloud host or a
 * custom DNS name is an explicit choice and is left alone.
 */
export function isMachineLocalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    return (
      MACHINE_LOCAL_NAMES.has(parsed.hostname) ||
      isMachineLocalIpv4(parsed.hostname)
    );
  } catch {
    return false;
  }
}
