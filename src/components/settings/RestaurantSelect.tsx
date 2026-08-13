import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchRestaurantOptions,
  type RestaurantOption,
} from "@/lib/settings";

export function RestaurantSelect({
  value,
  onChange,
  loadRestaurants = fetchRestaurantOptions,
  disabled = false,
}: {
  value: string;
  onChange: (legacyId: string) => void;
  loadRestaurants?: typeof fetchRestaurantOptions;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<RestaurantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadRestaurants()
      .then((items) => {
        if (!active) return;
        setOptions(items);
      })
      .catch((loadError) => {
        if (!active) return;
        setOptions([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "restaurants_load_failed",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRestaurants]);

  const selectOptions = useMemo(() => {
    if (!value) return options;
    if (options.some((item) => item.legacyId === value)) return options;
    return [
      {
        legacyId: value,
        name: t("settings.users.fields.restaurantUnknown", { id: value }),
        isActive: false,
      },
      ...options,
    ];
  }, [options, t, value]);

  return (
    <label>
      <span>{t("settings.users.fields.restaurant")}</span>
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("settings.users.fields.restaurantNone")}</option>
        {selectOptions.map((restaurant) => (
          <option key={restaurant.legacyId} value={restaurant.legacyId}>
            {restaurant.name}
          </option>
        ))}
      </select>
      {loading ? (
        <em>{t("settings.users.fields.restaurantLoading")}</em>
      ) : null}
      {error ? (
        <em>{t("settings.users.fields.restaurantLoadError")}</em>
      ) : null}
    </label>
  );
}

export function restaurantLabel(
  legacyId: string | null | undefined,
  options: RestaurantOption[],
  fallback: string,
) {
  if (!legacyId) return fallback;
  return options.find((item) => item.legacyId === legacyId)?.name ?? legacyId;
}
