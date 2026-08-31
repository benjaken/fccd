export type NotificationChannelRequestOptions<WatiResult, EmailResult> = {
  watiEnabled: boolean;
  emailEnabled: boolean;
  sendWati: () => Promise<WatiResult>;
  sendEmail: () => Promise<EmailResult>;
};

export async function settleEnabledNotificationRequests<WatiResult, EmailResult>({
  watiEnabled,
  emailEnabled,
  sendWati,
  sendEmail,
}: NotificationChannelRequestOptions<WatiResult, EmailResult>) {
  return Promise.allSettled([
    watiEnabled ? sendWati() : Promise.resolve(null),
    emailEnabled ? sendEmail() : Promise.resolve(null),
  ]);
}
