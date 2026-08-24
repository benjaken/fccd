-- Allow monthly expense editors to remove a restaurant-month record.
create policy "Monthly expense input deletes"
  on public.restaurant_monthly_costs for delete to authenticated
  using (private.has_page_access('restaurant.monthly_expenses.edit'));
