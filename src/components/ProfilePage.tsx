import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BellRing,
  CalendarClock,
  Hash,
  IdCard,
  Mail,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

function ProfileField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="profile-field">
      <span className="profile-field-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{children}</strong>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const {
    user,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth();
  const notSet = t("common.notSet");

  const formatDate = (value: string | null | undefined) => {
    if (!value) return notSet;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Hong_Kong",
    }).format(new Date(value));
  };

  const displayName =
    profile?.user_name || user?.email?.split("@")[0] || notSet;
  const avatar = displayName.slice(0, 2).toUpperCase();
  const socialNetworks =
    profile?.social_networks &&
    Object.keys(profile.social_networks).length > 0
      ? JSON.stringify(profile.social_networks, null, 2)
      : notSet;

  return (
    <section className="profile-page">
      <header className="page-heading profile-heading">
        <div>
          <span className="eyebrow">{t("profile.eyebrow")}</span>
          <h1>{t("profile.title")}</h1>
          <p>{t("profile.description")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void refreshProfile()}
          disabled={profileLoading}
        >
          <RefreshCw className={profileLoading ? "spin" : undefined} />
          {t("profile.refresh")}
        </Button>
      </header>

      <article className="profile-summary">
        <span className="profile-avatar">{avatar}</span>
        <div>
          <h2>{displayName}</h2>
          <p>{profile?.email || user?.email || notSet}</p>
        </div>
        <span className="profile-role">
          <ShieldCheck />
          {profile?.role || notSet}
        </span>
      </article>

      {profileLoading && !profile && (
        <div className="profile-state" role="status">
          <RefreshCw className="spin" />
          <span>{t("profile.loading")}</span>
        </div>
      )}

      {profileError && !profileLoading && (
        <div className="profile-state profile-state-error" role="alert">
          <ShieldCheck />
          <span>{t("profile.loadError")}</span>
        </div>
      )}

      {profile && (
        <div className="profile-grid">
          <article className="profile-card">
            <header>
              <UserRound />
              <h2>{t("profile.identity")}</h2>
            </header>
            <div className="profile-fields">
              <ProfileField icon={<UserRound />} label={t("profile.userName")}>
                {profile.user_name || notSet}
              </ProfileField>
              <ProfileField icon={<Mail />} label={t("profile.email")}>
                {profile.email || user?.email || notSet}
              </ProfileField>
              <ProfileField icon={<ShieldCheck />} label={t("profile.role")}>
                {profile.role || notSet}
              </ProfileField>
              <ProfileField icon={<Store />} label={t("profile.shopRestro")}>
                {profile.shop_restro_legacy_id || notSet}
              </ProfileField>
            </div>
          </article>

          <article className="profile-card">
            <header>
              <BellRing />
              <h2>{t("profile.preferences")}</h2>
            </header>
            <div className="profile-fields">
              <ProfileField icon={<BellRing />} label={t("profile.emailNoti")}>
                {profile.email_noti
                  ? t("profile.enabled")
                  : t("profile.disabled")}
              </ProfileField>
              <ProfileField
                icon={<CalendarClock />}
                label={t("profile.factoryPanelDate")}
              >
                {formatDate(profile.factory_panel_date)}
              </ProfileField>
              <ProfileField icon={<CalendarClock />} label={t("profile.week")}>
                {profile.week || notSet}
              </ProfileField>
              <ProfileField
                icon={<CalendarClock />}
                label={t("profile.weekPlus1")}
              >
                {profile.week_plus_1 || notSet}
              </ProfileField>
              <ProfileField
                icon={<CalendarClock />}
                label={t("profile.weekPlus2")}
              >
                {profile.week_plus_2 || notSet}
              </ProfileField>
            </div>
          </article>

          <article className="profile-card profile-card-wide">
            <header>
              <IdCard />
              <h2>{t("profile.legacy")}</h2>
            </header>
            <div className="profile-fields profile-fields-wide">
              <ProfileField icon={<Hash />} label={t("profile.authId")}>
                {profile.id}
              </ProfileField>
              <ProfileField icon={<Hash />} label={t("profile.legacyId")}>
                {profile.legacy_id || notSet}
              </ProfileField>
              <ProfileField icon={<Hash />} label={t("profile.slug")}>
                {profile.slug || notSet}
              </ProfileField>
              <ProfileField icon={<CalendarClock />} label={t("profile.createdAt")}>
                {formatDate(profile.created_at)}
              </ProfileField>
              <ProfileField icon={<CalendarClock />} label={t("profile.updatedAt")}>
                {formatDate(profile.updated_at)}
              </ProfileField>
              <ProfileField icon={<IdCard />} label={t("profile.socialNetworks")}>
                <code>{socialNetworks}</code>
              </ProfileField>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
