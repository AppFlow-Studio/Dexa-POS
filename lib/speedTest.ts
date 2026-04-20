import NetInfo from '@react-native-community/netinfo'

export interface SpeedTestResult {
  downloadMbps: number
  latencyMs: number
  connectionType: string | null
}

// Google's lightweight 204 endpoint — already used in offlineSyncService for reachability
const LATENCY_URL = 'https://clients3.google.com/generate_204'

// Cloudflare's speed test endpoint — returns exactly N bytes of data
const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down'
const DOWNLOAD_BYTES = 1_000_000 // 1MB per request

/**
 * Measure round-trip latency via Google's 204 endpoint.
 * Runs 4 pings, drops the first (cold TCP+TLS handshake), averages the rest.
 */
async function measureLatency(): Promise<number> {
  const pings: number[] = []

  for (let i = 0; i < 4; i++) {
    const start = performance.now()
    await fetch(LATENCY_URL, { method: 'HEAD', cache: 'no-store' })
    const elapsed = performance.now() - start
    if (i > 0) pings.push(elapsed)
  }

  return Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)
}

/**
 * Measure download speed using Cloudflare's speed test CDN.
 * Fires multiple parallel downloads of known size and measures throughput.
 */
async function measureDownloadSpeed(): Promise<number> {
  const iterations = 6
  const url = `${DOWNLOAD_URL}?bytes=${DOWNLOAD_BYTES}`

  const start = performance.now()

  const promises = Array.from({ length: iterations }, () =>
    fetch(url, { cache: 'no-store' }).then((res) => res.arrayBuffer())
  )

  const results = await Promise.all(promises)
  const totalBytes = results.reduce((sum, buf) => sum + buf.byteLength, 0)
  const elapsed = (performance.now() - start) / 1000 // seconds

  if (totalBytes === 0 || elapsed === 0) return 0

  const mbps = (totalBytes * 8) / elapsed / 1_000_000
  return Math.round(mbps * 100) / 100
}

/**
 * Run a complete speed test: latency, download speed, and connection info.
 */
export async function runSpeedTest(): Promise<SpeedTestResult> {
  const netInfo = await NetInfo.fetch()
  const connectionType = netInfo.type === 'wifi'
    ? 'WiFi'
    : netInfo.type === 'cellular'
      ? `Cellular (${netInfo.details?.cellularGeneration || 'unknown'})`
      : netInfo.type

  const [latencyMs, downloadMbps] = await Promise.all([
    measureLatency(),
    measureDownloadSpeed(),
  ])

  return { downloadMbps, latencyMs, connectionType }
}

export type SpeedQuality = 'good' | 'fair' | 'poor'

export function getSpeedQuality(result: SpeedTestResult): SpeedQuality {
  if (result.downloadMbps < 2 || result.latencyMs > 300) return 'poor'
  if (result.downloadMbps < 10 || result.latencyMs > 100) return 'fair'
  return 'good'
}
