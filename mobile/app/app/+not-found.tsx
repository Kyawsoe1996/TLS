import { useRouter } from "expo-router";

import { Button, EmptyState, Screen } from "@/components/ui";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen eyebrow="Oops" title="Page not found" edges={["top", "bottom"]}>
      <EmptyState
        icon="compass-outline"
        title="That link doesn't go anywhere"
        body="It may have moved or never existed."
        action={<Button title="Go home" onPress={() => router.replace("/")} />}
      />
    </Screen>
  );
}
