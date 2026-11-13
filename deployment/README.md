# Swifora production deployment

This directory is the final production deployment contract for Swifora.

It does not contain production passwords, certificates, signing keys, MongoDB credentials, or other secrets.

## Migrating a server installed as "Stars Delivery"

The project was renamed to Swifora. Servers installed from the earlier
templates use `stars-delivery` names; nothing changes until you move them.
Stored data (MongoDB) is not affected. Take a backup first (see below).

1. Stop the old service: `sudo systemctl stop stars-delivery`.
2. Move the data and configuration directories:
   - `sudo mv /var/lib/stars-delivery /var/lib/swifora`
   - `sudo mv /etc/stars-delivery /etc/swifora`
   - `sudo mv /etc/swifora/stars-delivery.env /etc/swifora/swifora.env`
   - `sudo mv /opt/stars-delivery /opt/swifora`
3. In `/etc/swifora/swifora.env`, update paths that point at the old
   directories, especially `PROVIDER_DOCUMENTS_DIR=/var/lib/swifora/provider-documents`
   and `FIREBASE_SERVICE_ACCOUNT_PATH`.
4. Service user: either create `swifora` and `chown -R swifora:swifora`
   the moved directories, or keep the existing user by editing `User=` and
   `Group=` in the new unit file.
5. The application folder inside a release is now `swifora_backend`
   (was `stars_delivery_backend`); deploy a release built from this version.
6. Install the new unit and nginx site, then remove the old ones:
   - `sudo cp deployment/systemd/swifora.service /etc/systemd/system/`
   - `sudo systemctl disable stars-delivery && sudo rm /etc/systemd/system/stars-delivery.service`
   - replace the nginx site `stars-delivery.conf` with `deployment/nginx/swifora.conf`
   - `sudo systemctl daemon-reload && sudo systemctl enable --now swifora && sudo nginx -t && sudo systemctl reload nginx`
7. Admins sign in again once (the session cookie is now `swifora_admin.sid`).

Old environment names are still accepted: `STARS_SERVER_URL` at app build
time, and `STARS_BACKUP_*` / `STARS_RESTORE_*` for backup and restore.

## Production topology

The supported minimal topology is:

Internet -> HTTPS Nginx -> Node.js backend -> MongoDB

Nginx is the single trusted TLS-terminating reverse-proxy hop expected by the application.

The Node backend listens on port 3000 and systemd supervises the process.

## Host prerequisites

Install and verify:

- Linux with systemd;
- Nginx;
- Node.js 24.13.1, matching the CI production baseline;
- npm;
- MongoDB Database Tools providing `mongodump` and `mongorestore`;
- a valid TLS certificate for the API hostname.

The production host must expose ports 80 and 443 publicly.

Port 3000 should not be exposed publicly.

## Service account and persistent storage

Create a dedicated non-login service user named `swifora`.

Create persistent paths owned by that account:

- `/var/lib/swifora/uploads`
- `/var/lib/swifora/provider-documents`

Create the private configuration directory:

- `/etc/swifora`

The real environment file must be installed as:

- `/etc/swifora/swifora.env`

Restrict it so it is not world-readable.

## Application installation

Deploy an approved Git commit beneath:

`/opt/swifora/releases/<commit-sha>`

Point:

`/opt/swifora/current`

to the approved release.

From the backend directory install production dependencies with:

`npm ci --omit=dev`

The application currently writes order upload files to the relative backend `uploads` path.

For persistent deployments, make:

`swifora_backend/uploads`

point to:

`/var/lib/swifora/uploads`

using an operating-system symlink.

If migrating an existing deployment, copy existing upload data into the persistent directory before replacing the old path.

Provider verification documents use:

`PROVIDER_DOCUMENTS_DIR=/var/lib/swifora/provider-documents`

and must never be placed under the public uploads or `src/public` directories.

## Production environment

Copy:

`deployment/swifora.env.example`

to:

`/etc/swifora/swifora.env`

and supply the real deployment values.

Required production values include:

- `NODE_ENV=production`
- `PORT=3000`
- `MONGODB_URI`
- `JWT_SECRET`
- `SESSION_SECRET`
- `PASSWORD_RECOVERY_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_FROM`
- `PROVIDER_DOCUMENTS_DIR`

`SMTP_USER` and `SMTP_PASS` must either both be supplied or both be omitted when a trusted SMTP relay is used.

`JWT_SECRET`, `SESSION_SECRET`, and `PASSWORD_RECOVERY_SECRET` must be distinct strong secrets.

Do not commit the real environment file.

## systemd installation

Install:

`deployment/systemd/swifora.service`

as:

`/etc/systemd/system/swifora.service`

Verify `/usr/bin/node` is the intended Node.js 24.13.1 executable.

Then reload systemd and enable the service.

Operational commands:

`sudo systemctl daemon-reload`

`sudo systemctl enable --now swifora`

`sudo systemctl status swifora`

`sudo journalctl -u swifora`

The application handles SIGTERM and systemd uses SIGTERM for controlled shutdown.

## Nginx and TLS

Copy:

`deployment/nginx/swifora.conf`

into the appropriate Nginx server configuration location.

Before enabling it:

1. replace every `api.example.com` occurrence with the real API hostname;
2. set valid TLS certificate and private-key paths;
3. confirm the backend service is listening on local port 3000;
4. ensure no second reverse proxy exists between Nginx and Node unless the application trust-proxy configuration is deliberately redesigned.

The supplied Nginx configuration:

- redirects HTTP to HTTPS;
- terminates TLS;
- permits TLS 1.2 and TLS 1.3;
- applies HSTS;
- forwards client/protocol headers;
- supports Socket.IO/WebSocket upgrades;
- proxies only to `127.0.0.1:3000`.

Validate Nginx before reload:

`sudo nginx -t`

Then reload:

`sudo systemctl reload nginx`

## Health verification

After MongoDB and the backend are available, verify:

`https://api.example.com/api/health`

Expected healthy response:

`{"status":"ok"}`

A MongoDB-disconnected backend returns HTTP 503.

Do not declare deployment healthy until the HTTPS health endpoint succeeds.

## SMTP verification

Configure a real SMTP provider before launch.

The application supports:

- direct TLS on port 465 with `SMTP_SECURE=true`;
- STARTTLS-style configuration such as port 587 with `SMTP_SECURE=false`.

For STARTTLS configuration the application requires TLS and verifies the server certificate.

Before public launch, exercise the password-recovery flow with a controlled test account and confirm delivery of the recovery message.

Do not store SMTP credentials in Git.

## Backup and restore

MongoDB Database Tools must be installed on the operations host.

The promoted application commands are:

`npm run ops:backup`

and:

`npm run ops:restore`

The backup covers:

- MongoDB;
- provider documents;
- order uploads.

Follow the backup/restore procedure in the root README.

Store production backups outside the Git repository and copy them to protected off-host storage.

## Android production release

Production/profile Flutter builds require an HTTPS endpoint at compile time.

Build using the real production origin, for example:

`flutter build appbundle --release --dart-define=SWIFORA_SERVER_URL=https://api.example.com`

Before the release build, install the permanent Android signing material outside Git and configure:

`android/key.properties`

with:

- `storePassword`
- `keyPassword`
- `keyAlias`
- `storeFile`

The build fails closed when valid release signing configuration is absent.

Never commit the keystore or `key.properties`.

Before each store release, update the Flutter application version in `pubspec.yaml` as appropriate.

## Final launch checklist

Launch only when all of the following are true:

- approved Git SHA deployed;
- CI is green on that SHA;
- Node.js 24.13.1 available;
- production npm dependencies installed;
- `NODE_ENV=production`;
- MongoDB reachable;
- strong distinct application secrets configured;
- SMTP configured and recovery delivery tested;
- provider-document persistent path configured;
- persistent order-upload path connected;
- MongoDB Database Tools installed;
- backup destination prepared off repository;
- systemd service active;
- Nginx configuration passes `nginx -t`;
- TLS certificate is valid;
- HTTPS health endpoint returns HTTP 200;
- Android production build uses the HTTPS production endpoint;
- permanent Android signing material is installed outside Git.

Once these checks pass, no additional STARS-022 development phase is required.
