-- Store access now uses Firebase Auth exclusively.
UPDATE stores SET owner_password_hash = NULL WHERE owner_password_hash IS NOT NULL;
