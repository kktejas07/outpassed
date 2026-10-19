import type { Role } from "@outpassed/shared";

/** Landing route for each role. */
export function homeFor(role: Role | undefined) {
  switch (role) {
    case "PARENT": return "/parent" as const;
    case "WARDEN": return "/warden" as const;
    case "GUARD": return "/guard" as const;
    case "ADMIN": return "/admin" as const;
    case "FACULTY": return "/faculty" as const;
    default: return "/student" as const;
  }
}
