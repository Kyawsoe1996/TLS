import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Client, CreateClientRequest } from "@shared/types";

import { ClientForm, cacheClient, clientRoutes, type ClientFormHandle } from "@/components/clients";
import { ReferrerPicker, afterReferralChanged } from "@/components/referrals";
import { Button, Chip, Screen } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";

/** POST /clients, then replaces itself with the new client file (back returns to the list). */
export default function NewClientScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const formRef = useRef<ClientFormHandle>(null);
  // Smart Referral: the client who sent them, if anyone (optional "Who sent you?" below the form).
  const [referrer, setReferrer] = useState<Client | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: CreateClientRequest) => api.createClient(body),
    onSuccess: ({ client }) => {
      cacheClient(queryClient, client);
      if (client.referredByClientId) afterReferralChanged(queryClient, [client.referredByClientId]);
      router.replace(clientRoutes.detail(client.id));
    },
    onError: (err) => showError(err, "Couldn't save client"),
  });

  return (
    <Screen
      back
      eyebrow="Clients"
      title="New client"
      keyboard
      // Pinned below the form so it's always reachable on a long form.
      footer={<Button title="Save client" fullWidth onPress={() => formRef.current?.submit()} loading={mutation.isPending} />}
    >
      <ClientForm
        ref={formRef}
        showSubmit={false}
        submitLabel="Save client"
        submitting={mutation.isPending}
        onSubmit={(body) => mutation.mutate(referrer ? { ...body, referredByClientId: referrer.id } : body)}
      >
        <View style={styles.referrer}>
          <Text style={typography.label}>Who sent you?</Text>
          <View style={styles.chips}>
            <Chip label="Nobody" selected={!referrer} onPress={() => setReferrer(null)} disabled={mutation.isPending} testID="referrer-nobody" />
            {referrer ? (
              <Pressable
                onPress={() => setReferrer(null)}
                disabled={mutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Sent by ${referrer.name}. Clear`}
                style={({ pressed }) => [styles.chosen, pressed && styles.pressed]}
                testID="referrer-chosen"
              >
                <Text style={styles.chosenText} numberOfLines={1}>
                  {referrer.name}
                </Text>
                <Ionicons name="close" size={16} color={colors.ivory} />
              </Pressable>
            ) : (
              <Chip label="Pick a client" icon="person-outline" onPress={() => setPickerOpen(true)} disabled={mutation.isPending} testID="referrer-pick" />
            )}
          </View>
          <Text style={typography.small}>Optional. The client who sent them earns the referral reward when this client&apos;s first order is delivered.</Text>
        </View>
      </ClientForm>

      <ReferrerPicker
        visible={pickerOpen}
        onPick={(client) => {
          setReferrer(client);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  referrer: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    maxWidth: "100%",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 6,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  chosenText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18, color: colors.ivory },
  pressed: { opacity: 0.85 },
});
