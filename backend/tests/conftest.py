import io
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import pytest

_tmp = tempfile.mkdtemp(prefix="molecore-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ.setdefault("KEYCLOAK_SERVER_URL", "http://keycloak.invalid")
os.environ.setdefault("KEYCLOAK_REALM", "test")
os.environ.setdefault("KEYCLOAK_CLIENT_ID", "molecore")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import main
from auth import get_current_user
from database import Base, engine


class _User:
    current = "user-a"


def _fake_user():
    return {"user_id": _User.current, "username": _User.current, "roles": []}


main.app.dependency_overrides[get_current_user] = _fake_user


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    shutil.rmtree(os.environ["UPLOAD_DIR"], ignore_errors=True)
    os.makedirs(os.environ["UPLOAD_DIR"])
    with TestClient(main.app) as c:
        _User.current = "user-a"
        yield c


@pytest.fixture()
def as_user():
    def _switch(user_id: str):
        _User.current = user_id
    yield _switch
    _User.current = "user-a"


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64


def make_zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()
