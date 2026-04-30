export function injectUmamiAnalytics() {
  // Build-safe analytics injection:
  // - Avoid leaving %VITE_...% placeholders in index.html
  // - Only inject when envs are configured
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT as
    | string
    | undefined;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID as
    | string
    | undefined;

  if (!endpoint || !websiteId) return;
  if (typeof document === "undefined") return;

  const normalized = endpoint.replace(/\/+$/, "");
  const src = `${normalized}/umami`;

  // Prevent double-injection
  const existing = document.querySelector(
    `script[data-website-id="${websiteId}"]`
  );
  if (existing) return;

  const s = document.createElement("script");
  s.defer = true;
  s.src = src;
  s.setAttribute("data-website-id", websiteId);
  document.head.appendChild(s);
}
