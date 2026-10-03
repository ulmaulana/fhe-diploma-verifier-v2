import { VerificationWorkspace } from '@/features/verification/VerificationWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<{credentialId?:string|string[]}>}) {
  const {credentialId} = await searchParams;
  return <VerificationWorkspace credentialId={typeof credentialId === 'string' ? credentialId : undefined}/>;
}
