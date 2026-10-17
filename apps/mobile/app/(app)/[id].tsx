import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { RecordStatus } from "@outpassed/shared";
import { api } from "../../src/api/client";
import { useSession } from "../../src/auth/session";

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<RecordStatus>("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      try {
        const record = await api.getRecord(token, id);
        setTitle(record.title);
        setDescription(record.description ?? "");
        setStatus(record.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load record");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  async function onSave() {
    if (!token || !id) return;
    setError(null);
    setSaving(true);
    try {
      await api.updateRecord(token, id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!token || !id) return;
    setError(null);
    setSaving(true);
    try {
      await api.deleteRecord(token, id);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Status</Text>
      <View style={styles.statusRow}>
        {(["active", "archived"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, status === value && styles.chipActive]}
            onPress={() => setStatus(value)}
          >
            <Text style={status === value ? styles.chipTextActive : styles.chipText}>
              {value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.deleteButton, saving && styles.buttonDisabled]}
        onPress={onDelete}
        disabled={saving}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  statusRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { color: "#111827" },
  chipTextActive: { color: "#fff" },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  deleteButtonText: { color: "#dc2626", fontSize: 16, fontWeight: "600" },
  error: { color: "#dc2626", marginTop: 16 },
});
