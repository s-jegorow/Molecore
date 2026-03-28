from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import os
import time as _time
from typing import Optional, Dict

KEYCLOAK_URL = os.environ["KEYCLOAK_SERVER_URL"]
REALM = os.environ["KEYCLOAK_REALM"]
CLIENT_ID = os.environ["KEYCLOAK_CLIENT_ID"]

security = HTTPBearer()

_jwks_cache: Optional[dict] = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600  # refresh keys every hour

def get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache, _jwks_cache_time
    now = _time.time()
    if not force_refresh and _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache

    url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs"
    try:
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        return _jwks_cache
    except Exception as e:
        print(f"JWKS fetch error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )

def get_public_key_for_token(token: str) -> str:
    """Get the correct public key based on the token's kid (key ID)"""
    try:
        # Decode token header without verification to get kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        jwks = get_jwks()

        if "keys" not in jwks:
            raise Exception("No keys found in JWKS")

        # Find the key with matching kid
        key = None
        for k in jwks["keys"]:
            if k.get("kid") == kid:
                key = k
                break

        if not key:
            # Kid not found — may be a key rotation; try force-refreshing the cache
            jwks = get_jwks(force_refresh=True)
            for k in jwks["keys"]:
                if k.get("kid") == kid:
                    key = k
                    break

        if not key:
            raise Exception(f"No key found with kid: {kid}")

        from jose.backends import RSAKey
        rsa_key = RSAKey(key, algorithm='RS256')
        return rsa_key.to_pem().decode('utf-8')

    except Exception as e:
        print(f"Public key error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    token = credentials.credentials

    try:
        public_key = get_public_key_for_token(token)

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={
                "verify_signature": True,
                "verify_aud": False,
                "verify_exp": True,
            }
        )

        # Verify the token was issued for our client (Keycloak uses azp)
        azp = payload.get("azp")
        if azp != CLIENT_ID:
            raise JWTError("Token not issued for this client")

        return payload

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(token_payload: Dict = Depends(verify_token)) -> Dict:
    return {
        "user_id": token_payload.get("sub"),
        "username": token_payload.get("preferred_username"),
        "email": token_payload.get("email"),
        "name": token_payload.get("name"),
        "given_name": token_payload.get("given_name"),
        "family_name": token_payload.get("family_name"),
        "roles": token_payload.get("realm_access", {}).get("roles", []),
    }


def require_role(required_role: str):
    def role_checker(current_user: Dict = Depends(get_current_user)):
        if required_role not in current_user.get("roles", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role: {required_role}"
            )
        return current_user
    return role_checker

