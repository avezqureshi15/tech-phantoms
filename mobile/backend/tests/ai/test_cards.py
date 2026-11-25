import uuid

import pytest
from pydantic import ValidationError

from festiveos.ai.cards import QuestionCard, QuestionContent, validate_answers
from festiveos.core.errors import InvalidInputError

FIELDS = [
    {"key": "guests", "label": "Guests", "type": "number", "minimum": 1, "maximum": 50},
    {
        "key": "diet",
        "label": "Diet",
        "type": "single_choice",
        "options": [{"value": "veg", "label": "Veg"}, {"value": "mixed", "label": "Mixed"}],
    },
    {
        "key": "extras",
        "label": "Extras",
        "type": "multi_choice",
        "required": False,
        "options": [{"value": "sweet", "label": "Sweet"}, {"value": "chai", "label": "Chai"}],
    },
    {"key": "elders", "label": "Elders coming?", "type": "yes_no"},
]


def card(fields=FIELDS) -> QuestionCard:
    content = QuestionContent.model_validate({"title": "Tell me more", "fields": fields})
    return QuestionCard(id=uuid.uuid4(), **content.model_dump())


def test_valid_answers_pass_and_optional_ones_may_be_missing() -> None:
    answers = {"guests": 3, "diet": "veg", "elders": False}

    assert validate_answers(card(), answers) == answers


@pytest.mark.parametrize(
    "answers",
    [
        {"guests": 0, "diet": "veg", "elders": True},  # below minimum
        {"guests": 51, "diet": "veg", "elders": True},  # above maximum
        {"guests": "3", "diet": "veg", "elders": True},  # a string is not a number
        {"guests": True, "diet": "veg", "elders": True},  # a bool is not a number
        {"guests": 3, "diet": "keto", "elders": True},  # not an offered option
        {"guests": 3, "diet": "veg", "elders": "yes"},  # not a bool
        {"guests": 3, "diet": "veg", "elders": True, "extras": ["sweet", "sweet"]},
        {"guests": 3, "diet": "veg", "elders": True, "extras": ["pizza"]},
        {"guests": 3, "diet": "veg", "elders": True, "secret": 1},  # not on the card
        {"diet": "veg", "elders": True},  # required answer missing
    ],
)
def test_bad_answers_are_rejected(answers) -> None:
    with pytest.raises(InvalidInputError):
        validate_answers(card(), answers)


@pytest.mark.parametrize(
    "field",
    [
        {"key": "Bad Key", "label": "x", "type": "text"},
        {"key": "a", "label": "x", "type": "single_choice", "options": []},
        {"key": "a", "label": "x", "type": "text", "options": [{"value": "v", "label": "V"}]},
        {"key": "a", "label": "x", "type": "number"},
        {"key": "a", "label": "x", "type": "number", "minimum": 5, "maximum": 1},
    ],
)
def test_malformed_model_authored_cards_are_rejected(field) -> None:
    with pytest.raises(ValidationError):
        QuestionContent.model_validate({"title": "t", "fields": [field]})


def test_duplicate_keys_and_too_many_fields_are_rejected() -> None:
    text = {"key": "a", "label": "x", "type": "text"}
    with pytest.raises(ValidationError):
        QuestionContent.model_validate({"title": "t", "fields": [text, text]})
    many = [{**text, "key": f"k{i}"} for i in range(7)]
    with pytest.raises(ValidationError):
        QuestionContent.model_validate({"title": "t", "fields": many})
