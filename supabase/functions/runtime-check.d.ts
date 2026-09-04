declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ImportMeta { readonly main?: boolean }

declare module "npm:@supabase/supabase-js@2" {
  export type SupabaseClient = any;
  export function createClient(...args: any[]): SupabaseClient;
}

declare module "npm:@langchain/langgraph@1.4.13" {
  export const Annotation: any;
  export const END: string;
  export const START: string;
  export const StateGraph: any;
}

declare module "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs" {
  export function getDocument(options: Record<string, unknown>): { promise: Promise<any> };
}
