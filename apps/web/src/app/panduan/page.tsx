import { GuidePage } from '@/features/help/GuidePage';
export default async function Page({searchParams}:{searchParams:Promise<{q?:string|string[];topic?:string|string[]}>}){
  const params=await searchParams;
  const query=typeof params.q==='string'?params.q.slice(0,160):'';
  const topic=typeof params.topic==='string'?params.topic:'';
  return <GuidePage key={`${query}:${topic}`} initialQuery={query} initialTopic={topic}/>;
}
