import { supabase } from "@/lib/supabase";

export const MIGRATION_CONFIRMATION_TEXT =
  "CLEAR RESEARCH DATA AND MIGRATE";

export type MigrationPageResult = {
  sourceType: string;
  imported: number;
  importedTotal: number;
  sourceCount: number;
  nextCursor: number;
  done: boolean;
};

type MigrationRun = {
  id: string;
  source_base_url: string;
  requested_types: number;
  started_at: string;
  status?: string;
  completed_types?: number;
  failed_types?: number;
  imported_records?: number;
};

async function invokeMigration<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("bubble-migrate", {
    body,
  });

  if (error) throw new Error(error.message || "Migration function failed.");
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function resetResearchMigration(
  baseUrl: string,
  confirmation: string,
) {
  return invokeMigration<{
    run: MigrationRun;
    sourceTypes: string[];
  }>({
    action: "reset",
    baseUrl,
    confirmation,
  });
}

export async function importBubblePage(
  runId: string,
  sourceType: string,
  cursor: number,
) {
  return invokeMigration<MigrationPageResult>({
    action: "page",
    runId,
    sourceType,
    cursor,
  });
}

export async function completeResearchMigration(runId: string) {
  return invokeMigration<{ run: MigrationRun }>({
    action: "complete",
    runId,
  });
}

