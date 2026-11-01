import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WEBSITE_LIMITS, type WebsiteResponse, type WebsiteService } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, EmptyState, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsite, useWebsiteAction } from "@/components/website";
import { typography } from "@/constants/theme";
import { confirm, showError, showToast } from "@/lib/toast";
import { DEFAULT_INCLUDES, includesFromText, moveItem, parsePriceInput, priceLabel } from "@/lib/website";

/**
 * Your free website → Services and prices: the list on the Services page (name, "from" price in baht, one line),
 * in order, with add / remove / move. An empty list offers the usual three services, without prices.
 */
export default function WebsiteServicesScreen() {
  const query = useWebsite();
  return (
    <Screen back keyboard eyebrow="Your website" title="Services and prices" subtitle="What you make, with the price it starts at." edges={["top", "bottom"]}>
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <ServicesEditor data={query.data} />
      )}
    </Screen>
  );
}

function ServicesEditor({ data }: { data: WebsiteResponse }) {
  const services = data.services;
  const defaults = useWebsiteAction((api) => api.addDefaultWebsiteServices(), "Couldn't add the services");
  const reorder = useWebsiteAction((api, ids: string[]) => api.reorderWebsiteServices(ids), "Couldn't move it");
  const full = services.length >= WEBSITE_LIMITS.servicesMax;

  return (
    <>
      {services.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No services listed yet"
          body="Start with the usual three (Two-piece suit, Shirt, Alterations) and add your own prices, or add your own below."
          action={<Button title="Add the usual services" variant="gold" onPress={() => defaults.mutate(undefined)} loading={defaults.isPending} testID="services-defaults" />}
        />
      ) : (
        services.map((service, index) => (
          <ServiceRow
            key={service.id}
            service={service}
            first={index === 0}
            last={index === services.length - 1}
            moving={reorder.isPending}
            onMove={(direction) => reorder.mutate(moveItem(services, index, direction).map((s) => s.id))}
          />
        ))
      )}
      {full ? <Text style={typography.small}>The website lists up to {WEBSITE_LIMITS.servicesMax} services.</Text> : <NewService />}
      <Text style={typography.small}>Leave the price empty to show the service without one. Prices are “from”: the final price depends on the cloth.</Text>
      <IncludesCard includes={data.includes} />
    </>
  );
}

/** One service, edited in place; Save appears when something changed. */
function ServiceRow({ service, first, last, moving, onMove }: { service: WebsiteService; first: boolean; last: boolean; moving: boolean; onMove: (d: -1 | 1) => void }) {
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(service.fromPrice == null ? "" : String(service.fromPrice));
  const [line, setLine] = useState(service.line ?? "");
  const save = useWebsiteAction((api, body: Parameters<typeof api.updateWebsiteService>[1]) => api.updateWebsiteService(service.id, body), "Couldn't save the service");
  const remove = useWebsiteAction((api) => api.deleteWebsiteService(service.id), "Couldn't remove the service");

  const parsed = parsePriceInput(price);
  const priceError = parsed === undefined ? "Whole baht, for example 18000." : null;
  const changed = name.trim() !== service.name || parsed !== service.fromPrice || line.trim() !== (service.line ?? "");

  const onRemove = async () => {
    if (await confirm({ title: `Remove ${service.name}?`, message: "It comes off the Services page.", confirmText: "Remove", destructive: true })) remove.mutate(undefined);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Eyebrow tone="muted">{priceLabel(service.fromPrice) || "No price shown"}</Eyebrow>
      </View>
      <Field label="Name" value={name} onChangeText={setName} maxLength={WEBSITE_LIMITS.serviceNameMax} error={name.trim() ? null : "Give it a name."} />
      <Field label="From price (฿)" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="18000" error={priceError} />
      <Field label="One line" value={line} onChangeText={setLine} maxLength={WEBSITE_LIMITS.serviceLineMax} placeholder="Jacket and trousers in the cloth you choose." />
      <View style={styles.actions}>
        <Button
          size="sm"
          title="Save"
          disabled={!changed || !!priceError || !name.trim()}
          loading={save.isPending}
          onPress={() =>
            save.mutate({ name: name.trim(), fromPrice: parsed ?? null, line: line.trim() }, { onSuccess: () => showToast("Saved") })
          }
        />
        <Button size="sm" variant="secondary" icon="arrow-up" title="Up" onPress={() => onMove(-1)} disabled={first || moving} />
        <Button size="sm" variant="secondary" icon="arrow-down" title="Down" onPress={() => onMove(1)} disabled={last || moving} />
        <Button size="sm" variant="danger" icon="trash-outline" title="Remove" onPress={() => void onRemove()} loading={remove.isPending} />
      </View>
    </Card>
  );
}

function NewService() {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [line, setLine] = useState("");
  const create = useWebsiteAction((api, body: Parameters<typeof api.createWebsiteService>[0]) => api.createWebsiteService(body), "Couldn't add the service");
  const parsed = parsePriceInput(price);
  const priceError = parsed === undefined ? "Whole baht, for example 18000." : null;

  const add = () =>
    create.mutate(
      { name: name.trim(), fromPrice: parsed ?? null, line: line.trim() || undefined },
      {
        onSuccess: () => {
          setName("");
          setPrice("");
          setLine("");
        },
      },
    );

  return (
    <Card variant="soft" style={styles.card}>
      <Eyebrow tone="muted">Add a service</Eyebrow>
      <Field label="Name" value={name} onChangeText={setName} maxLength={WEBSITE_LIMITS.serviceNameMax} placeholder="Linen jacket" testID="service-new-name" />
      <Field label="From price (฿)" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="Optional" error={priceError} />
      <Field label="One line" value={line} onChangeText={setLine} maxLength={WEBSITE_LIMITS.serviceLineMax} placeholder="Optional" />
      <Button size="sm" icon="add" title="Add service" onPress={add} disabled={!name.trim() || !!priceError} loading={create.isPending} style={styles.start} testID="service-add" />
    </Card>
  );
}

/** "Every garment includes": one line per promise, shown on the Services page; empty = the default three. */
function IncludesCard({ includes }: { includes: string[] | null }) {
  const update = useUpdateWebsite();
  const saved = (includes ?? []).join("\n");
  const [text, setText] = useState(saved);
  const lines = includesFromText(text);
  return (
    <Card style={styles.card}>
      <Eyebrow tone="muted">Every garment includes</Eyebrow>
      <Field
        value={text}
        onChangeText={setText}
        multiline
        placeholder={DEFAULT_INCLUDES.join("\n")}
        hint={`One per line, up to ${WEBSITE_LIMITS.includesMax}. Left empty, the page shows the three lines above. Only promise what you always do.`}
        accessibilityLabel="Every garment includes"
        testID="services-includes"
      />
      <Button
        size="sm"
        title="Save"
        disabled={lines.join("\n") === saved}
        loading={update.isPending}
        style={styles.start}
        onPress={() => update.mutate({ includes: lines }, { onSuccess: () => showToast("Saved"), onError: (err) => showError(err, "Couldn't save") })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  start: { alignSelf: "flex-start" },
});
