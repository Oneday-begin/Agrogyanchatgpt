"""Salted password hashes, retaining legacy verification for migration on login."""
import hashlib
import hmac
import secrets


def hash_password(password):
    import bcrypt
    return "bcrypt_sha256$" + bcrypt.hashpw(hashlib.sha256(password.encode()).hexdigest().encode(), bcrypt.gensalt()).decode()


def verify_password(password, stored):
    try:
        if stored.startswith("bcrypt_sha256$"):
            import bcrypt
            return bcrypt.checkpw(hashlib.sha256(password.encode()).hexdigest().encode(), stored[len("bcrypt_sha256$"):].encode())
        if stored.startswith(("$2b$", "$2a$")):
            import bcrypt
            return bcrypt.checkpw(password.encode(), stored.encode())
        if stored.startswith("pbkdf2_sha256$"):
            _, rounds, salt, expected = stored.split("$")
            rounds = int(rounds)
            if not 100_000 <= rounds <= 2_000_000:
                return False
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), rounds).hex()
            return hmac.compare_digest(actual, expected)
        return hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), stored)
    except (ValueError, TypeError, AttributeError):
        return False
