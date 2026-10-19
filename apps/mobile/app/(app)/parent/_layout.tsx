import { RoleTabs } from "../../../src/ui/RoleTabs";

export default function ParentTabs() {
  return (
    <RoleTabs
      tabs={[
        { name: "index", title: "Approvals", icon: "checkmark-done-outline", iconOn: "checkmark-done" },
        { name: "history", title: "History", icon: "time-outline", iconOn: "time" },
        { name: "fees", title: "Fees", icon: "wallet-outline", iconOn: "wallet" },
        { name: "account", title: "Me", icon: "person-circle-outline", iconOn: "person-circle" },
      ]}
    />
  );
}
