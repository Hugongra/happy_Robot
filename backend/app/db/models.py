"""SQLAlchemy ORM models."""
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Load(Base):
    __tablename__ = "loads"

    load_id: Mapped[str] = mapped_column(String, primary_key=True)
    origin: Mapped[str] = mapped_column(String, index=True)
    destination: Mapped[str] = mapped_column(String, index=True)
    pickup_datetime: Mapped[str] = mapped_column(String)
    delivery_datetime: Mapped[str] = mapped_column(String)
    equipment_type: Mapped[str] = mapped_column(String, index=True)
    loadboard_rate: Mapped[float] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float)
    commodity_type: Mapped[str] = mapped_column(String, default="")
    num_of_pieces: Mapped[int] = mapped_column(Integer, default=1)
    miles: Mapped[float] = mapped_column(Float, default=0)
    dimensions: Mapped[str] = mapped_column(String, default="")
    min_acceptable_rate: Mapped[float] = mapped_column(Float, default=0)


class CallRecord(Base):
    __tablename__ = "call_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String, index=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    mc_number: Mapped[str] = mapped_column(String, default="", index=True)
    carrier_name: Mapped[str] = mapped_column(String, default="")
    carrier_eligible: Mapped[bool] = mapped_column(default=False)

    load_id: Mapped[str] = mapped_column(String, default="", index=True)
    loadboard_rate: Mapped[float] = mapped_column(Float, default=0)
    agreed_rate: Mapped[float] = mapped_column(Float, default=0)
    num_counter_offers: Mapped[int] = mapped_column(Integer, default=0)
    counter_offers: Mapped[list] = mapped_column(JSON, default=list)

    origin: Mapped[str] = mapped_column(String, default="")
    destination: Mapped[str] = mapped_column(String, default="")
    equipment_type: Mapped[str] = mapped_column(String, default="")

    outcome: Mapped[str] = mapped_column(String, default="other", index=True)
    sentiment: Mapped[str] = mapped_column(String, default="neutral", index=True)
    classification_reasoning: Mapped[str] = mapped_column(Text, default="")

    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    transcript: Mapped[str] = mapped_column(Text, default="")
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
