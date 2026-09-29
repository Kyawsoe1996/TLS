import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import type { UpdateClientRequest } from "@shared/types";

import {
  ClientForm,
  ErrorBlock,
  LoadingBlock,
  cacheClient,
  clientRoutes,
  forgetClient,
  isNotFoundError,
  useClient,
  type ClientFormHandle,
} from "@/components/clients";
import { Button, EmptyState, Screen } from "@/components/ui";
import { useApi } from "@/lib/api";
import { confirm, showError } from "@/lib/toast";

/** PATCH /clients/:id (back to the client file) or DELETE /clients/:id (back to the list). */
export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);
  const client = clientQuery.data;
  const formRef = useRef<ClientFormHandle>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(clientRoutes.detail(id)));

  const update = useMutation({
    mutationFn: (body: UpdateClientRequest) => api.updateClient(id, body),
    onSuccess: ({ client: saved }) => {
      cacheClient(queryClient, saved);
      goBack();
    },
    onError: (err) => showError(err, "Couldn't save changes"),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteClient(id),
    onSuccess: () => {
      forgetClient(queryClient, id);
      router.dismissTo(clientRoutes.list);
    },
    onError: (err) => showError(err, "Couldn't delete client"),
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${client?.name ?? "this client"}?`,
      message: "Their file and every fitting will be removed. This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) remove.mutate();
  };

  let body;
  if (clientQuery.isPending) {
    body = <LoadingBlock />;
  } else if (clientQuery.isError) {
    body = isNotFoundError(clientQuery.error) ? (
      <EmptyState
        icon="person-remove-outline"
        title="Client not found"
        body="This client may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to clients" onPress={() => router.dismissTo(clientRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={clientQuery.error} onRetry={() => void clientQuery.refetch()} retrying={clientQuery.isFetching} />
    );
  } else {
    body = (
      <ClientForm
        ref={formRef}
        showSubmit={false}
        initial={client}
        submitLabel="Save changes"
        submitting={update.isPending}
        onSubmit={(values) => update.mutate(values)}
      >
        <Button
          title="Delete client"
          variant="danger"
          icon="trash-outline"
          onPress={() => void onDelete()}
          loading={remove.isPending}
          disabled={update.isPending}
          fullWidth
        />
      </ClientForm>
    );
  }

  return (
    <Screen
      back
      eyebrow="Client file"
      title="Edit client"
      keyboard
      footer={
        client ? (
          <Button
            title="Save changes"
            fullWidth
            onPress={() => formRef.current?.submit()}
            loading={update.isPending}
            disabled={remove.isPending}
          />
        ) : undefined
      }
    >
      {body}
    </Screen>
  );
}
