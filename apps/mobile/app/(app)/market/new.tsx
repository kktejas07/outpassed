import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { campus, errorMessage } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { useQuery } from "../../../src/lib/useQuery";
import { pickPhoto } from "../../../src/features/photo/pickPhoto";
import { color, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Chips, ErrorNote } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { useRibbon } from "../../../src/ui/Ribbon";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const categories = ["Books", "Electronics", "Cycles", "Furniture", "Clothing", "Sports", "Other"].map((c) => ({ value: c, label: c }));
const conditions = ["New", "Like new", "Used", "Needs repair"].map((c) => ({ value: c, label: c }));

export default function Sell() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Books");
  const [condition, setCondition] = useState("Used");
  const [photo, setPhoto] = useState<string | null>(null);
  const params = useLocalSearchParams<{ occasionId?: string }>();
  const [occasionId, setOccasionId] = useState(params.occasionId ?? "none");
  const sales = useQuery((t) => campus.occasions(t)).data?.filter((o) => o.live) ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim().length >= 3 && description.trim().length > 0 && price !== "";

  async function addPhoto(source: "camera" | "library") {
    try {
      const p = await pickPhoto(source);
      if (p) setPhoto(p);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submit() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const item = await campus.sell(token, { title: title.trim(), description: description.trim(), price: Number(price), category, condition, photo: photo ?? undefined, occasionId: occasionId !== "none" ? occasionId : undefined });
      router.replace(`/market/${item.id}`);
      ribbon.show({ tone: "success", title: "Listing sent for review", body: "The office checks listings first. You'll get a message when it's live." });
    } catch (err) {
      setError(errorMessage(err, "Couldn't list your item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Sell something" eyebrow="Buy & sell" back footer={<Button icon="pricetag-outline" label="List it" loading={busy} disabled={!valid} onPress={submit} />}>
      <FadeIn>
        <Pressable onPress={() => void addPhoto("library")} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.photo}>
          {photo ? (
            <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="camera-outline" size={30} color={color.indigo} />
              <Text variant="label" style={{ color: color.indigo }}>Add a photo</Text>
              <Text variant="caption">Listings with photos sell faster</Text>
            </View>
          )}
        </Pressable>
        <Button compact tone="ghost" icon="camera" label="Take a photo instead" onPress={() => void addPhoto("camera")} />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 14 }}>
        <Field label="What are you selling?" value={title} onChangeText={setTitle} placeholder="e.g. Engineering Maths textbook" />
        <Field label="Details" value={description} onChangeText={setDescription} multiline placeholder="Edition, size, how old, any damage…" />
        <Field label="Price (₹)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, "").slice(0, 7))} keyboardType="number-pad" placeholder="0 for free" />
      </FadeIn>
      <FadeIn index={2} style={{ gap: 10 }}>
        <Text variant="eyebrow">Category</Text>
        <Chips options={categories} value={category} onChange={setCategory} />
        <Text variant="eyebrow">Condition</Text>
        <Chips options={conditions} value={condition} onChange={setCondition} />
        {sales.length ? (
          <>
            <Text variant="eyebrow">Part of a campus sale?</Text>
            <Chips options={[{ value: "none", label: "No" }, ...sales.map((o) => ({ value: o.id, label: o.name }))]} value={occasionId} onChange={setOccasionId} />
          </>
        ) : null}
      </FadeIn>
      <Text variant="caption">Buyers tap "I'm interested" and can then message you on WhatsApp. Meet on campus and pay in person.</Text>
      {error ? <ErrorNote message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 200, borderRadius: radius.lg, borderWidth: 2, borderStyle: "dashed", borderColor: color.headSub, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
