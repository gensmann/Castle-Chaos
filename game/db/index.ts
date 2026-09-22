import { env } from "cloudflare:workers";
export function getDb() {
  if (!env.DB)
    throw new Error(
      "The royal archives are temporarily unavailable. Please try again shortly.",
    );
  return env.DB;
}
