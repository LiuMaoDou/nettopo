from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./topo.db"
engine = create_engine(DATABASE_URL, echo=False)


def init_db() -> None:
    """Create all tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency that provides a database session."""
    with Session(engine) as session:
        yield session
