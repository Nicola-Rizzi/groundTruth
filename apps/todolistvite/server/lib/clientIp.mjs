/**
 * Best-effort client IP for rate limiting. Behind Vercel/Render's proxy the
 * real client address only shows up in x-forwarded-for (the socket sees the
 * proxy's IP), so that header wins when present; direct connections (local
 * dev) fall back to the socket address.
 */
export function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}
