"""Turning what the document reader returned for a receipt into a clean draft.

The reader is good but not infallible (it can return the subtotal as the total), and this is money,
so the result is only ever a draft; every number is parsed defensively and anything doubtful is
flagged in ``warnings`` for the person to check.
"""

import json
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from festiveos.expenses.schemas import MAX_MINOR, ReceiptDraft, ReceiptItem

MAX_ITEMS = 30

RECEIPT_SCHEMA = json.dumps(
    {
        "type": "object",
        "properties": {
            "merchant": {"type": "string", "description": "Shop or business name"},
            "date": {"type": "string", "description": "Date of purchase as YYYY-MM-DD"},
            "total": {
                "type": "number",
                "description": "Final amount paid including tax, in INR (the grand total)",
            },
            "items": {
                "type": "array",
                "description": "Line items bought",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "amount": {"type": "number", "description": "Line amount in INR"},
                    },
                },
            },
        },
    }
)


def to_minor(value: Any) -> int | None:
    """Rupees (a number or text such as ``Rs 1,323.00``) as integer paise, or None if not sane."""
    if isinstance(value, bool) or value is None:
        return None
    text = re.sub(r"[^\d.\-]", "", str(value))
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    minor = int((amount * 100).to_integral_value())
    return minor if 0 < minor <= MAX_MINOR else None


def to_date(value: Any, today: date) -> date | None:
    """An ISO date or day/month/year, and not unreasonably in the future."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    parsed: date | None = None
    try:
        parsed = date.fromisoformat(text)
    except ValueError:
        match = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
        if match:
            try:
                parsed = date(int(match[3]), int(match[2]), int(match[1]))
            except ValueError:
                return None
    if parsed is None or parsed > today + timedelta(days=1) or parsed.year < 2000:
        return None
    return parsed


def to_draft(raw: dict[str, Any], today: date) -> ReceiptDraft:
    warnings: list[str] = []

    merchant = raw.get("merchant")
    merchant = merchant.strip()[:120] or None if isinstance(merchant, str) else None

    items: list[ReceiptItem] = []
    for item in (raw.get("items") or [])[:MAX_ITEMS]:
        if not isinstance(item, dict):
            continue
        name, amount = item.get("name"), to_minor(item.get("amount"))
        if isinstance(name, str) and name.strip() and amount is not None:
            items.append(ReceiptItem(name=name.strip()[:120], amount_minor=amount))

    total = to_minor(raw.get("total"))
    spent_on = to_date(raw.get("date"), today)
    if raw.get("date") and spent_on is None:
        warnings.append("The date on the receipt looked wrong, so it was left out.")

    items_sum = sum(item.amount_minor for item in items)
    if total is None and items:
        total = items_sum
        warnings.append("No total was found, so the items were added up. Please check it.")
    elif total is None:
        warnings.append("We couldn't find a total. Please enter it.")
    elif items and abs(items_sum - total) > 100:
        warnings.append("The items don't add up to the total (tax or discounts?). Please check it.")

    return ReceiptDraft(
        merchant=merchant, spent_on=spent_on, total_minor=total, items=items, warnings=warnings
    )
