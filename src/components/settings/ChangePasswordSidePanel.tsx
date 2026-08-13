import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SettingsSidePanel } from "@/components/settings/SettingsSidePanel";
import {
  isValidPassword,
  updateManagedUserPassword,
  type UserListItem,
} from "@/lib/settings";

export function ChangePasswordSidePanel({
  user,
  open,
  onClose,
  onUpdated,
  updatePassword = updateManagedUserPassword,
}: {
  user: UserListItem | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  updatePassword?: typeof updateManagedUserPassword;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const closeAndReset = () => {
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setFieldErrors({});
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const next: Record<string, string> = {};
    if (!isValidPassword(password)) {
      next.password = t("settings.users.validation.passwordInvalid");
    }
    if (password !== confirmPassword) {
      next.confirmPassword = t("settings.users.validation.passwordMismatch");
    }
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setError(null);
    try {
      await updatePassword(user.id, password);
      setPassword("");
      setConfirmPassword("");
      onUpdated?.();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "password_update_failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SettingsSidePanel
      open={open && Boolean(user)}
      title={t("settings.users.changePasswordTitle")}
      description={t("settings.users.changePasswordDescription", {
        name: user?.userName || user?.email || "",
      })}
      onClose={closeAndReset}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("settings.users.cancel")}
          </Button>
          <Button
            type="submit"
            form="change-password-form"
            disabled={submitting || !user}
          >
            {submitting
              ? t("settings.users.savingPassword")
              : t("settings.users.savePassword")}
          </Button>
        </>
      }
    >
      <form
        id="change-password-form"
        className="settings-side-form"
        onSubmit={submit}
      >
        <label>
          <span>{t("settings.users.fields.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password ? <em>{fieldErrors.password}</em> : null}
        </label>
        <label>
          <span>{t("settings.users.fields.confirmPassword")}</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword ? (
            <em>{fieldErrors.confirmPassword}</em>
          ) : null}
        </label>
        {error ? (
          <div className="settings-side-form-error" role="alert">
            {t(`settings.users.errors.${error}`, {
              defaultValue: t("settings.users.errors.password_update_failed"),
            })}
          </div>
        ) : null}
      </form>
    </SettingsSidePanel>
  );
}
