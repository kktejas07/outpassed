import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function FacultyTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Requests", icon: "file-tray-full-outline", iconOn: "file-tray-full" },
        { name: "visitors", title: "Visitors", icon: "people-outline", iconOn: "people" },
        { name: "campus", title: "Campus", icon: "sparkles-outline", iconOn: "sparkles" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
