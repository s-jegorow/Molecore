import logging
import os
import time as _time
from typing import Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

KEYCLOAK_URL = os.environ["KEYCLOAK_SERVER_URL"]
REALM = os.environ["KEYCLOAK_REALM"]
CLIENT_ID = os.environ["KEYCLOAK_CLIENT_ID"]

security = HTTPBearer()

_jwks_cache: Optional[dict] = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600
_JWKS_MIN_REFRESH_INTERVAL = 30


def get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache, _jwks_cache_time
    now = _time.time()
    if _jwks_cache is not None:
        age = now - _jwks_cache_time
        if not force_refresh and age < _JWKS_TTL:
            return _jwks_cache
        if force_refresh and age < _JWKS_MIN_REFRESH_INTERVAL:
            return _jwks_cache

    url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs"
    try:
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        return _jwks_cache
    except Exception as e:
        logger.error("JWKS fetch error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )


def _find_key(jwks: dict, kid: Optional[str]) -> Optional[dict]:
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            return k
    return None


def get_public_key_for_token(token: str):
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    key = _find_key(get_jwks(), kid)
    if not key:
        # unknown kid, probably key rotation -> refetch jwks once
        key = _find_key(get_jwks(force_refresh=True), kid)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return jwt.PyJWK(key, algorithm="RS256").key


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    token = credentials.credentials
    public_key = get_public_key_for_token(token)

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False, "require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # keycloak puts the client in azp, not aud
    if payload.get("azp") != CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


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
