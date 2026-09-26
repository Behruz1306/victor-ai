import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { canSeeCustomer } from "@/lib/queries/scope";
import { taskDetail } from "@/lib/queries/task";
import { TaskCard } from "./task-card";

export const metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("view:task");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const detail = await taskDetail(db, ctx.companyId, id);
  if (!detail || !(await canSeeCustomer(db, ctx, detail.task.customerId))) notFound();
  return <TaskCard detail={JSON.parse(JSON.stringify(detail))} />;
}
