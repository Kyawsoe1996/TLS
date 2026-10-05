import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Post, UpdatePostRequest } from "@shared/types";

import { ErrorBlock, LoadingBlock, isNotFoundError } from "@/components/clients";
import { PostMediaBlock, afterPostChanged, cachePost, postRoutes, useAttachMedia, usePost } from "@/components/grow";
import { Button, EmptyState, Eyebrow, Field, Screen } from "@/components/ui";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";

/** PATCH /posts/:id — the texts and topic; the media block saves on its own. */
export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const postQuery = usePost(postId);
  const post = postQuery.data;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(postRoutes.detail(postId)));

  let body;
  if (postQuery.isPending) {
    body = <LoadingBlock />;
  } else if (postQuery.isError || !post) {
    body = isNotFoundError(postQuery.error) ? (
      <EmptyState
        icon="document-text-outline"
        title="Post not found"
        body="This post may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to posts" onPress={() => router.dismissTo(postRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={postQuery.error} onRetry={() => void postQuery.refetch()} retrying={postQuery.isFetching} />
    );
  } else {
    return <EditPostForm key={post.id} post={post} onDone={goBack} />;
  }

  return (
    <Screen back eyebrow="Post" title="Edit post" keyboard>
      {body}
    </Screen>
  );
}

type Draft = { title: string; body: string; caption: string; callToAction: string; topic: string };

function draftFrom(post: Post): Draft {
  return { title: post.title, body: post.body, caption: post.caption, callToAction: post.callToAction, topic: post.topic };
}

/** Loaded state: the fields start from the saved post. Split out so the drafts initialise once per post. */
function EditPostForm({ post, onDone }: { post: Post; onDone: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const attach = useAttachMedia(post.id);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(post));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const update = useMutation({
    mutationFn: (body: UpdatePostRequest) => api.updatePost(post.id, body),
    onSuccess: ({ post: saved }) => {
      cachePost(queryClient, saved);
      afterPostChanged(queryClient);
      onDone();
    },
    onError: (err) => showError(err, "Couldn't save changes"),
  });

  const save = () => {
    const clean: Draft = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      caption: draft.caption.trim(),
      callToAction: draft.callToAction.trim(),
      topic: draft.topic.trim(),
    };
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!clean.title) next.title = "Give the post a title.";
    if (!clean.body) next.body = "The blog post can't be empty.";
    if (!clean.caption) next.caption = "The caption can't be empty.";
    if (!clean.callToAction) next.callToAction = "Add a call to action.";
    if (!clean.topic) next.topic = "Add a topic.";
    if (Object.keys(next).length > 0) return setErrors(next);

    // Send only what changed; nothing changed → just go back.
    const changed: UpdatePostRequest = {};
    (Object.keys(clean) as (keyof Draft)[]).forEach((key) => {
      if (clean[key] !== post[key]) changed[key] = clean[key];
    });
    if (Object.keys(changed).length === 0) return onDone();
    update.mutate(changed);
  };

  const saving = update.isPending;
  const locked = saving || attach.busy;

  return (
    <Screen
      back
      onBack={onDone}
      eyebrow="Post"
      title="Edit post"
      keyboard
      footer={
        <View style={styles.footer}>
          <Button variant="ghost" title="Cancel" onPress={onDone} disabled={saving} />
          <Button title="Save changes" style={styles.save} onPress={save} loading={saving} disabled={attach.busy} />
        </View>
      }
    >
      <View style={styles.section}>
        <Eyebrow>Photo or video</Eyebrow>
        <PostMediaBlock post={post} attach={attach} disabled={saving} />
      </View>

      <Field label="Title" value={draft.title} onChangeText={set("title")} placeholder="Blog title" autoCapitalize="sentences" returnKeyType="next" error={errors.title} editable={!locked} />
      <Field
        label="Blog post"
        value={draft.body}
        onChangeText={set("body")}
        placeholder="Three short paragraphs"
        multiline
        autoCapitalize="sentences"
        error={errors.body}
        editable={!locked}
        style={styles.tall}
      />
      <Field
        label="Social caption"
        value={draft.caption}
        onChangeText={set("caption")}
        placeholder="Caption with hashtags"
        multiline
        autoCapitalize="sentences"
        error={errors.caption}
        editable={!locked}
      />
      <Field
        label="Call to action"
        value={draft.callToAction}
        onChangeText={set("callToAction")}
        placeholder="Book a fitting this week"
        autoCapitalize="sentences"
        returnKeyType="next"
        error={errors.callToAction}
        editable={!locked}
      />
      <Field
        label="Topic"
        value={draft.topic}
        onChangeText={set("topic")}
        placeholder="What the post is about"
        hint={`Written as ${post.tone.toLowerCase()} for ${post.audience.toLowerCase()}.`}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={save}
        error={errors.topic}
        editable={!locked}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  tall: { minHeight: 180 },
  footer: { flexDirection: "row", alignItems: "center", gap: 10 },
  save: { flex: 1 },
});
