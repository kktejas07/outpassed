import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function WardenTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Queue", icon: "file-tray-full-outline", iconOn: "file-tray-full" },
        { name: "campus", title: "Campus", icon: "stats-chart-outline", iconOn: "stats-chart" },
        { name: "rollcall", title: "Roll call", icon: "clipboard-outline", iconOn: "clipboard" },
        { name: "visitors", title: "Visitors", icon: "people-outline", iconOn: "people" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
