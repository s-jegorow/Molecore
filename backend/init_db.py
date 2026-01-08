from database import engine, SessionLocal, Base
from models import User, Page
import json

def init_database():
    """Erstellt alle Tabellen und Demo-User"""

    # Tabellen erstellen
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    # Demo-User erstellen
    db = SessionLocal()

    # Checken ob User schon existiert
    user = db.query(User).filter(User.username == "sebastian").first()

    if not user:
        print("Creating user sebastian...")
        user = User(username="sebastian")
        db.add(user)
        db.commit()
        db.refresh(user)

        # Erste Page erstellen
        print("Creating first page...")
        first_page = Page(
            title="Welcome to nx",
            content=json.dumps({
                "time": 1704729600000,
                "blocks": [
                    {
                        "type": "header",
                        "data": {
                            "text": "Welcome to nx!",
                            "level": 1
                        }
                    },
                    {
                        "type": "paragraph",
                        "data": {
                            "text": "Start editing by typing <code>/</code> for commands."
                        }
                    }
                ],
                "version": "2.28.0"
            }),
            user_id=user.id
        )
        db.add(first_page)
        db.commit()

        print(f"✅ User 'sebastian' created with ID: {user.id}")
        print(f"✅ First page created with ID: {first_page.id}")
    else:
        print("User 'sebastian' already exists!")

    db.close()

if __name__ == "__main__":
    init_database()
