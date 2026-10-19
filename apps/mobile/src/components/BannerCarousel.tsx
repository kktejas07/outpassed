import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { campus, type BannerDto } from "../api/client";
import { useQuery } from "../lib/useQuery";
import { font, radius } from "../theme/tokens";
import { FadeIn, PressScale, useReduceMotion } from "../ui/motion";
import { Text } from "../ui/Text";

/** Banner colour themes. Occasions pick one; featured offers get one from their category. */
export const BANNER_THEMES: Record<string, { bg: string; ring: string; sub: string; chip: string }> = {
  indigo: { bg: "#4338CA", ring: "#6366F1", sub: "#E0E7FF", chip: "#3730A3" },
  teal: { bg: "#0F766E", ring: "#14B8A6", sub: "#CCFBF1", chip: "#115E59" },
  saffron: { bg: "#C2410C", ring: "#FB923C", sub: "#FFEDD5", chip: "#9A3412" },
  rose: { bg: "#BE185D", ring: "#F472B6", sub: "#FCE7F3", chip: "#9D174D" },
  forest: { bg: "#166534", ring: "#22C55E", sub: "#DCFCE7", chip: "#14532D" },
  night: { bg: "#1E1B4B", ring: "#4F46E5", sub: "#C7D2FE", chip: "#312E81" },
};
export const themeOf = (t: string) => BANNER_THEMES[t] ?? BANNER_THEMES.indigo!;

const short = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function open(b: BannerDto) {
  if (b.kind === "OCCASION" && b.occasionId) router.push(`/occasions/${b.occasionId}`);
  else if (b.offerId) router.push({ pathname: "/offers", params: { focus: b.offerId } });
}

function Slide({ b, width }: { b: BannerDto; width: number }) {
  const t = themeOf(b.theme);
  const eyebrow = b.kind === "OFFER" ? `Sponsored · ${b.sponsor ?? "Partner"}` : `Campus sale${b.endsAt ? ` · till ${short(b.endsAt)}` : ""}`;
  return (
    <PressScale onPress={() => open(b)} accessibilityRole="button" accessibilityLabel={`${b.title}. ${b.subtitle}. ${b.cta}`} style={[styles.slide, { width, backgroundColor: t.bg }]}>
      {/* Soft rings, the same motif as the header band. */}
      <View style={[styles.ring, { borderColor: t.ring, width: 190, height: 190, right: -60, top: -70 }]} />
      <View style={[styles.ring, { borderColor: t.ring, width: 120, height: 120, right: -20, bottom: -60, opacity: 0.5 }]} />
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.eyebrow, { color: t.sub }]} numberOfLines={1}>{eyebrow.toUpperCase()}</Text>
          <Text style={styles.title} numberOfLines={2}>{b.title}</Text>
          <Text style={[styles.sub, { color: t.sub }]} numberOfLines={2}>{b.subtitle}</Text>
        </View>
        <View style={[styles.icon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
          <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={30} color="#FFFFFF" />
        </View>
      </View>
      <View style={[styles.cta, { backgroundColor: "#FFFFFF" }]}>
        <Text style={[styles.ctaText, { color: t.chip }]}>{b.cta}</Text>
        <Ionicons name="arrow-forward" size={14} color={t.chip} />
      </View>
    </PressScale>
  );
}

function Dot({ active }: { active: boolean }) {
  const w = useRef(new Animated.Value(active ? 18 : 6)).current;
  useEffect(() => {
    Animated.spring(w, { toValue: active ? 18 : 6, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
  }, [active, w]);
  return <Animated.View style={[styles.dot, { width: w, backgroundColor: active ? "#4338CA" : "#C7D2FE" }]} />;
}

/**
 * The banner strip: running campus sales and offers the college featured.
 * Pages by itself every few seconds (unless the phone asks for less motion);
 * renders nothing when there is nothing to show.
 */
export function BannerCarousel() {
  const q = useQuery((t) => campus.banners(t));
  const banners = q.data ?? [];
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const scroller = useRef<ScrollViewInstance>(null);
  const touching = useRef(false);
  const reduce = useReduceMotion();
  const gap = 12;
  const page = width + gap;

  useEffect(() => {
    if (reduce || banners.length < 2 || !width) return;
    const t = setInterval(() => {
      if (touching.current) return;
      const next = (indexRef.current + 1) % banners.length;
      scroller.current?.scrollTo({ x: next * page, animated: true });
      setIndex(next);
    }, 5000);
    return () => clearInterval(t);
  }, [reduce, banners.length, width, page]);

  if (!banners.length) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!page) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / page);
    if (i !== index && i >= 0 && i < banners.length) setIndex(i);
  };

  return (
    <FadeIn>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 10 }}>
        {width ? (
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={page}
            decelerationRate="fast"
            disableIntervalMomentum
            onScroll={onScroll}
            scrollEventThrottle={32}
            onTouchStart={() => (touching.current = true)}
            onTouchEnd={() => (touching.current = false)}
            contentContainerStyle={{ gap }}
            accessibilityRole="adjustable"
            accessibilityLabel={`Banners, ${index + 1} of ${banners.length}`}
          >
            {banners.map((b) => <Slide key={b.id} b={b} width={width} />)}
          </ScrollView>
        ) : (
          <View style={{ height: 156 }} />
        )}
        {banners.length > 1 ? (
          <View style={styles.dots}>
            {banners.map((b, i) => <Dot key={b.id} active={i === index} />)}
          </View>
        ) : null}
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  slide: { minHeight: 156, borderRadius: radius.lg, padding: 18, gap: 14, overflow: "hidden", justifyContent: "space-between" },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 18, opacity: 0.35 },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  eyebrow: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.8 },
  title: { fontFamily: font.display, fontSize: 19, lineHeight: 24, color: "#FFFFFF" },
  sub: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 14, height: 34, borderRadius: 999 },
  ctaText: { fontFamily: font.bodyBold, fontSize: 13 },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { height: 6, borderRadius: 3 },
});
