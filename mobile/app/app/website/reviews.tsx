import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WEBSITE_LIMITS, type WebsiteResponse, type WebsiteReview } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsite, useWebsiteAction } from "@/components/website";
import { typography } from "@/constants/theme";
import { confirm, showError, showToast } from "@/lib/toast";
import { moveItem, parseRatingInput } from "@/lib/website";

/**
 * Your free website → Reviews: the rating shown as "4.9 on Google" (optional) and the quotes the owner pastes in
 * (text, author, source, default "Google"). Only paste real reviews, with the reviewer's permission to show their name.
 */
export default function WebsiteReviewsScreen() {
  const query = useWebsite();
  return (
    <Screen back keyboard eyebrow="Your website" title="Reviews" subtitle="Paste a few reviews clients left you." edges={["top", "bottom"]}>
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <ReviewsEditor data={query.data} />
      )}
    </Screen>
  );
}

function ReviewsEditor({ data }: { data: WebsiteResponse }) {
  const update = useUpdateWebsite();
  const reorder = useWebsiteAction((api, ids: string[]) => api.reorderWebsiteReviews(ids), "Couldn't move it");
  const [rating, setRating] = useState(data.rating == null ? "" : data.rating.toFixed(1));
  const parsed = parseRatingInput(rating);
  const ratingError = parsed === undefined ? "A number from 1 to 5, like 4.9." : null;
  const reviews = data.reviews;

  return (
    <>
      <Card style={styles.card}>
        <Eyebrow tone="muted">Rating</Eyebrow>
        <Field
          label="Your Google rating"
          value={rating}
          onChangeText={setRating}
          keyboardType="decimal-pad"
          placeholder="4.9"
          error={ratingError}
          hint="Shown as “4.9 on Google”. Use the number on your Google profile; leave empty to hide it."
          testID="reviews-rating"
        />
        <Button
          size="sm"
          title="Save rating"
          disabled={!!ratingError || parsed === data.rating}
          loading={update.isPending}
          onPress={() => update.mutate({ rating: parsed ?? null }, { onSuccess: () => showToast("Saved"), onError: (err) => showError(err, "Couldn't save") })}
          style={styles.start}
        />
        {!data.missing.includes("Google review link") ? null : (
          <Text style={typography.small}>Add your Google review link in Shop details to show “Read all reviews on Google”.</Text>
        )}
      </Card>

      {reviews.map((review, index) => (
        <ReviewRow
          key={review.id}
          review={review}
          first={index === 0}
          last={index === reviews.length - 1}
          moving={reorder.isPending}
          onMove={(d) => reorder.mutate(moveItem(reviews, index, d).map((r) => r.id))}
        />
      ))}
      {reviews.length < WEBSITE_LIMITS.reviewsMax ? <NewReview /> : <Text style={typography.small}>The website shows up to {WEBSITE_LIMITS.reviewsMax} reviews.</Text>}
      <Text style={typography.small}>The first review is also shown on your Home page. Only use real reviews, as the client wrote them.</Text>
    </>
  );
}

function ReviewRow({ review, first, last, moving, onMove }: { review: WebsiteReview; first: boolean; last: boolean; moving: boolean; onMove: (d: -1 | 1) => void }) {
  const [quote, setQuote] = useState(review.quote);
  const [author, setAuthor] = useState(review.author);
  const [source, setSource] = useState(review.source);
  const save = useWebsiteAction((api, body: Parameters<typeof api.updateWebsiteReview>[1]) => api.updateWebsiteReview(review.id, body), "Couldn't save the review");
  const remove = useWebsiteAction((api) => api.deleteWebsiteReview(review.id), "Couldn't remove the review");
  const changed = quote.trim() !== review.quote || author.trim() !== review.author || (source.trim() || "Google") !== review.source;
  const valid = !!quote.trim() && !!author.trim();

  return (
    <Card style={styles.card}>
      <Field label="Review" value={quote} onChangeText={setQuote} multiline maxLength={WEBSITE_LIMITS.quoteMax} />
      <View style={styles.pair}>
        <Field label="Author" value={author} onChangeText={setAuthor} maxLength={WEBSITE_LIMITS.authorMax} containerStyle={styles.flex} />
        <Field label="Source" value={source} onChangeText={setSource} maxLength={WEBSITE_LIMITS.sourceMax} placeholder="Google" containerStyle={styles.flex} />
      </View>
      <View style={styles.actions}>
        <Button
          size="sm"
          title="Save"
          disabled={!changed || !valid}
          loading={save.isPending}
          onPress={() => save.mutate({ quote: quote.trim(), author: author.trim(), source: source.trim() || "Google" }, { onSuccess: () => showToast("Saved") })}
        />
        <Button size="sm" variant="secondary" icon="arrow-up" title="Up" onPress={() => onMove(-1)} disabled={first || moving} />
        <Button size="sm" variant="secondary" icon="arrow-down" title="Down" onPress={() => onMove(1)} disabled={last || moving} />
        <Button
          size="sm"
          variant="danger"
          icon="trash-outline"
          title="Remove"
          loading={remove.isPending}
          onPress={() =>
            void confirm({ title: "Remove this review?", confirmText: "Remove", destructive: true }).then((ok) => {
              if (ok) remove.mutate(undefined);
            })
          }
        />
      </View>
    </Card>
  );
}

function NewReview() {
  const [quote, setQuote] = useState("");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("Google");
  const create = useWebsiteAction((api, body: Parameters<typeof api.createWebsiteReview>[0]) => api.createWebsiteReview(body), "Couldn't add the review");
  return (
    <Card variant="soft" style={styles.card}>
      <Eyebrow tone="muted">Add a review</Eyebrow>
      <Field label="Review" value={quote} onChangeText={setQuote} multiline maxLength={WEBSITE_LIMITS.quoteMax} placeholder="Paste the review as the client wrote it" testID="review-new-quote" />
      <View style={styles.pair}>
        <Field label="Author" value={author} onChangeText={setAuthor} maxLength={WEBSITE_LIMITS.authorMax} placeholder="James P." containerStyle={styles.flex} />
        <Field label="Source" value={source} onChangeText={setSource} maxLength={WEBSITE_LIMITS.sourceMax} containerStyle={styles.flex} />
      </View>
      <Button
        size="sm"
        icon="add"
        title="Add review"
        disabled={!quote.trim() || !author.trim()}
        loading={create.isPending}
        style={styles.start}
        onPress={() =>
          create.mutate(
            { quote: quote.trim(), author: author.trim(), source: source.trim() || "Google" },
            {
              onSuccess: () => {
                setQuote("");
                setAuthor("");
                setSource("Google");
              },
            },
          )
        }
        testID="review-add"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  pair: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  start: { alignSelf: "flex-start" },
});
