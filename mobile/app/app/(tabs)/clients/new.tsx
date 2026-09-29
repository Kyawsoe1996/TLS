import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef } from "react";
import type { CreateClientRequest } from "@shared/types";

import { ClientForm, cacheClient, clientRoutes, type ClientFormHandle } from "@/components/clients";
import { Button, Screen } from "@/components/ui";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";

/** POST /clients, then replaces itself with the new client file (back returns to the list). */
export default function NewClientScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const formRef = useRef<ClientFormHandle>(null);

  const mutation = useMutation({
    mutationFn: (body: CreateClientRequest) => api.createClient(body),
    onSuccess: ({ client }) => {
      cacheClient(queryClient, client);
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
        onSubmit={(body) => mutation.mutate(body)}
      />
    </Screen>
  );
}
