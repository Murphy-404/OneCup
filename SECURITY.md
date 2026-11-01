# Security

This is a single-user self-hosted instance without accounts. Every device allowed to reach it can read and modify the same workspace. Keep the default loopback binding; for remote use, restrict network access or add authentication at an HTTPS reverse proxy. Host and Origin checks are not authentication.

Private records are transmitted to and stored by your own server. Keep the SQLite data directory outside the public static directory. Protect database and backup files; copy backups off-host and never attach them to public issues. Do not publish configuration or credentials.

Report security issues privately through GitHub's security reporting feature if available. Do not post secrets or real records. Normal bug reports belong in Issues with synthetic examples.
