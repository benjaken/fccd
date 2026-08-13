import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { RestaurantSelect } from "@/components/settings/RestaurantSelect";
import { SettingsSidePanel } from "@/components/settings/SettingsSidePanel";
import {
  createManagedUser,
  fetchRestaurantOptions,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  SYSTEM_ROLES,
  type CreateUserInput,
  type SystemRole,
} from "@/lib/settings";

const initialForm = {
  userName: "",
  email: "",
  phone: "",
  role: "Admin" as SystemRole,
  shopRestroLegacyId: "",
  password: "",
  confirmPassword: "",
};

export function CreateUserSidePanel({
  open,
  onClose,
  onCreated,
  createUser = createManagedUser,
  loadRestaurants = fetchRestaurantOptions,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  createUser?: typeof createManagedUser;
  loadRestaurants?: typeof fetchRestaurantOptions;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const closeAndReset = () => {
    setForm(initialForm);
    setError(null);
    setFieldErrors({});
    onClose();
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.userName.trim()) {
      next.userName = t("settings.users.validation.userNameRequired");
    }
    if (!isValidEmail(form.email)) {
      next.email = t("settings.users.validation.emailInvalid");
    }
    if (!isValidPhone(form.phone)) {
      next.phone = t("settings.users.validation.phoneInvalid");
    }
    if (!isValidPassword(form.password)) {
      next.password = t("settings.users.validation.passwordInvalid");
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = t("settings.users.validation.passwordMismatch");
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateUserInput = {
        userName: form.userName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        shopRestroLegacyId: form.shopRestroLegacyId.trim(),
        password: form.password,
      };
      await createUser(payload);
      setForm(initialForm);
      onCreated();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "user_create_failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SettingsSidePanel
      open={open}
      title={t("settings.users.createTitle")}
      description={t("settings.users.createDescription")}
      onClose={closeAndReset}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("settings.users.cancel")}
          </Button>
          <Button type="submit" form="create-user-form" disabled={submitting}>
            {submitting
              ? t("settings.users.creating")
              : t("settings.users.createAction")}
          </Button>
        </>
      }
    >
      <form id="create-user-form" className="settings-side-form" onSubmit={submit}>
        <label>
          <span>{t("settings.users.fields.userName")}</span>
          <input
            value={form.userName}
            onChange={(event) =>
              setForm((current) => ({ ...current, userName: event.target.value }))
            }
            autoComplete="name"
          />
          {fieldErrors.userName ? <em>{fieldErrors.userName}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.email")}</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            autoComplete="email"
          />
          {fieldErrors.email ? <em>{fieldErrors.email}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.phone")}</span>
          <input
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
            autoComplete="tel"
            placeholder={t("settings.users.fields.phonePlaceholder")}
          />
          {fieldErrors.phone ? <em>{fieldErrors.phone}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.role")}</span>
          <select
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                role: event.target.value as SystemRole,
              }))
            }
          >
            {SYSTEM_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <RestaurantSelect
          value={form.shopRestroLegacyId}
          onChange={(shopRestroLegacyId) =>
            setForm((current) => ({ ...current, shopRestroLegacyId }))
          }
          loadRestaurants={loadRestaurants}
          disabled={submitting}
        />
        <label>
          <span>{t("settings.users.fields.password")}</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            autoComplete="new-password"
          />
          {fieldErrors.password ? <em>{fieldErrors.password}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.confirmPassword")}</span>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))
            }
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword ? (
            <em>{fieldErrors.confirmPassword}</em>
          ) : null}
        </label>
        <p className="settings-side-form-hint">
          {t("settings.users.createLoginHint")}
        </p>
        {error ? (
          <div className="settings-side-form-error" role="alert">
            {t(`settings.users.errors.${error}`, {
              defaultValue: t("settings.users.errors.user_create_failed"),
            })}
          </div>
        ) : null}
      </form>
    </SettingsSidePanel>
  );
}
