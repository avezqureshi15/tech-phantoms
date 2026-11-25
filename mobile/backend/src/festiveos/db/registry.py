"""Import every ORM model so ``Base.metadata`` is complete.

Alembic and the test schema builder need all tables registered, however the app was entered.
Add a line here when a module gains models.
"""

from festiveos.ai import models as ai_models  # noqa: F401
from festiveos.auth import models as auth_models  # noqa: F401
from festiveos.expenses import models as expense_models  # noqa: F401
from festiveos.festivals import models as festival_models  # noqa: F401
from festiveos.households import models as household_models  # noqa: F401
from festiveos.inventory import models as inventory_models  # noqa: F401
from festiveos.support import models as support_models  # noqa: F401
from festiveos.traditions import models as tradition_models  # noqa: F401
from festiveos.users import models as user_models  # noqa: F401
