"""Small OpenAlex API client.

Set OPENALEX_API_KEY to use a free key: https://openalex.org/settings/api
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.openalex.org"

calls = 0


class BudgetExhausted(Exception):
    pass


def get(path, params):
    """Returns the parsed JSON for BASE/path?params, retrying on server errors."""
    global calls
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params, safe=':|,*')}"
    key = os.environ.get("OPENALEX_API_KEY")
    full = url + (f"&api_key={key}" if key else "")
    for attempt in range(6):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "eerankings-pipeline"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
                remaining = r.headers.get("X-RateLimit-Remaining-USD")
            calls += 1
            if remaining is not None and calls % 25 == 0:
                print(f"    [{calls} calls, ${remaining} budget left]", flush=True)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                body = e.read().decode("utf-8", "replace")
                if "budget" in body.lower() or "limit" in body.lower() and attempt >= 2:
                    raise BudgetExhausted(body[:300])
                time.sleep(2 ** attempt)
            elif e.code >= 500:
                time.sleep(2 ** attempt)
            else:
                raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed after retries: {url}")
