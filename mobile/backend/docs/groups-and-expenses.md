# Groups, expenses and search

## Groups

A *group* is what the code still calls a household (table `households`, routes `/households/...`; renaming
would touch everything and nothing is deployed, so the product word "group" lives in the app only).
A person can belong to any number of groups, and each has its own festivals, expenses and chats.

| Field | Meaning |
|---|---|
| `kind` | `household`, `friends`, `office` or `other` |
| `icon` | `emoji:<emoji>` or `symbol:<ionicons name>`; `null` means the kind's default |
| `color` | `#RRGGBB` |
| `faiths`, `panchang_city` | see `religions-and-calendars.md` |

**Traditions belong to household groups only.** Creating one in any other kind is a 422; the app hides the tab.

## Expenses (Splitwise-style)

Code: `src/festiveos/expenses/`. Routes: expenses CRUD, `/households/{id}/balances`, `.../expenses/summary`,
`.../settlements`.

* **Money is integer minor units** (paise). No floats in the database, the API or the splitting maths.
* **Splitting** (`splits.py`): equal, exact amounts (must sum to the total), percent (basis points, must sum to 10000)
  and shares (weights). Shares always add up to the total exactly: the leftover paise go, largest remainder first,
  to people in a fixed order, so the same input always gives the same split. Property-tested over thousands of cases.
* **Balances** are computed from aggregate queries on read, never stored, so they cannot drift. Positive means the
  group owes that person. A payment from A to B raises A's balance and lowers B's. `simplify` produces at most
  (people - 1) payments that settle everyone.
* **Trackers**: every expense may link to a festival; passing `festival_id` to the list, summary and balances
  endpoints is that festival's own tracker. Settlements are group-wide, so a festival tracker excludes them.
* **Who can do what**: any member adds an expense or records a payment they are part of; only the author or a group
  admin edits or deletes; an admin can record anyone's payment. Everyone in an expense must be a member.
* **People who leave**: expenses, shares and payments reference users with `ON DELETE SET NULL`. Deleting an account
  never fails because of a debt, and the ledger still balances: the departed person's side is kept under `null` and
  shown as "Former member". Leaving a group does *not* clear debts.
* **Concurrency**: writers take the household's `FOR KEY SHARE` lock first (the rule in `concurrency.md`), so a
  group deletion and an expense insert cannot deadlock.
* Changing an expense's amount and its split is one operation (the two must be sent together).

## Search

`GET /api/v1/search?q=` (2 to 60 characters). Searches group names, festivals, traditions, expenses and the people
who share a group with you. **Every query is restricted to the groups you belong to.** `%` and `_` in the query are
literal characters. At most five results per kind, one query per kind. Fine at family scale; at large scale add a
`pg_trgm` GIN index on the searched columns.

## Not done yet

* Editing an expense in the app (the API supports it), percent and shares splits in the form, receipts.
* Recurring expenses and payment reminders (these arrive with Shaadi mode).
* Group photo upload (emoji and symbols only, by decision; photos need object storage).
* Blocking someone from leaving a group while they owe money.
