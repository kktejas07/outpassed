import { Redirect, Stack, router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "../../src/auth/session";

export default function AppLayout() {
  const { status, signOut } = useSession();

  if (status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerRight: () => (
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/login");
            }}
            hitSlop={8}
          >
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Records" }} />
      <Stack.Screen name="new" options={{ title: "New record" }} />
      <Stack.Screen name="[id]" options={{ title: "Record" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  signOut: { color: "#2563eb", paddingHorizontal: 8 },
});
