import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function StudentTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Pass", icon: "ticket-outline", iconOn: "ticket" },
        { name: "history", title: "History", icon: "time-outline", iconOn: "time" },
        { name: "campus", title: "Campus", icon: "sparkles-outline", iconOn: "sparkles" },
        { name: "visitors", title: "Visitors", icon: "people-outline", iconOn: "people" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
