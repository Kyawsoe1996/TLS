import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { SeoPlace } from "@shared/types";

import { Card, Eyebrow } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { showError } from "@/lib/toast";

export interface NearbyPlacesProps {
  places: SeoPlace[];
  style?: StyleProp<ViewStyle>;
}

function ratingLine(place: SeoPlace): string | null {
  if (place.rating === null) return null;
  const rating = `★ ${place.rating.toFixed(1)}`;
  if (place.reviewCount === null) return rating;
  return `${rating}  ·  ${place.reviewCount.toLocaleString()} ${place.reviewCount === 1 ? "review" : "reviews"}`;
}

/** The tailors the Local SEO map was based on. Each row opens the shop on Google Maps (Google requires the source links). */
export function NearbyPlaces({ places, style }: NearbyPlacesProps) {
  const open = async (place: SeoPlace) => {
    try {
      await Linking.openURL(place.mapsUrl);
    } catch (err) {
      showError(err, "Couldn't open Google Maps");
    }
  };

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.header}>
        <Eyebrow>Nearby tailors</Eyebrow>
        {/* Attribution text must stay exactly "Google Maps": no restyled case, no wrapping. */}
        <Text style={styles.attribution} numberOfLines={1}>
          Google Maps
        </Text>
      </View>

      {places.map((place) => {
        const rating = ratingLine(place);
        return (
          <Pressable
            key={place.mapsUrl}
            accessibilityRole="link"
            accessibilityLabel={`${place.name}, open in Google Maps`}
            onPress={() => void open(place)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.name}>{place.name}</Text>
              {rating ? <Text style={typography.small}>{rating}</Text> : null}
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  attribution: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 16, color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  name: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.ink },
});
