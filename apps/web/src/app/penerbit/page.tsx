import { PortalPage } from '@/features/portal/PortalPage';
// The app shell wraps this route in the shared wallet provider (see AppShell).
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string|string[]}>}){
  const {tab}=await searchParams;
  return <PortalPage initialTab={tab==='issuance'||tab==='records'?tab:'institution'}/>;
}
