import { AuthFlow } from "../../../auth-flow";

export default async function SettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <AuthFlow groupPage={{ groupId, view: "settings" }} />;
}
