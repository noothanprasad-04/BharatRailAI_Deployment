"""Small standard-library smoke test. Start the API first, then run: python smoke_test.py"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000/api"

def request(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=body, method=method, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        return response.status, json.loads(response.read().decode())

status, health = request("/health")
assert status == 200 and health["status"] == "ok"
status, meta = request("/meta")
assert status == 200 and len(meta["departments"]) == 3
status, login = request("/login", "POST", {"email":"worker@gmail.com","password":"12345678","role":"worker"})
assert status == 200 and login["user"]["role"] == "worker"
print("RailBlock AI smoke test: PASS")
