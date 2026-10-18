import { View } from "react-native";
import { color } from "../theme/tokens";

/** The Outpass mark at small sizes: teal tile, indigo arch (the gate), white keystone. */
export function Mark({ size = 34 }: { size?: number }) {
  const w = size;
  return (
    <View style={{ width: w, height: w, borderRadius: w * 0.28, backgroundColor: color.accentLight, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
      <View
        style={{
          width: w * 0.5,
          height: w * 0.58,
          borderTopLeftRadius: w * 0.25,
          borderTopRightRadius: w * 0.25,
          borderWidth: w * 0.1,
          borderBottomWidth: 0,
          borderColor: color.head,
        }}
      />
      <View style={{ position: "absolute", top: w * 0.13, width: w * 0.15, height: w * 0.15, backgroundColor: color.white, borderRadius: 2, transform: [{ rotate: "45deg" }] }} />
    </View>
  );
}
