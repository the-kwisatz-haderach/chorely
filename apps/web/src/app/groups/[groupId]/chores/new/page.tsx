import { AuthFlow } from "../../../../auth-flow";
import { parsePlacement } from "../../../../chore-fields";

export default async function NewChorePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ title?: string; placement?: string }>;
}) {
  const { groupId } = await params;
  const { title = "", placement } = await searchParams;
  return <AuthFlow newChore={{ groupId, title, placement: parsePlacement(placement) }} />;
}
