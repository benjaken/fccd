import type { RagTrace } from "./customer-service-rag-runtime.ts";
export function ragRecallAtK(traces: readonly RagTrace[], expectedIds: readonly string[] | null, k=5): number | null {
  if (!expectedIds?.length) return null; // Unlabelled and explicit unanswerable cases are not recall denominators.
  const relevant=new Set(expectedIds);
  const retrieved=new Set(traces.filter(t=>t.stage==="retrieval").flatMap(t=>(t.candidates??[]).filter(c=>c.rank<=k).map(c=>c.id)));
  return [...relevant].filter(id=>retrieved.has(id)).length/relevant.size;
}
export function meanKnown(values: Array<number|null>): number|null {
  const known=values.filter((n):n is number=>n!==null);
  return known.length?known.reduce((a,b)=>a+b,0)/known.length:null;
}
/** Textual similarity is a diagnostic only, not factual correctness. */
export function ragAnswerTextSimilarity(left:string,right:string):number {
  const grams=(s:string)=>{
    const n=s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");
    return new Set(n.length<2?(n?[n]:[]):Array.from({length:n.length-1},(_,i)=>n.slice(i,i+2)));
  };
  const a=grams(left),b=grams(right);
  return a.size&&b.size?[...a].filter(s=>b.has(s)).length/new Set([...a,...b]).size:0;
}
