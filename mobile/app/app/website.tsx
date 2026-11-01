import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, Switch, Text, View } from "react-native";
import { WEBSITE_LIMITS, type WebsiteResponse, type WebsiteSections, type WebsiteTheme } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsite, websiteRoutes } from "@/components/website";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { errorMessage, showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";
import { THEME_OPTIONS, cleanSlugInput, missingSentence, pageItems, slugError, splitWebsiteUrl, themeName } from "@/lib/website";

/**
 * Settings → Your free website: one switch publishes a small portfolio site at <API>/s/<slug> (Home, Work, Services,
 * About). The navy card holds the switch and, when on, the link with Preview / Share; then the Look (Atelier, Ivory,
 * Noir), the sections (each with Edit / Choose or an on/off switch), the enquiries, what's still missing, the
 * address part and the LINE ID.
 */
export default function WebsiteScreen() {
  const query = useWebsite();
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
      keyboard
      eyebrow="Settings"
      title="Your free website"
      subtitle="A portfolio site for clients who search for you: your work, prices and a booking form."
      edges={["top", "bottom"]}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <WebsiteSettings data={query.data} />
      )}
    </Screen>
  );
}

/** Loaded state. */
function WebsiteSettings({ data }: { data: WebsiteResponse }) {
  const router = useRouter();
  const update = useUpdateWebsite();
  // The switch moves at once; the server's answer (or a failure) settles it.
  const [enabled, setEnabled] = useState(data.enabled);
  useEffect(() => setEnabled(data.enabled), [data.enabled]);

  const toggle = (value: boolean) => {
    setEnabled(value);
    update.mutate(
      { enabled: value },
      {
        onSuccess: (res) => {
          if (res.enabled) showToast("Your website is live", "Share the link with clients, or add it to your Google profile and LINE.");
        },
        onError: (err) => {
          setEnabled(!value);
          showError(err, value ? "Couldn't switch the website on" : "Couldn't switch the website off");
        },
      },
    );
  };

  return (
    <>
      <Card variant={enabled ? "dark" : "default"} style={styles.switchCard} testID="website-switch-card">
        <View style={styles.switchRow}>
          <View style={[styles.switchIcon, enabled && styles.switchIconOn]}>
            <Ionicons name="globe-outline" size={22} color={enabled ? colors.navy : colors.goldDark} />
          </View>
          <View style={styles.switchText}>
            <Text style={[typography.h3, enabled && styles.onDark]}>{enabled ? "Website is on" : "Website is off"}</Text>
            <Text style={[typography.small, enabled && styles.onDarkMuted]}>
              {enabled ? "Anyone with the link, or who finds you on Google, can see it." : "Set it up below, then switch on to publish."}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggle}
            disabled={update.isPending}
            trackColor={{ false: colors.line, true: colors.gold }}
            thumbColor={colors.card}
            ios_backgroundColor={colors.line}
            accessibilityLabel="Website"
            testID="website-switch"
          />
        </View>
        {enabled ? <LinkRow url={data.url} /> : null}
      </Card>

      {!enabled ? (
        <Card variant="soft" style={styles.offCard}>
          <Eyebrow tone="muted">Why switch it on</Eyebrow>
          <Benefit icon="search-outline" text="Clients who search for a tailor find a real site with your work, prices, hours and address." />
          <Benefit icon="calendar-outline" text="They can ask for a fitting in a few taps. The request lands here, ready to add as a client." />
          <Benefit icon="images-outline" text="Show the work you choose: order photos, posts from Content Studio or your own uploads." />
          <Benefit icon="pricetag-outline" text="Free, no hosting or design work. Switch it off any time." />
        </Card>
      ) : null}

      <LookCard theme={data.theme} />
      <SectionsCard data={data} />

      {enabled || data.enquiriesTotal > 0 ? (
        <Card onPress={() => router.push(websiteRoutes.enquiries)} style={styles.enquiriesCard} testID="website-enquiries-card">
          <View style={styles.enquiriesRow}>
            <View style={styles.enquiriesText}>
              <Eyebrow>Enquiries</Eyebrow>
              <Text style={typography.h3}>
                {data.enquiriesNew > 0 ? `${data.enquiriesNew} new ${data.enquiriesNew === 1 ? "request" : "requests"}` : "No new requests"}
              </Text>
              <Text style={typography.small}>
                {data.enquiriesNew > 0
                  ? "Reply today: people who ask online often book with the first shop that answers."
                  : data.enquiriesTotal > 0
                    ? `${data.enquiriesTotal} in total. Visitors who ask for a fitting appear here.`
                    : "Visitors who ask for a fitting on your page appear here."}
              </Text>
            </View>
            {data.enquiriesNew > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{data.enquiriesNew}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>
      ) : null}

      <MissingCard data={data} />
      <AddressCard data={data} />
      <LineCard data={data} />
    </>
  );
}

function Benefit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.benefit}>
      <Ionicons name={icon} size={18} color={colors.goldDark} />
      <Text style={[typography.body, styles.benefitText]}>{text}</Text>
    </View>
  );
}

/** Inside the navy card: the link with Copy, and Preview (open the site) / Share. */
function LinkRow({ url }: { url: string }) {
  const shop = useShop().data ?? null;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      showError(err, "Couldn't copy the link");
    }
  };

  const share = async () => {
    try {
      const name = shop?.name ?? "our shop";
      await Share.share({ message: `See our work and book a fitting at ${name}: ${url}` }, { subject: name, dialogTitle: "Share your website" });
    } catch (err) {
      showError(err, "Couldn't open the share sheet");
    }
  };

  const open = async () => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      showError(err, "Couldn't open the page");
    }
  };

  return (
    <View style={styles.linkBlock}>
      <View style={styles.linkBox}>
        <Text style={styles.link} numberOfLines={1} selectable>
          {url.replace(/^https?:\/\//, "")}
        </Text>
        <Pressable
          onPress={() => void copy()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy link"}
          style={({ pressed }) => [styles.copyIcon, pressed && styles.pressed]}
          testID="website-copy"
        >
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={colors.gold} />
        </Pressable>
      </View>
      <View style={styles.linkActions}>
        <Button size="sm" variant="onDark" icon="eye-outline" title="Preview" onPress={() => void open()} style={styles.flex} testID="website-open" />
        <Button size="sm" variant="gold" icon="share-outline" title="Share" onPress={() => void share()} style={styles.flex} testID="website-share" />
      </View>
    </View>
  );
}

/** "Look": Atelier, Ivory or Noir, applied by the public pages. */
function LookCard({ theme }: { theme: WebsiteTheme }) {
  const update = useUpdateWebsite();
  const [picked, setPicked] = useState(theme);
  useEffect(() => setPicked(theme), [theme]);
  const choose = (key: WebsiteTheme) => {
    if (key === picked) return;
    const before = picked;
    setPicked(key);
    update.mutate(
      { theme: key },
      {
        onSuccess: () => showToast(`${themeName(key)} look saved`, "Your website changes within a few minutes."),
        onError: (err) => {
          setPicked(before);
          showError(err, "Couldn't change the look");
        },
      },
    );
  };
  return (
    <Card style={styles.card}>
      <Eyebrow tone="muted">Look</Eyebrow>
      <View style={styles.themes}>
        {THEME_OPTIONS.map((t) => {
          const on = t.key === picked;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.name}: ${t.description}`}
              onPress={() => choose(t.key)}
              style={({ pressed }) => [styles.theme, on && styles.themeOn, pressed && styles.pressed]}
              testID={`website-theme-${t.key}`}
            >
              <View style={[styles.themePreview, { backgroundColor: t.swatch.bg }]}>
                <View style={[styles.themeLine, { backgroundColor: t.swatch.fg }]} />
                <View style={[styles.themeLineShort, { backgroundColor: t.swatch.fg }]} />
                <View style={[styles.themeDot, { backgroundColor: t.swatch.accent }]} />
              </View>
              <Text style={styles.themeName}>{t.name}</Text>
              <Text style={styles.themeDesc} numberOfLines={2}>
                {t.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

/** The site's sections, each with Edit / Choose or an on/off switch. */
function SectionsCard({ data }: { data: WebsiteResponse }) {
  const router = useRouter();
  const shop = useShop().data ?? null;
  const update = useUpdateWebsite();
  const [sections, setSections] = useState<WebsiteSections>(data.sections);
  useEffect(() => setSections(data.sections), [data.sections]);

  const flip = (key: keyof WebsiteSections, value: boolean) => {
    const before = sections;
    setSections({ ...sections, [key]: value });
    update.mutate({ sections: { [key]: value } }, { onError: (err) => {
      setSections(before);
      showError(err, "Couldn't save");
    } });
  };

  const headline = data.headline ?? `Made to measure in ${shop?.district || shop?.city || "your district"}`;
  const priced = data.services.filter((s) => s.fromPrice != null).length;
  return (
    <Card style={styles.card} padding={0}>
      <View style={styles.sectionsHead}>
        <Eyebrow tone="muted">Sections</Eyebrow>
      </View>
      <SectionRow icon="image-outline" title="Cover and headline" detail={`${data.coverUrl ? "Cover photo set" : "No cover yet"} · “${headline}”`} action="Edit" onPress={() => router.push(websiteRoutes.cover)} testID="section-cover" />
      <SectionRow
        icon="grid-outline"
        title="Portfolio"
        detail={data.piecesCount > 0 ? `${data.piecesCount} ${data.piecesCount === 1 ? "piece" : "pieces"} shown` : "Pick the work clients see"}
        action="Choose"
        onPress={() => router.push(websiteRoutes.portfolio)}
        testID="section-portfolio"
      />
      <SectionRow
        icon="pricetags-outline"
        title="Services and prices"
        detail={data.services.length > 0 ? `${data.services.length} services${priced > 0 ? `, ${priced} with a price` : ""}` : "Add what you make"}
        action="Edit"
        onPress={() => router.push(websiteRoutes.services)}
        testID="section-services"
      />
      <SectionRow
        icon="color-palette-outline"
        title="Fabrics in the shop"
        detail={data.fabricsCount > 0 ? `Up to 4 swatches from your fabric stock` : "Add a swatch colour to a fabric to show it"}
        value={sections.fabrics}
        onToggle={(v) => flip("fabrics", v)}
        testID="section-fabrics"
      />
      <SectionRow icon="list-outline" title="How it works" detail="Consultation, measurements, two fittings, collection" value={sections.process} onToggle={(v) => flip("process", v)} testID="section-process" />
      <SectionRow
        icon="star-outline"
        title="Reviews"
        detail={[data.rating != null ? `${data.rating.toFixed(1)} on Google` : null, data.reviews.length > 0 ? `${data.reviews.length} ${data.reviews.length === 1 ? "quote" : "quotes"}` : "No quotes yet"].filter(Boolean).join(" · ")}
        action="Edit"
        onPress={() => router.push(websiteRoutes.reviews)}
        testID="section-reviews"
      />
      <SectionRow
        icon="person-outline"
        title="About the shop"
        detail={[data.about ? "Story written" : "Default story", data.tailorPhotoUrl ? "photo added" : "no photo"].join(" · ")}
        action="Edit"
        onPress={() => router.push(websiteRoutes.about)}
        testID="section-about"
      />
      <SectionRow
        icon="calendar-outline"
        title="Booking form"
        detail={sections.booking ? "Visitors can ask for a fitting" : "Book buttons call or open LINE instead"}
        value={sections.booking}
        onToggle={(v) => flip("booking", v)}
        last
        testID="section-booking"
      />
    </Card>
  );
}

interface SectionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  action?: string;
  onPress?: () => void;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  last?: boolean;
  testID?: string;
}

function SectionRow({ icon, title, detail, action, onPress, value, onToggle, last, testID }: SectionRowProps) {
  const content = (
    <>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={18} color={colors.goldDark} />
      </View>
      <View style={styles.sectionText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={typography.small} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      {onToggle ? (
        <Switch
          value={!!value}
          onValueChange={onToggle}
          trackColor={{ false: colors.line, true: colors.gold }}
          thumbColor={colors.card}
          ios_backgroundColor={colors.line}
          accessibilityLabel={title}
          testID={testID}
        />
      ) : (
        <Text style={styles.sectionAction}>{action}</Text>
      )}
    </>
  );
  const rowStyle = [styles.sectionRow, !last && styles.sectionDivider];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${action}`} style={({ pressed }) => [...rowStyle, pressed && styles.pressed]} testID={testID}>
      {content}
    </Pressable>
  );
}

/** The editable address part after the fixed prefix, saved on its own. */
function AddressCard({ data }: { data: WebsiteResponse }) {
  const update = useUpdateWebsite();
  const { prefix } = splitWebsiteUrl(data.url);
  const [slug, setSlug] = useState(data.slug);
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => setSlug(data.slug), [data.slug]);

  const localError = slug === data.slug ? null : slugError(slug);
  const changed = slug !== data.slug;

  const save = () => {
    setServerError(null);
    update.mutate(
      { slug },
      {
        onSuccess: () => showToast("Address saved", "The old link no longer works. Share the new one."),
        onError: (err) => setServerError(errorMessage(err)),
      },
    );
  };

  return (
    <Card style={styles.card}>
      <Eyebrow tone="muted">Web address</Eyebrow>
      <Text style={styles.prefix} numberOfLines={1}>
        {prefix}
      </Text>
      <Field
        value={slug}
        onChangeText={(t) => {
          setServerError(null);
          setSlug(cleanSlugInput(t));
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={WEBSITE_LIMITS.slugMax}
        accessibilityLabel="Web address"
        error={localError ?? serverError}
        hint="Letters, numbers and dashes. Changing it breaks links you've already shared."
        testID="website-slug"
      />
      <Button
        size="sm"
        variant="primary"
        title="Save address"
        onPress={save}
        disabled={!changed || !!localError}
        loading={update.isPending && update.variables?.slug !== undefined}
        style={styles.saveButton}
        testID="website-slug-save"
      />
    </Card>
  );
}

/** LINE ID: the LINE button in the footer (and where Book goes when the form is off and there's no phone). */
function LineCard({ data }: { data: WebsiteResponse }) {
  const update = useUpdateWebsite();
  const [lineId, setLineId] = useState(data.lineId ?? "");
  useEffect(() => setLineId(data.lineId ?? ""), [data.lineId]);

  const changed = lineId.trim() !== (data.lineId ?? "");
  const lineError = /\s/.test(lineId.trim()) ? "A LINE ID has no spaces." : null;

  const save = () => {
    update.mutate(
      { lineId: lineId.trim().replace(/^~/, "") },
      {
        onSuccess: () => showToast("Saved", "Your page shows the new details within a few minutes."),
        onError: (err) => showError(err, "Couldn't save"),
      },
    );
  };

  return (
    <Card style={styles.card}>
      <Eyebrow tone="muted">LINE</Eyebrow>
      <Field
        label="LINE ID"
        value={lineId}
        onChangeText={setLineId}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={WEBSITE_LIMITS.lineIdMax}
        placeholder="yourshop or @yourshop"
        error={lineError}
        hint="Shown as a LINE button on every page."
        testID="website-line"
      />
      <Button
        size="sm"
        variant="primary"
        title="Save"
        onPress={save}
        disabled={!changed || !!lineError}
        loading={update.isPending && update.variables?.lineId !== undefined}
        style={styles.saveButton}
        testID="website-details-save"
      />
    </Card>
  );
}

/** What's still missing for a complete site; each row links to where it's fixed. Hidden when nothing is missing. */
function MissingCard({ data }: { data: WebsiteResponse }) {
  const router = useRouter();
  const shop = useShop().data ?? null;
  const missing = pageItems(shop, { about: data.about, lineId: data.lineId }).filter((item) => !item.present);
  const extra: { key: string; label: string; onPress: () => void }[] = [];
  if (data.piecesCount === 0) extra.push({ key: "portfolio", label: "Add your first piece of work", onPress: () => router.push(websiteRoutes.portfolio) });
  if (data.services.length === 0) extra.push({ key: "services", label: "List your services and prices", onPress: () => router.push(websiteRoutes.services) });
  if (missing.length === 0 && extra.length === 0) return null;
  const sentence = missingSentence(data.missing);

  return (
    <Card style={styles.card}>
      <Eyebrow tone="muted">{"What's missing"}</Eyebrow>
      <View>
        {extra.map((item) => (
          <ShowRow key={item.key} present={false} label={item.label} onPress={item.onPress} />
        ))}
        {missing.map((item) => (
          <ShowRow
            key={item.key}
            present={false}
            label={item.hint}
            onPress={item.fixIn === "shop-details" ? () => router.push("/shop-details") : item.key === "about" ? () => router.push(websiteRoutes.about) : undefined}
          />
        ))}
      </View>
      {sentence ? <Text style={typography.small}>{sentence}</Text> : null}
    </Card>
  );
}

function ShowRow({ present, label, onPress }: { present: boolean; label: string; onPress?: () => void }) {
  const content = (
    <>
      <View style={[styles.check, present ? styles.checkOn : styles.checkOff]}>
        <Ionicons name={present ? "checkmark" : "add"} size={14} color={present ? colors.card : colors.goldDark} />
      </View>
      <Text style={[styles.showLabel, !present && styles.showLabelMissing]}>{label}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.goldDark} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.showRow}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.showRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: { gap: 10 },
  switchCard: { gap: 0 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  switchIconOn: { backgroundColor: colors.gold },
  switchText: { flex: 1, minWidth: 0, gap: 2 },
  onDark: { color: colors.ivory },
  onDarkMuted: { color: colors.ivorySoft },
  offCard: { gap: 12 },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  benefitText: { flex: 1 },
  linkBlock: { gap: 10, marginTop: 14 },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.ivoryLine,
    borderRadius: radii.field,
    paddingLeft: 14,
    paddingRight: 6,
  },
  link: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ivory },
  themes: { flexDirection: "row", gap: 10 },
  theme: { flex: 1, minWidth: 0, gap: 4, padding: 8, borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  themeOn: { borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.cardSoft },
  themePreview: { height: 58, borderRadius: 8, padding: 8, gap: 5, justifyContent: "flex-end", borderWidth: 1, borderColor: colors.line },
  themeLine: { height: 5, width: "80%", borderRadius: 3 },
  themeLineShort: { height: 5, width: "50%", borderRadius: 3, opacity: 0.6 },
  themeDot: { position: "absolute", top: 8, right: 8, width: 12, height: 12, borderRadius: 6 },
  themeName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  themeDesc: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.muted },
  sectionsHead: { paddingHorizontal: 16, paddingTop: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sectionDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  sectionIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  sectionText: { flex: 1, minWidth: 0, gap: 2 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  sectionAction: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.goldDark },
  copyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  linkActions: { flexDirection: "row", gap: 8 },
  prefix: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  saveButton: { alignSelf: "flex-start" },
  showRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.successFg },
  checkOff: { borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.sand },
  showLabel: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.ink },
  showLabelMissing: { fontFamily: fonts.bodySemi, color: colors.goldDark },
  enquiriesCard: { gap: 0 },
  enquiriesRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  enquiriesText: { flex: 1, minWidth: 0, gap: 4 },
  badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerDeep },
});
