import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { RecordDto } from "@outpassed/shared";
import { api } from "../../src/api/client";
import { useSession } from "../../src/auth/session";

export default function RecordsListScreen() {
  const { token } = useSession();
  const [records, setRecords] = useState<RecordDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setRecords(await api.listRecords(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Reload whenever the screen regains focus (e.g. after creating/editing).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={records.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={<Text style={styles.empty}>No records yet.</Text>}
        renderItem={({ item }) => (
          <Link href={`/(app)/${item.id}`} asChild>
            <TouchableOpacity style={styles.row}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>{item.status}</Text>
            </TouchableOpacity>
          </Link>
        )}
      />

      <Link href="/(app)/new" asChild>
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addButtonText}>+ New record</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyList: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#71717a" },
  error: { color: "#dc2626", marginBottom: 8 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: { fontSize: 16 },
  rowMeta: { color: "#71717a", fontSize: 13 },
  addButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
