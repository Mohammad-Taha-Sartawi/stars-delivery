# Security Hardening

This document summarizes the controls added to the Stars Delivery backend and
mobile app. It is an implementation guide, not a substitute for a periodic
security review.

## Ad image uploads

- Image upload exists only in the administrator ads page. The customer and
  driver apps do not upload order photos or driver-license photos.
- Only JPEG, PNG, GIF, and WebP files are accepted. The file signature is read
  from disk; the client-supplied MIME type is not trusted.
- Uploaded files are renamed to a random UUID and a safe extension. The original
  filename is never used.
- Active content such as HTML, SVG, and scripts is rejected.
- `/uploads` only serves known image extensions and sends:
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; sandbox`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Resource-Policy: same-site`
- Ad images are removed when the administrator deletes the ad or replaces its
  images.

## Customer contact data

- `new_order` socket broadcasts contain `phoneMasked` only. The full customer
  phone is never sent to nearby drivers before an offer is accepted.
- Providers receive the full phone only through the existing authorised order
  flow.

## Rate limiting and input bounds

Per-user and per-IP limits protect:

- order creation and resend
- offer submission
- support chat messages
- reports
- provider location updates
- push-token registration

Order descriptions, phones, locations, chat messages, report content, and admin
broadcasts have explicit maximum lengths.

## Administrator security

- Every administrator request is revalidated against the database:
  - account must still exist, be active, and have role `admin`
  - the session version must match the database version
- Password resets, 2FA changes, and logout invalidate other admin sessions and
  disconnect administrator support sockets.
- Login failures are rate-limited per IP and per account.
- Administrator login supports optional TOTP 2FA, with one-time recovery codes.
  Enable it from **Settings → Two-factor authentication**.
- Sensitive admin mutations are written to the `adminauditlogs` collection
  (actor, method, path, status, IP, user agent, parameter names, and body keys;
  secret values are not stored). Audit entries expire after 180 days.

## Provider location

- Latitude and longitude must be finite and within valid ranges.
- Production rejects mocked locations by default. Set
  `ALLOW_MOCK_LOCATION=true` only for emulator/QA environments.
- Impossible location jumps are rejected using a generous speed threshold.
- The mock-location signal is stored for auditing.

## Mobile sessions

- Logout increments the account session version on the server and disconnects
  the account's sockets. A copied token cannot be reused after logout.
- Password and email changes already rotate the session version.
- Tokens remain short-lived mobile JWTs and are stored with
  `flutter_secure_storage`.

## Deployment checklist

1. Set `NODE_ENV=production`.
2. Serve the API and admin dashboard over HTTPS through a trusted reverse
   proxy. The production session cookie is `Secure`.
3. Replace all example secrets with unique random values of at least 32
   characters.
4. Enable two-factor authentication for every administrator.
5. Keep MongoDB private; do not expose it to the public internet.
6. Persist and back up `uploads/` and the private provider-document directory.
7. Monitor disk usage and the `adminauditlogs` collection.
8. Run `npm audit --omit=dev` regularly and review transitive advisories.
9. Rebuild the mobile app with `STARS_SERVER_URL` pointing to the HTTPS origin.

## Remaining residual risks

- GPS coordinates originate from the device. Server-side range, mock-location,
  and jump checks reduce abuse but cannot prove physical location.
- Ad images use random filenames and safe response headers. For stronger
  privacy, move them behind authenticated signed URLs or private object storage.
- Existing order images uploaded before the feature removal remain on disk for
  legacy records; no new order or provider-license images are accepted.
- Firebase Cloud Messaging remains disabled until project credentials are
  configured.
- Some `firebase-admin` transitive dependencies still report moderate npm
  advisories. Push delivery is disabled by default, so the practical exposure is
  limited until Firebase is enabled.
