import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SettingsSidePanel } from "@/components/settings/SettingsSidePanel";
import {
  isValidPhone,
  SYSTEM_ROLES,
  updateManagedUserProfile,
  type SystemRole,
  type UserListItem,
} from "@/lib/settings";

export function EditUserSidePanel({
  user,
  open,
  onClose,
  onUpdated,
  updateProfile = updateManagedUserProfile,
}: {
  user: UserListItem | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  updateProfile?: typeof updateManagedUserProfile;
}) {
  const { t } = useTranslation();
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState<SystemRole>("Admin");
  const [phone, setPhone] = useState("");
  const [shopRestroLegacyId, setShopRestroLegacyId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !open) return;
    setUserName(user.userName ?? "");
    setRole(
      SYSTEM_ROLES.includes(user.role as SystemRole)
        ? (user.role as SystemRole)
        : "Admin",
    );
    setPhone(user.phone ?? "");
    setShopRestroLegacyId(user.shopRestroLegacyId ?? "");
    setError(null);
    setFieldErrors({});
  }, [open, user]);

  const closeAndReset = () => {
    setError(null);
    setFieldErrors({});
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const next: Record<string, string> = {};
    if (!userName.trim()) {
      next.userName = t("settings.users.validation.userNameRequired");
    }
    if (!isValidPhone(phone)) {
      next.phone = t("settings.users.validation.phoneInvalid");
    }
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateProfile({
        userId: user.id,
        userName: userName.trim(),
        role,
        phone: phone.trim(),
        shopRestroLegacyId: shopRestroLegacyId.trim(),
      });
      onUpdated?.();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "profile_update_failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SettingsSidePanel
      open={open && Boolean(user)}
      title={t("settings.users.editTitle")}
      description={t("settings.users.editDescription", {
        email: user?.email || "",
      })}
      onClose={closeAndReset}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("settings.users.cancel")}
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            disabled={submitting || !user}
          >
            {submitting
              ? t("settings.users.savingProfile")
              : t("settings.users.saveProfile")}
          </Button>
        </>
      }
    >
      <form id="edit-user-form" className="settings-side-form" onSubmit={submit}>
        <label>
          <span>{t("settings.users.fields.userName")}</span>
          <input
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            autoComplete="name"
          />
          {fieldErrors.userName ? <em>{fieldErrors.userName}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.role")}</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as SystemRole)}
          >
            {SYSTEM_ROLES.map((systemRole) => (
              <option key={systemRole} value={systemRole}>
                {systemRole}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("settings.users.fields.phone")}</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder={t("settings.users.fields.phonePlaceholder")}
          />
          {fieldErrors.phone ? <em>{fieldErrors.phone}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.restaurant")}</span>
          <input
            value={shopRestroLegacyId}
            onChange={(event) => setShopRestroLegacyId(event.target.value)}
          />
        </label>
        {error ? (
          <div className="settings-side-form-error" role="alert">
            {t(`settings.users.errors.${error}`, {
              defaultValue: t("settings.users.errors.profile_update_failed"),
            })}
          </div>
        ) : null}
      </form>
    </SettingsSidePanel>
  );
}
