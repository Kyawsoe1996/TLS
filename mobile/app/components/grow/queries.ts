// Data hooks, cache helpers and typed hrefs for the content library (Posts) behind Content Studio.
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type { Post, PostStatus } from "@shared/types";

import { isApiClientError, useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** Prefix shared by every post-list query (any status / search combination). */
export const POST_LISTS_KEY = ["posts", "list"] as const;

export interface PostListParams {
  status?: PostStatus;
  q?: string;
}

/** Typed hrefs for the grow stack, so screens never hand-write pathnames. */
export const postRoutes = {
  hub: "/(tabs)/grow" as const satisfies Href,
  /** Content Studio (writes a new post). */
  content: "/(tabs)/grow/content" as const satisfies Href,
  list: "/(tabs)/grow/posts" as const satisfies Href,
  detail: (postId: string): Href => ({ pathname: "/(tabs)/grow/posts/[postId]", params: { postId } }),
  edit: (postId: string): Href => ({ pathname: "/(tabs)/grow/posts/[postId]/edit", params: { postId } }),
};

/** GET /posts?status=&q= (newest first). Keeps the previous rows on screen while a new filter loads. */
export function usePosts(params: PostListParams = {}) {
  const api = useApi();
  const clean: PostListParams = { status: params.status, q: params.q?.trim() || undefined };
  return useQuery<Post[]>({
    queryKey: queryKeys.posts(clean),
    queryFn: async () => (await api.listPosts(clean)).posts,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

/** The row the user tapped, if any cached list still holds it, so the detail screen can open without a spinner. */
function findCachedPost(qc: QueryClient, postId: string): { post: Post; updatedAt: number } | undefined {
  const lists = qc.getQueriesData<Post[]>({ queryKey: POST_LISTS_KEY });
  for (const [key, rows] of lists) {
    const post = rows?.find((p) => p.id === postId);
    if (post) return { post, updatedAt: qc.getQueryState(key)?.dataUpdatedAt ?? 0 };
  }
  return undefined;
}

/** GET /posts/:id. Seeds from a cached list row, then refreshes in the background. A 404 is not retried. */
export function usePost(postId: string | undefined) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = !!postId;
  return useQuery<Post>({
    queryKey: queryKeys.post(postId ?? ""),
    queryFn: async () => (await api.getPost(postId as string)).post,
    enabled,
    initialData: () => (enabled ? findCachedPost(qc, postId)?.post : undefined),
    initialDataUpdatedAt: () => (enabled ? findCachedPost(qc, postId)?.updatedAt : undefined),
    retry: (count, err) => !(isApiClientError(err) && err.isNotFound) && count < 1,
  });
}

/** After any write that returns a post: cache the detail and patch the row in every cached list that holds it. */
export function cachePost(qc: QueryClient, post: Post): void {
  qc.setQueryData<Post>(queryKeys.post(post.id), post);
  qc.setQueriesData<Post[]>({ queryKey: POST_LISTS_KEY }, (old) => old?.map((p) => (p.id === post.id ? post : p)));
}

/** After a post is created, edited, shared, duplicated or deleted: the filtered lists may have changed, so refresh them. */
export function afterPostChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: POST_LISTS_KEY });
}

/** After DELETE /posts/:id: drop the detail, pull it from the cached lists, refresh the rest. */
export function forgetPost(qc: QueryClient, postId: string): void {
  qc.removeQueries({ queryKey: queryKeys.post(postId), exact: true });
  qc.setQueriesData<Post[]>({ queryKey: POST_LISTS_KEY }, (old) => old?.filter((p) => p.id !== postId));
  afterPostChanged(qc);
}

/** "Draft" / "Shared". */
export function postStatusLabel(status: PostStatus): string {
  return status === "shared" ? "Shared" : "Draft";
}

/** "topic · tone · audience" — the brief the post was written from. */
export function postBriefLine(post: Pick<Post, "topic" | "tone" | "audience">): string {
  return [post.topic, post.tone, post.audience].filter(Boolean).join(" · ");
}

/** The text handed to the share sheet: caption, blank line, call to action. */
export function postShareText(post: Pick<Post, "caption" | "callToAction">): string {
  return [post.caption.trim(), post.callToAction.trim()].filter(Boolean).join("\n\n");
}

/** Everything in one clipboard: title, blog post, caption and call to action. */
export function postCopyAllText(post: Pick<Post, "title" | "body" | "caption" | "callToAction">): string {
  return [`${post.title}\n\n${post.body}`, post.caption, post.callToAction].map((s) => s.trim()).filter(Boolean).join("\n\n");
}
