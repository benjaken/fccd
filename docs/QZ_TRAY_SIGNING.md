# QZ Tray signing deployment

The browser integration is implemented in `src/lib/qz-tray.ts`. It loads the
public QZ certificate from `/qz/digital-certificate.txt` and sends every QZ
payload to the authenticated `qz-sign` Supabase Edge Function for SHA-512 RSA
signing.

## Required Supabase deployment

The private key must remain a Supabase secret. Never copy it into `src`,
`public`, an environment variable prefixed with `VITE_`, or Git.

From an authenticated Supabase CLI session, run:

```powershell
npx supabase secrets set --project-ref vignxasvlxqnyvuhtjlu --env-file .qz-secrets.env
npx supabase functions deploy qz-sign --project-ref vignxasvlxqnyvuhtjlu
```

Create `.qz-secrets.env` outside Git with this single variable, preserving the
PEM line breaks:

```dotenv
QZ_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Alternatively, add `QZ_PRIVATE_KEY` in the Supabase Dashboard under Edge
Function Secrets, then deploy `supabase/functions/qz-sign`.

## Development certificate limitation

The committed certificate is a QZ Tray Demo Cert. It is trusted only by the
computer that generated and installed the matching demo root. Replace it with
the production `digital-certificate.txt` before deploying to other computers,
and replace the `QZ_PRIVATE_KEY` secret with its matching private key.
