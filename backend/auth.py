from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import os
from typing import Optional, Dict
from functools import lru_cache

# Keycloak configuration from environment variables
KEYCLOAK_URL = os.getenv("KEYCLOAK_SERVER_URL")
REALM = os.getenv("KEYCLOAK_REALM")
CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID")

# Validate required environment variables
if not KEYCLOAK_URL:
    raise ValueError("KEYCLOAK_SERVER_URL environment variable is required")
if not REALM:
    raise ValueError("KEYCLOAK_REALM environment variable is required")
if not CLIENT_ID:
    raise ValueError("KEYCLOAK_CLIENT_ID environment variable is required")

security = HTTPBearer()

@lru_cache()
def get_jwks() -> dict:
    url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs"

    try:
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not fetch Keycloak JWKS: {str(e)}"
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
            raise Exception(f"No key found with kid: {kid}")

        from jose.backends import RSAKey
        rsa_key = RSAKey(key, algorithm='RS256')
        return rsa_key.to_pem().decode('utf-8')

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not get public key: {str(e)}"
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

