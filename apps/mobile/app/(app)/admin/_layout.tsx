import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function AdminTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Campus", icon: "stats-chart-outline", iconOn: "stats-chart" },
        { name: "queue", title: "Queue", icon: "file-tray-full-outline", iconOn: "file-tray-full" },
        { name: "people", title: "People", icon: "id-card-outline", iconOn: "id-card" },
        { name: "visitors", title: "Visitors", icon: "people-outline", iconOn: "people" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
