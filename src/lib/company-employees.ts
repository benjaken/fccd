import { supabase } from "@/lib/supabase";

export const COMPANY_EMPLOYEE_PAGE_SIZE = 20;

export type CompanyEmployee = {
  id: string;
  sourceStaffId: number;
  displayName: string | null;
  chineseName: string | null;
  workEmail: string | null;
  privateEmail: string | null;
  companyPhone: string | null;
  privatePhone: string | null;
  company: string | null;
  teamName: string | null;
  position: string | null;
  isActive: boolean;
  linkedUserId: string | null;
  lastSyncedAt: string;
};

type CompanyEmployeeRow = {
  id: string;
  source_staff_id: number;
  display_name: string | null;
  chinese_name: string | null;
  work_email: string | null;
  private_email: string | null;
  company_phone: string | null;
  private_phone: string | null;
  company: string | null;
  team_name: string | null;
  position: string | null;
  is_active: boolean;
  linked_user_id: string | null;
  last_synced_at: string;
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@._+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchCompanyEmployees({
  page,
  search,
  status = "active",
}: {
  page: number;
  search: string;
  status?: "active" | "inactive" | "all";
}) {
  const start = (page - 1) * COMPANY_EMPLOYEE_PAGE_SIZE;
  const end = start + COMPANY_EMPLOYEE_PAGE_SIZE - 1;
  let query = supabase
    .from("company_employees")
    .select(
      "id,source_staff_id,display_name,chinese_name,work_email,private_email,company_phone,private_phone,company,team_name,position,is_active,linked_user_id,last_synced_at",
      { count: "exact" },
    )
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("source_staff_id", { ascending: true })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `display_name.ilike.%${term}%,chinese_name.ilike.%${term}%,work_email.ilike.%${term}%,private_email.ilike.%${term}%,company_phone.ilike.%${term}%,private_phone.ilike.%${term}%,company.ilike.%${term}%,team_name.ilike.%${term}%,position.ilike.%${term}%`,
    );
  }
  if (status !== "all") query = query.eq("is_active", status === "active");

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    total: count ?? 0,
    items: ((data ?? []) as CompanyEmployeeRow[]).map((row) => ({
      id: row.id,
      sourceStaffId: row.source_staff_id,
      displayName: row.display_name,
      chineseName: row.chinese_name,
      workEmail: row.work_email,
      privateEmail: row.private_email,
      companyPhone: row.company_phone,
      privatePhone: row.private_phone,
      company: row.company,
      teamName: row.team_name,
      position: row.position,
      isActive: row.is_active,
      linkedUserId: row.linked_user_id,
      lastSyncedAt: row.last_synced_at,
    })) satisfies CompanyEmployee[],
  };
}

export async function inviteCompanyEmployee(employeeId: string) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("missing_authorization");

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: {
      action: "inviteEmployee",
      employeeId,
      redirectTo: `${window.location.origin}/reset-password`,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as { user: { id: string; email: string } };
}
