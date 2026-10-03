import { CredentialRecord } from '@/features/credentials/CredentialRecord';
export default async function Page({params}:{params:Promise<{credentialId:string}>}) { const {credentialId} = await params; return <CredentialRecord credentialId={credentialId}/>; }
