/**
 * Message namespaces used by client components ("use client"). Only these are
 * sent to the browser; everything else renders on the server.
 * client-namespaces.test.ts fails if a client component uses one not listed.
 */
export const CLIENT_NAMESPACES = ["Header", "Site", "Error", "Auth", "Dashboard"] as const;
