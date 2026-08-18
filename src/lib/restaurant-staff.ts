import { supabase } from "@/lib/supabase";

export const RESTAURANT_STAFF_PAGE_SIZE = 15;
export type RestaurantStaff = { id: string; name: string; phone: string | null; restaurantId: string | null; restaurantName: string | null; department: string | null; employmentType: string | null; isActive: boolean };
export type RestaurantOption = { id: string; name: string };

function map(row: Record<string, unknown>): RestaurantStaff {
  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
  return { id: row.id as string, name: row.display_name as string, phone: row.phone as string | null, restaurantId: row.restaurant_id as string | null, restaurantName: (restaurant as { name?: string } | null)?.name ?? null, department: row.department as string | null, employmentType: row.employment_type as string | null, isActive: Boolean(row.is_active) };
}

export async function fetchRestaurantStaff({ page, search }: { page: number; search: string }) {
  const start = (page - 1) * RESTAURANT_STAFF_PAGE_SIZE;
  let query = supabase.from("restaurant_staff").select("id,display_name,phone,restaurant_id,department,employment_type,is_active,restaurants(name)", { count: "exact" }).is("archived_at", null).order("display_name").range(start, start + RESTAURANT_STAFF_PAGE_SIZE - 1);
  if (search.trim()) query = query.ilike("display_name", `%${search.trim()}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { items: (data ?? []).map((row) => map(row as Record<string, unknown>)), total: count ?? 0 };
}

export async function fetchRestaurantOptions(): Promise<RestaurantOption[]> {
  const { data, error } = await supabase.from("restaurants").select("id,name").order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
}

export async function createRestaurantStaff(input: Omit<RestaurantStaff, "id" | "restaurantName" | "isActive">) {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("restaurant_staff").insert({ legacy_id: `web-restaurant-staff-${crypto.randomUUID()}`, display_name: input.name.trim(), phone: input.phone || null, restaurant_id: input.restaurantId, department: input.department, employment_type: input.employmentType, is_active: true, bubble_created_at: now, bubble_modified_at: now }).select("id,display_name,phone,restaurant_id,department,employment_type,is_active,restaurants(name)").single();
  if (error) throw error;
  return map(data as Record<string, unknown>);
}
