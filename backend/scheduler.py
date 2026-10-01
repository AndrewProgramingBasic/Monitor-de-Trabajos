"""
Scheduler Module - Backward compatibility wrapper for services.alert_scheduler.
All background alert scheduling functions are defined in services.alert_scheduler.
"""
import sys
import services.alert_scheduler as _alert_scheduler

# Expose all symbols directly in scheduler module namespace
for _k, _v in list(_alert_scheduler.__dict__.items()):
    if not _k.startswith("__"):
        globals()[_k] = _v

# Point sys.modules['scheduler'] directly to services.alert_scheduler
# so monkeypatching 'scheduler.get_db_cursor' or 'scheduler.start_scheduler'
# updates services.alert_scheduler directly.
sys.modules[__name__] = _alert_scheduler

