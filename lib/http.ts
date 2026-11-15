/** Uniform API error shape: { error: { code, message } } (AGENTS §8). */
export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}
