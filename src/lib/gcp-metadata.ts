export async function isRunningOnGcpVm(timeoutMs: number = 800): Promise<boolean> {
  const metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/id";

  try {
    const res = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
