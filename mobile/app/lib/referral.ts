// Pure helpers for Smart Referral: contact detection, the share message, labels and the reward-progress steps.
// No React / react-native imports, so lib/__tests__/referral.test.ts can run them in node.
import type { ReferralLead, ReferralLeadStatus, ReferralPreferred, ReferralReward, ReferralRewardStatus } from "@shared/types";

import { formatDate, initials } from "./format";

export type ContactKind = "phone" | "line";

/**
 * "phone" when more than half of the non-space characters are digits or "+", otherwise a LINE ID.
 * Mirrors the API (routes/referrals.ts splitContact), which files the lead's contact the same way.
 */
export function contactKind(text: string): ContactKind {
  const compact = text.replace(/\s+/g, "");
  const digitish = compact.replace(/[^0-9+]/g, "").length;
  return compact && digitish > compact.length / 2 ? "phone" : "line";
}

/** "Phone" | "LINE" for the contact's row label. */
export function contactLabel(text: string): string {
  return contactKind(text) === "phone" ? "Phone" : "LINE";
}

/** "A complimentary shirt" → "a complimentary shirt" (so an offer reads inside a sentence). */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** "Anucha Srisuk" → "Anucha"; "" stays "". */
export function firstNameOf(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/** Up to two letters for an avatar; "?" when the name is empty. */
export function initialsOf(name: string | null | undefined): string {
  return initials(name) || "?";
}

/** "James" → "James's", "" → "their" (for "<friend>'s first order"). */
export function possessive(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? `${trimmed}'s` : "their";
}

export interface ReferralMessageInput {
  shopName: string;
  district: string;
  friendOffer: string | null;
  url: string;
}

/**
 * The ready-to-send text, same wording as the API's ClientReferralResponse.message:
 * "Hi! I'm a client of <shop> in <district>. Book your first fitting with my link and you get <offer>: <url>"
 */
export function referralMessage({ shopName, district, friendOffer, url }: ReferralMessageInput): string {
  const offer = friendOffer?.trim();
  const gift = offer ? lowerFirst(offer) : "a welcome gift";
  return `Hi! I'm a client of ${shopName} in ${district}. Book your first fitting with my link and you get ${gift}: ${url}`;
}

/** The one-line explanation at the top of the Invite sheet, built from whichever offers the shop has written. */
export function inviteExplanation({ firstName, friendOffer, clientOffer }: { firstName: string; friendOffer: string | null; clientOffer: string | null }): string {
  const who = firstName || "the client";
  const friend = friendOffer?.trim();
  const client = clientOffer?.trim();
  if (friend && client) {
    return `Friends who book with ${who}'s link get ${lowerFirst(friend)}, and ${who} gets ${lowerFirst(client)} once their friend's first order is delivered.`;
  }
  if (friend) return `Friends who book with ${who}'s link get ${lowerFirst(friend)}.`;
  if (client) return `${who} gets ${lowerFirst(client)} once a friend they sent has their first order delivered.`;
  return `Send ${who} their personal link. A friend who opens it can ask for a fitting in a few taps.`;
}

// ---------- Labels ----------

export const LEAD_STATUS_LABELS: Record<ReferralLeadStatus, string> = { new: "New", added: "Added", dismissed: "Dismissed" };
export type LeadStatusTone = "danger" | "success" | "neutral";
const LEAD_STATUS_TONES: Record<ReferralLeadStatus, LeadStatusTone> = { new: "danger", added: "success", dismissed: "neutral" };

/** "new" → "New". */
export function leadStatusLabel(status: ReferralLeadStatus): string {
  return LEAD_STATUS_LABELS[status];
}

/** Tag tone for a lead: New in red (needs attention), Added in green, Dismissed neutral. */
export function leadStatusTone(status: ReferralLeadStatus): LeadStatusTone {
  return LEAD_STATUS_TONES[status];
}

export const REWARD_STATUS_LABELS: Record<ReferralRewardStatus, string> = { pending: "Pending", ready: "Ready", given: "Given" };
export type RewardStatusTone = "success" | "warning" | "neutral";
const REWARD_STATUS_TONES: Record<ReferralRewardStatus, RewardStatusTone> = { pending: "warning", ready: "success", given: "neutral" };

/** "ready" → "Ready". */
export function rewardStatusLabel(status: ReferralRewardStatus): string {
  return REWARD_STATUS_LABELS[status];
}

/** Tag tone for a reward: Ready in green, Pending in gold, Given neutral. */
export function rewardStatusTone(status: ReferralRewardStatus): RewardStatusTone {
  return REWARD_STATUS_TONES[status];
}

export const PREFERRED_LABELS: Record<ReferralPreferred, string> = { this_week: "This week", next_week: "Next week", any: "Any time" };

/** "this_week" → "This week"; "" when the friend didn't say. */
export function preferredLabel(preferred: ReferralPreferred | null | undefined): string {
  return preferred ? PREFERRED_LABELS[preferred] : "";
}

/** Second line of a lead row: "Asked for a fitting · prefers this week" | "Added as a client" | "Dismissed". */
export function leadDetailLine(lead: Pick<ReferralLead, "status" | "preferred">): string {
  if (lead.status === "added") return "Added as a client";
  if (lead.status === "dismissed") return "Dismissed";
  const when = lead.preferred ? ` · prefers ${preferredLabel(lead.preferred).toLowerCase()}` : "";
  return `Asked for a fitting${when}`;
}

/** "3 friends booked · 2 became clients" (singulars handled). */
export function ambassadorLine(friendsBooked: number, becameClients: number): string {
  const booked = `${friendsBooked} ${friendsBooked === 1 ? "friend" : "friends"} booked`;
  const became = `${becameClients} became ${becameClients === 1 ? "a client" : "clients"}`;
  return `${booked} · ${became}`;
}

/** "<client offer or 'Reward'> for <ambassador>". */
export function rewardTitle(clientOffer: string | null | undefined, ambassadorName: string): string {
  const what = clientOffer?.trim() || "Reward";
  return ambassadorName ? `${what} for ${ambassadorName}` : what;
}

/**
 * Second line of a reward row: ready → "Earned from <friend>'s first order · <date>", pending →
 * "Waiting for <friend>'s first order", given → "Earned from <friend>'s first order · given <date>".
 */
export function rewardDetailLine(reward: Pick<ReferralReward, "status" | "friendName" | "readyAt" | "givenAt">): string {
  const friend = possessive(reward.friendName);
  if (reward.status === "pending") return `Waiting for ${friend} first order`;
  const earned = `Earned from ${friend} first order`;
  if (reward.status === "given") return reward.givenAt ? `${earned} · given ${formatDate(reward.givenAt)}` : `${earned} · given`;
  return reward.readyAt ? `${earned} · ${formatDate(reward.readyAt)}` : earned;
}

// ---------- Reward progress (the three steps on the lead screen) ----------

export type ProgressState = "done" | "next" | "later";
export interface ProgressStep {
  label: string;
  state: ProgressState;
  detail?: string;
}

/**
 * Friend asked (always done) → friend's first order delivered → ambassador's reward released. The last two flip
 * together when the reward is ready or given; before that, delivery is "next" once the friend is a client.
 */
export function rewardProgress(
  lead: Pick<ReferralLead, "status" | "createdAt" | "referrerName">,
  reward: Pick<ReferralReward, "status" | "readyAt" | "givenAt"> | null | undefined,
): ProgressStep[] {
  const released = reward?.status === "ready" || reward?.status === "given";
  const ambassador = firstNameOf(lead.referrerName) || "The ambassador";
  const deliveryState: ProgressState = released ? "done" : lead.status === "dismissed" ? "later" : "next";
  const releaseDetail = reward?.status === "given" ? `Given${reward.givenAt ? ` · ${formatDate(reward.givenAt)}` : ""}` : released ? "Ready to give" : undefined;
  return [
    { label: "Friend asked for a fitting", state: "done", detail: formatDate(lead.createdAt) || undefined },
    { label: "Friend's first order delivered", state: deliveryState, detail: released && reward?.readyAt ? formatDate(reward.readyAt) : undefined },
    { label: `${ambassador}'s reward released`, state: released ? "done" : "later", detail: releaseDetail },
  ];
}
