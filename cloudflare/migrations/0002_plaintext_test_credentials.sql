-- Temporary functional-validation credentials, never used by normal authentication.
ALTER TABLE users ADD COLUMN password_plaintext TEXT;
