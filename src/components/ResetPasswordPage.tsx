import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import { isValidPassword } from "@/lib/settings";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const {
    session,
    loading,
    configured,
    updateRecoveredPassword,
    signOut,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!isValidPassword(password)) {
      setError(t("auth.newPasswordInvalid"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    const result = await updateRecoveredPassword(password);
    if (!result) {
      setComplete(true);
      await signOut();
    } else {
      setError(t("auth.passwordUpdateError"));
    }
    setSubmitting(false);
  };

  const invalidLink = !loading && !session && !complete;

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-glow login-brand-glow-one" />
        <div className="login-brand-glow login-brand-glow-two" />
        <div className="login-brand-content">
          <Link className="login-brand" to="/" aria-label={t("brand.fullName")}>
            <img
              className="login-brand-logo"
              src={FOOD_CHANNEL_CATERING_LOGO_PATH}
              alt=""
              aria-hidden="true"
            />
          </Link>
          <div className="login-message">
            <span className="login-kicker"><ShieldCheck />{t("auth.secureAccess")}</span>
            <h1>{t("auth.createPasswordTitle")}</h1>
            <p>{t("auth.createPasswordDescription")}</p>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <span className="eyebrow">{t("auth.eyebrow")}</span>
          <h2>{t("auth.createPasswordTitle")}</h2>

          {loading ? (
            <div className="auth-message" role="status">{t("auth.validatingLink")}</div>
          ) : complete ? (
            <div className="login-form">
              <div className="auth-message auth-success" role="status">
                <CheckCircle2 />
                <span>{t("auth.passwordUpdated")}</span>
              </div>
              <Button className="login-submit" asChild>
                <Link to="/">{t("auth.backToSignIn")}</Link>
              </Button>
            </div>
          ) : invalidLink ? (
            <div className="login-form">
              <div className="auth-message auth-error" role="alert">
                <LockKeyhole />
                <span>{t("auth.invalidResetLink")}</span>
              </div>
              <Button className="login-submit" asChild>
                <Link to="/">{t("auth.requestNewLink")}</Link>
              </Button>
            </div>
          ) : (
            <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
              <label className="form-field">
                <span>{t("auth.newPassword")}</span>
                <span className="password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={submitting || !configured}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </label>
              <label className="form-field">
                <span>{t("auth.confirmNewPassword")}</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={submitting || !configured}
                />
              </label>
              {error ? (
                <div className="auth-message auth-error" role="alert">
                  <LockKeyhole /><span>{error}</span>
                </div>
              ) : null}
              <Button className="login-submit" type="submit" disabled={submitting || !configured}>
                {submitting ? t("auth.updatingPassword") : t("auth.setPassword")}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
