import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { Client, CreateClientRequest } from "@shared/types";

import { Button, Field } from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/** "2026-06-12" → ISO string at local noon (so the calendar day survives UTC conversion); null when invalid. */
export function dateInputToIso(text: string): string | null {
  const m = DATE_RE.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

/** ISO → "YYYY-MM-DD" in local time ("" when empty/invalid). */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ClientFormProps {
  /** Prefills the fields (edit mode). */
  initial?: Client | null;
  submitLabel: string;
  submitting?: boolean;
  /**
   * Called with a validated body. Text fields are sent trimmed — possibly "" — which the API stores as null,
   * so clearing a field in edit mode clears it on the server. A blank last-order date is omitted (left unchanged).
   */
  onSubmit: (body: CreateClientRequest) => void;
  /** Rendered under the submit button (e.g. a Delete button in edit mode). */
  children?: ReactNode;
  /** Set false when the screen renders its own submit button (e.g. pinned in a Screen footer) and calls `ref.submit()`. */
  showSubmit?: boolean;
}

/** Imperative handle so a screen can trigger validation + submit from a button outside the form. */
export interface ClientFormHandle {
  submit: () => void;
}

type FieldErrors = { name?: string; email?: string; lastOrderAt?: string };

/** Name / phone / email / LINE / notes / last order date, with inline validation. */
export const ClientForm = forwardRef<ClientFormHandle, ClientFormProps>(function ClientForm(
  { initial, submitLabel, submitting = false, onSubmit, children, showSubmit = true },
  ref,
) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [lineId, setLineId] = useState(initial?.lineId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lastOrderAt, setLastOrderAt] = useState(isoToDateInput(initial?.lastOrderAt));
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = () => {
    const next: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const dateText = lastOrderAt.trim();
    let lastOrderIso: string | undefined;

    if (!trimmedName) next.name = "A name is required.";
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) next.email = "That doesn't look like an email address.";
    if (dateText) {
      const iso = dateInputToIso(dateText);
      if (!iso) next.lastOrderAt = "Use the format YYYY-MM-DD, e.g. 2026-06-12.";
      else if (new Date(iso).getTime() > Date.now() + 86_400_000) next.lastOrderAt = "The last order can't be in the future.";
      else lastOrderIso = iso;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      name: trimmedName,
      phone: phone.trim(),
      email: trimmedEmail,
      lineId: lineId.trim(),
      notes: notes.trim(),
      lastOrderAt: lastOrderIso,
    });
  };

  useImperativeHandle(ref, () => ({ submit }));

  return (
    <View style={styles.form}>
      <Field
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
        }}
        placeholder="e.g. Anucha Srisuk"
        autoCapitalize="words"
        textContentType="name"
        returnKeyType="next"
        error={errors.name}
        editable={!submitting}
      />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="e.g. 081 234 5678"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        returnKeyType="next"
        editable={!submitting}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
        }}
        placeholder="e.g. anucha@example.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        error={errors.email}
        editable={!submitting}
      />
      <Field
        label="LINE ID"
        value={lineId}
        onChangeText={setLineId}
        placeholder="e.g. anucha_s"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        editable={!submitting}
      />
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Preferences, referrals, anything worth remembering"
        multiline
        editable={!submitting}
      />
      <Field
        label="Last order date"
        value={lastOrderAt}
        onChangeText={(t) => {
          setLastOrderAt(t);
          if (errors.lastOrderAt) setErrors((e) => ({ ...e, lastOrderAt: undefined }));
        }}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        hint="Optional. Helps spot clients who've gone quiet. Logging a fitting updates it automatically."
        error={errors.lastOrderAt}
        editable={!submitting}
      />

      {showSubmit ? (
        <Button title={submitLabel} onPress={submit} loading={submitting} disabled={!name.trim()} fullWidth style={styles.submit} />
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  form: { gap: 16 },
  submit: { marginTop: 4 },
});
