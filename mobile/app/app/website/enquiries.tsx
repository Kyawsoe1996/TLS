import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { WebsiteEnquiry } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Card, EmptyState, Screen } from "@/components/ui";
import { EnquiryRow, useWebsiteEnquiries, websiteRoutes } from "@/components/website";
import { colors, typography } from "@/constants/theme";
import { groupEnquiries } from "@/lib/website";

/** Everyone who asked for a fitting on the shop's website: New first, then the ones already handled. */
export default function WebsiteEnquiriesScreen() {
  const query = useWebsiteEnquiries();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      back
      eyebrow="Your free website"
      title="Enquiries"
      subtitle="Visitors who asked for a fitting on your page."
      edges={["top", "bottom"]}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : query.data.enquiries.length === 0 ? (
        <EmptyState icon="mail-open-outline" title="No enquiries yet" body="When someone asks for a fitting on your website, they appear here. Share your link to get the first one." />
      ) : (
        <EnquiryGroups enquiries={query.data.enquiries} />
      )}
    </Screen>
  );
}

function EnquiryGroups({ enquiries }: { enquiries: WebsiteEnquiry[] }) {
  const router = useRouter();
  const { fresh, earlier } = groupEnquiries(enquiries);
  const group = (title: string, list: WebsiteEnquiry[], note?: string) => (
    <Card style={styles.card}>
      <Text style={typography.h3}>{title}</Text>
      {note ? <Text style={typography.small}>{note}</Text> : null}
      <View>
        {list.map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <EnquiryRow enquiry={e} onPress={() => router.push(websiteRoutes.enquiry(e.id))} />
          </Fragment>
        ))}
      </View>
    </Card>
  );
  return (
    <>
      {fresh.length > 0 ? group(`New (${fresh.length})`, fresh, "Reply today: message them to book a day and time.") : null}
      {earlier.length > 0 ? group("Earlier", earlier) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  divider: { height: 1, backgroundColor: colors.line },
});
