# Swifora

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.


## Production backup and restore

Swifora has three persistent application-data surfaces:

1. the MongoDB database;
2. private provider-verification files in `PROVIDER_DOCUMENTS_DIR`;
3. order-upload files in `swifora_backend/uploads`.

A valid application backup must contain all three.

MongoDB Database Tools (`mongodump` and `mongorestore`) must be installed on the production operations host. Backup output must be written to an absolute directory outside the Git repository and should then be copied to protected off-host storage.

### Backup

Stop or otherwise quiesce application writes before taking a backup so MongoDB metadata and filesystem files represent the same operational point.

From `swifora_backend`:

```bash
export SWIFORA_BACKUP_ROOT="/absolute/protected/backup/root"
export SWIFORA_BACKUP_QUIESCED="SWIFORA_BACKUP_WRITES_QUIESCED"
npm run ops:backup
```

The command uses the configured `MONGODB_URI` and `PROVIDER_DOCUMENTS_DIR`. It creates a timestamped directory containing:

- `mongo.archive.gz`
- `provider-documents/`
- `uploads/`
- `manifest.json`

The manifest contains SHA-256 integrity information but never stores the MongoDB URI or application secrets.

### Restore

Restores are destructive. Stop the application first and verify that the selected backup is the intended recovery point.

Set `SWIFORA_RESTORE_FROM` to the timestamped backup directory:

```bash
export SWIFORA_RESTORE_FROM="/absolute/protected/backup/root/swifora-backup-YYYYMMDDTHHMMSSZ"
export SWIFORA_RESTORE_CONFIRM="RESTORE_SWIFORA_DATA"
npm run ops:restore
```

Before invoking `mongorestore`, the restore command verifies the Mongo archive and filesystem contents against `manifest.json`. MongoDB is restored with `--drop`; provider documents and order uploads are then replaced from the verified backup.

Do not store production backup directories, MongoDB credentials, `.env` files, or provider documents in Git.
