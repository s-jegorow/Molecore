from database import engine, SessionLocal, Base
from models import User

# Tabellen erstellen
Base.metadata.create_all(bind=engine)

# Demo User erstellen
db = SessionLocal()

# Prüfen ob User schon existiert
existing_user = db.query(User).filter(User.id == 1).first()

if not existing_user:
    demo_user = User(id=1, username="demo")
    db.add(demo_user)
    db.commit()
    print("Demo user created!")
else:
    print("Demo user already exists")

db.close()
