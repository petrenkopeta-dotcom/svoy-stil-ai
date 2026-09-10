"""Fail-closed bootstrap. No photo input is read until safety is implemented.

Research scripts remain outside the deployable repository. Never import them.
This is a deployment blocker, not a replacement for a pixel detector.
"""
import json
import sys

print(json.dumps({"type": "capability_error",
                  "code": "photo_safety_unavailable",
                  "detail": "Validated in-memory pixel detector is not installed"}), flush=True)
sys.exit(21)
