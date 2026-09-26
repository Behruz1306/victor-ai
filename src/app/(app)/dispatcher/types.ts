import type { Jsonify } from "@/lib/client/api";
import type { customerDetail, dispatcherOverview } from "@/lib/queries/dispatcher";

export type Overview = Jsonify<Awaited<ReturnType<typeof dispatcherOverview>>>;
export type OverviewCustomer = Overview["customers"][number];
export type Detail = Jsonify<NonNullable<Awaited<ReturnType<typeof customerDetail>>>>;
export type DetailSuggestion = Detail["suggestions"][number];
export type DetailTask = Detail["tasks"][number];
export type DetailMessage = Detail["timeline"][number];
