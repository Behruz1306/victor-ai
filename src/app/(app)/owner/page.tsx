import { requirePage } from "@/lib/auth/guard";
import { OwnerView } from "./owner-view";

export const metadata = { title: "Owner" };

export default async function OwnerPage() {
  await requirePage("view:owner");
  return <OwnerView />;
}
