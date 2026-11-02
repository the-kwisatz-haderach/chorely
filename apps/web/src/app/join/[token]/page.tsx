import { AuthFlow } from "../../auth-flow";

export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AuthFlow inviteToken={token} intro={<p>You&apos;ve been invited to join a Group. Sign in to continue.</p>} />;
}
