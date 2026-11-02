import { AuthFlow } from "../../../auth-flow";

export default async function DonePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <AuthFlow groupPage={{ groupId, view: "done" }} />;
}
