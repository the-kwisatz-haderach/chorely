import { AuthFlow } from "../../../../../auth-flow";

export default async function EditChorePage({ params }: { params: Promise<{ groupId: string; choreId: string }> }) {
  const { groupId, choreId } = await params;
  return (
    <main>
      <h1>Chorely</h1>
      <AuthFlow editChore={{ groupId, choreId }} />
    </main>
  );
}
