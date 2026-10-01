import type { SeoPlace } from "../../../shared/types";
import type { Bindings } from "../env";
import { callGemini, describe, type GroundingMetadata } from "./gemini";

const MAX_PLACES = 8;
const MAX_FINDINGS_CHARS = 2000;
const MAX_ATTEMPTS = 2; // Gemini sometimes answers without returning its Maps sources; ask once more.
const RATING = /\*\*Rating:\*\*\s*([\d.]+)\s*\(([\d,]+) reviews?\)/;

export interface NearbyTailors {
  /** Gemini's summary of the shops it found; passed to pipeline 2 as `nearby_competitors`. */
  findings: string;
  places: SeoPlace[];
}

/**
 * Look up tailor shops near `district` using Gemini's Google Maps grounding.
 * Returns null when the lookup fails or comes back without Maps sources, so the
 * caller can carry on without it. Never throws.
 */
export async function findNearbyTailors(env: Bindings, district: string): Promise<NearbyTailors | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { text, grounding } = await callGemini(env, {
        user:
          `Using Google Maps, find bespoke tailor and custom suit shops in or near ${district}. ` +
          `List up to ${MAX_PLACES} with name, rating, number of reviews and one line on what each emphasises.`,
        tools: [{ google_maps: {} }],
        temperature: 0.2,
      });
      const places = placesFromGrounding(grounding);
      if (places.length > 0) return { findings: text.slice(0, MAX_FINDINGS_CHARS), places };
      console.warn(`[gemini] Google Maps lookup attempt ${attempt}/${MAX_ATTEMPTS} returned no sources`);
    } catch (err) {
      console.warn(`[gemini] Google Maps lookup attempt ${attempt}/${MAX_ATTEMPTS} failed:`, describe(err));
      // Timed out - don't spend another 25s.
      if (err instanceof Error && err.name === "AbortError") return null;
    }
  }
  return null;
}

/** One entry per place from the Maps grounding chunks, in the order Gemini returned them. */
export function placesFromGrounding(grounding: GroundingMetadata | undefined): SeoPlace[] {
  const places: SeoPlace[] = [];
  const seen = new Set<string>();
  for (const chunk of grounding?.groundingChunks ?? []) {
    const maps = chunk.maps;
    if (!maps?.uri?.startsWith("https://") || !maps.title) continue;
    const name = maps.title.replace(/ - Google Maps$/, "").trim();
    // Review snippets arrive as their own chunks ("Review of <place>"); keep the place entry only.
    if (!name || name.startsWith("Review of ")) continue;
    const key = maps.placeId ?? maps.uri;
    if (seen.has(key)) continue;
    seen.add(key);

    const [, score, count] = RATING.exec(maps.text ?? "") ?? [];
    const rating = score ? Number(score) : NaN;
    const reviewCount = count ? Number(count.replace(/,/g, "")) : NaN;
    places.push({
      name,
      mapsUrl: maps.uri,
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    });
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}
