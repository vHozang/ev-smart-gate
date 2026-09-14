from __future__ import annotations

import re
from collections.abc import Iterable
from typing import ClassVar

import numpy as np
from rapidfuzz.distance import Levenshtein
from rapidfuzz.fuzz import ratio

from smart_gate.domain.entities import Driver, FaceObservation, PlateMatch, Vehicle
from smart_gate.domain.enums import OrderStatus, PlateMatchType
from smart_gate.domain.exceptions import ConflictError


def normalize_plate(value: str) -> str:
    """Chuẩn hóa biển số về chuỗi chữ hoa và chữ số để đối chiếu."""

    return re.sub(r"[^A-Z0-9]", "", value.upper())


def normalize_card_uid(card_uid: str) -> str:
    """Chuẩn hóa UID thẻ nhân viên: bỏ mọi ký tự phân tách và chuyển chữ hoa."""

    return re.sub(r"[^A-Z0-9]", "", card_uid.upper())


def mask_card_uid(card_uid: str) -> str:
    """Che UID thẻ để không bao giờ lộ giá trị thô ra API hoặc log."""

    return "••••" + normalize_card_uid(card_uid)[-4:]


class PlateMatchingService:
    def __init__(self, fuzzy_score_threshold: float = 90.0) -> None:
        self.fuzzy_score_threshold = fuzzy_score_threshold

    def match(self, observed_plate: str, vehicles: Iterable[Vehicle]) -> PlateMatch:
        observed = normalize_plate(observed_plate)
        candidates = list(vehicles)
        for vehicle in candidates:
            if observed == vehicle.plate_normalized:
                return PlateMatch(vehicle, 1.0, PlateMatchType.EXACT)

        fuzzy_matches: list[tuple[float, Vehicle]] = []
        for vehicle in candidates:
            expected = vehicle.plate_normalized
            if len(observed) != len(expected) or observed[:2] != expected[:2]:
                continue
            if Levenshtein.distance(observed, expected) > 1:
                continue
            score = float(ratio(observed, expected))
            if score >= self.fuzzy_score_threshold:
                fuzzy_matches.append((score, vehicle))

        fuzzy_matches.sort(key=lambda item: item[0], reverse=True)
        if not fuzzy_matches:
            return PlateMatch(None, 0.0, PlateMatchType.NONE)
        if len(fuzzy_matches) > 1 and fuzzy_matches[0][0] == fuzzy_matches[1][0]:
            return PlateMatch(None, 0.0, PlateMatchType.NONE)
        return PlateMatch(fuzzy_matches[0][1], fuzzy_matches[0][0] / 100.0, PlateMatchType.FUZZY)


class FaceMatchingService:
    def __init__(self, similarity_threshold: float = 0.75) -> None:
        self.similarity_threshold = similarity_threshold

    @staticmethod
    def cosine_similarity(left: Iterable[float], right: Iterable[float]) -> float:
        left_vector = np.asarray(tuple(left), dtype=np.float32)
        right_vector = np.asarray(tuple(right), dtype=np.float32)
        if left_vector.shape != right_vector.shape or left_vector.size == 0:
            return 0.0
        denominator = float(np.linalg.norm(left_vector) * np.linalg.norm(right_vector))
        if denominator <= 0:
            return 0.0
        return float(np.dot(left_vector, right_vector) / denominator)

    def best_match(
        self, observation: FaceObservation, drivers: Iterable[Driver]
    ) -> tuple[Driver | None, float]:
        ranked: list[tuple[float, Driver]] = []
        for driver in drivers:
            similarity = self.cosine_similarity(observation.embedding, driver.face_embedding)
            ranked.append((similarity, driver))
        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            return None, 0.0
        best_similarity, best_driver = ranked[0]
        if best_similarity < self.similarity_threshold:
            return None, best_similarity
        if len(ranked) > 1 and abs(best_similarity - ranked[1][0]) <= 1e-6:
            return None, best_similarity
        return best_driver, best_similarity

    def matches_driver(self, observation: FaceObservation, driver: Driver) -> tuple[bool, float]:
        similarity = self.cosine_similarity(observation.embedding, driver.face_embedding)
        return similarity >= self.similarity_threshold, similarity


class OrderStateService:
    """Bảo vệ máy trạng thái của lệnh xuất kho tại lớp Domain."""

    _allowed_transitions: ClassVar[dict[OrderStatus, set[OrderStatus]]] = {
        OrderStatus.PENDING: {OrderStatus.LOADING, OrderStatus.CANCELLED},
        OrderStatus.LOADING: {OrderStatus.READY_FOR_EXIT, OrderStatus.CANCELLED},
        OrderStatus.READY_FOR_EXIT: {OrderStatus.SLIP_ISSUED, OrderStatus.CANCELLED},
        OrderStatus.SLIP_ISSUED: {
            OrderStatus.SLIP_ISSUED,
            OrderStatus.COMPLETED,
            OrderStatus.CANCELLED,
        },
        OrderStatus.COMPLETED: set(),
        OrderStatus.CANCELLED: set(),
    }

    def transition(self, current: OrderStatus, target: OrderStatus) -> OrderStatus:
        if target not in self._allowed_transitions[current]:
            raise ConflictError(
                "ORDER_STATE_INVALID",
                f"Không thể chuyển lệnh xuất kho từ {current} sang {target}",
            )
        return target
