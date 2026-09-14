from __future__ import annotations

from math import sqrt

import pytest

from smart_gate.domain.entities import Driver, FaceObservation, Vehicle
from smart_gate.domain.enums import OrderStatus, PlateMatchType
from smart_gate.domain.exceptions import ConflictError
from smart_gate.domain.services import (
    FaceMatchingService,
    OrderStateService,
    PlateMatchingService,
    mask_card_uid,
    normalize_card_uid,
)


def test_cosine_threshold_accepts_exactly_point_seven_five() -> None:
    service = FaceMatchingService(0.75)
    driver = Driver("Tài xế", (0.75, sqrt(0.4375)), "test")
    observation = FaceObservation((1.0, 0.0), 1.0, 1.0, True, "test")

    matched, similarity = service.matches_driver(observation, driver)

    assert matched is True
    assert similarity == pytest.approx(0.75)


def test_plate_fuzzy_requires_unique_best_candidate() -> None:
    service = PlateMatchingService(90)
    winner = Vehicle("30A1234568", "30A1234568", "truck")

    match = service.match("30A1234567", [winner])

    assert match.vehicle == winner
    assert match.match_type == PlateMatchType.FUZZY
    assert match.score == pytest.approx(0.9)


def test_plate_fuzzy_rejects_tied_candidates() -> None:
    service = PlateMatchingService(90)
    vehicles = [
        Vehicle("30A1234568", "30A1234568", "truck"),
        Vehicle("30A1234569", "30A1234569", "truck"),
    ]

    match = service.match("30A1234567", vehicles)

    assert match.vehicle is None
    assert match.match_type == PlateMatchType.NONE


def test_order_state_rejects_skipping_loading() -> None:
    service = OrderStateService()

    with pytest.raises(ConflictError) as error:
        service.transition(OrderStatus.PENDING, OrderStatus.READY_FOR_EXIT)

    assert error.value.code == "ORDER_STATE_INVALID"


def test_face_identification_rejects_equal_best_candidates() -> None:
    service = FaceMatchingService(0.75)
    observation = FaceObservation((1.0, 0.0), 1.0, 1.0, True, "test")
    drivers = [
        Driver("Tài xế A", (1.0, 0.0), "test"),
        Driver("Tài xế B", (1.0, 0.0), "test"),
    ]

    matched, similarity = service.best_match(observation, drivers)

    assert matched is None
    assert similarity == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        (" ab-12 34 ", "AB1234"),
        ("AB:12:34", "AB1234"),
        ("ab1234", "AB1234"),
    ],
)
def test_normalize_card_uid(raw: str, normalized: str) -> None:
    assert normalize_card_uid(raw) == normalized


def test_mask_card_uid_never_returns_the_raw_uid() -> None:
    assert mask_card_uid("ab-12-34") == "••••1234"
    assert "AB1234" not in mask_card_uid("ab-12-34")


@pytest.mark.parametrize("raw", ["ab12", "a-b-1-2", " AB:12 ", "ab1", "a-b"])
def test_mask_card_uid_hides_every_character_of_a_short_uid(raw: str) -> None:
    """UID ngắn nhất hợp lệ (4 ký tự) không được lộ bất kỳ ký tự nào."""

    masked = mask_card_uid(raw)
    normalized = normalize_card_uid(raw)

    assert masked == "••••"
    assert normalized not in masked
    for character in normalized:
        assert character not in masked


def test_mask_card_uid_reveals_at_most_the_last_four_of_a_long_uid() -> None:
    masked = mask_card_uid("ab-12-34-56")

    assert masked == "••••3456"
    assert "AB12" not in masked
