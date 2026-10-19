import { Link, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { API_URL } from "@/lib/api";
import { showError } from "@/lib/toast";

/** "New to Magick Tailor? Create an account" style line: muted question, gold link. */
export function SwitchLine({ question, linkLabel, href }: { question: string; linkLabel: string; href: Href }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{question}</Text>
      <Link href={href} asChild>
        <Pressable hitSlop={6}>
          <Text style={styles.link}>{linkLabel}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

/** "By continuing you agree to our Privacy Policy." — opens the hosted policy in the browser. */
export function PrivacyLine() {
  return (
    <View style={styles.row}>
      <Text style={styles.small}>By continuing you agree to our</Text>
      <Pressable
        hitSlop={6}
        accessibilityRole="link"
        onPress={() => {
          WebBrowser.openBrowserAsync(`${API_URL}/privacy`).catch((err) => showError(err, "Couldn't open the page"));
        }}
      >
        <Text style={styles.smallLink}>Privacy Policy.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 5 },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.goldDark },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  smallLink: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.goldDark },
});
