import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function GuardTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Scan", icon: "scan-outline", iconOn: "scan" },
        { name: "parcels", title: "Parcels", icon: "cube-outline", iconOn: "cube" },
        { name: "walk-in", title: "Walk-in", icon: "person-add-outline", iconOn: "person-add" },
        { name: "log", title: "Log", icon: "list-outline", iconOn: "list" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
