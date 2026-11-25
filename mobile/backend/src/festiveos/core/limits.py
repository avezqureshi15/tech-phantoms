"""The rate limit policies and the ready-made dependencies routers attach to their routes.

Numbers are starting points chosen from docs/rate-limiting.md; there is no production traffic to
tune against yet. Pre-authentication endpoints are limited per client IP; everything else per user.
"""

from festiveos.core.ratelimit import Limit, rate_limited

SIGN_IN = Limit("auth.sign_in", 10, 60)
REFRESH = Limit("auth.refresh", 30, 60)
LOGOUT = Limit("auth.logout", 30, 60)
CREATE_HOUSEHOLD = Limit("households.create", 5, 24 * 3600)
INVITE_MEMBER = Limit("members.invite", 10, 3600)
WRITE = Limit("write", 60, 60)
DESTRUCTIVE = Limit("destructive", 5, 3600)
READ = Limit("read", 300, 60)
HEALTH = Limit("health", 60, 60)
# Each AI turn costs real money and a worker thread, so it has its own, much tighter budget.
AI_TURN = Limit("ai.turn", 30, 3600)
AI_DAILY = Limit("ai.daily", 150, 24 * 3600)
# Reading a document is a paid call to a third party and moves a large file, so it is tight too.
SCAN = Limit("documents.scan", 20, 3600)
SCAN_DAILY = Limit("documents.daily", 60, 24 * 3600)
# Talking to the app is frequent but each clip is a paid call, so it has its own budget.
VOICE = Limit("voice.clip", 60, 3600)
VOICE_DAILY = Limit("voice.daily", 300, 24 * 3600)
# A call back costs a phone call and a person's time, so three a day is plenty for one person.
SUPPORT_CALLBACK = Limit("support.callback", 3, 24 * 3600)
# A backstop for every request from one address, including ones that match no route.
GLOBAL_PER_IP = Limit("global", 1200, 60)

sign_in = rate_limited(SIGN_IN, scope="ip")
refresh = rate_limited(REFRESH, scope="ip")
logout = rate_limited(LOGOUT, scope="ip")
create_household = rate_limited(CREATE_HOUSEHOLD)
invite_member = rate_limited(INVITE_MEMBER)
write = rate_limited(WRITE)
destructive = rate_limited(DESTRUCTIVE)
read = rate_limited(READ)
ai_turn = rate_limited(AI_TURN)
support_callback = rate_limited(SUPPORT_CALLBACK)
ai_daily = rate_limited(AI_DAILY)
scan = rate_limited(SCAN)
scan_daily = rate_limited(SCAN_DAILY)
voice = rate_limited(VOICE)
voice_daily = rate_limited(VOICE_DAILY)
health = rate_limited(HEALTH, scope="ip")
