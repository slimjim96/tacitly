#!/usr/bin/env python3
"""End-to-end check against a running Tacitly. Seeds sample data, exercises every endpoint, asserts behaviour.

    python3 scripts/smoke.py http://localhost:8080 [token]

Creates its own lens ("Smoke test") and entries prefixed [smoke], and removes them at the end
unless --keep is passed (handy for seeing sample data in the UI).
"""
import json, sys, urllib.parse, urllib.request, urllib.error

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = (args[0] if args else "http://localhost:8080").rstrip("/") + "/api"
TOKEN = args[1] if len(args) > 1 else ""
KEEP = "--keep" in sys.argv


def call(method, path, body=None, expect=200):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json", "X-Tacitly-Token": TOKEN})
    try:
        with urllib.request.urlopen(req) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    assert status == expect, f"{method} {path} -> {status} (wanted {expect}): {raw[:300]!r}"
    return json.loads(raw) if raw else None


def ok(msg): print(f"  ok  {msg}")


print(f"Tacitly smoke test against {BASE}")

# leftovers from an interrupted earlier run
for old in call("GET", "/lenses"):
    if old["name"] == "Smoke test":
        call("DELETE", f"/lenses/{old['id']}", expect=204)
for old in call("GET", "/entries?limit=1000&q=" + urllib.parse.quote("[smoke]")):
    call("DELETE", f"/entries/{old['id']}", expect=204)

# --- lens + dimensions -------------------------------------------------------------------
lens = call("POST", "/lenses", {"name": "Smoke test", "description": "temporary", "gravity": 0.8})
L = lens["id"]
dims = {}
for name, low, high, w in [("Energy", "draining", "energising", 1), ("Fear", "safe", "scary", 1),
                           ("Pull", "obligation", "desire", 2)]:
    dims[name] = call("POST", f"/lenses/{L}/dimensions", {"name": name, "lowLabel": low, "highLabel": high, "weight": w})["id"]
ok("lens with 3 weighted dimensions")

call("POST", "/lenses", {"name": ""}, expect=400)
call("POST", f"/lenses/{L}/dimensions", {"name": "x", "weight": 9}, expect=400)
ok("validation rejects bad lens/dimension")

E, F, P = dims["Energy"], dims["Fear"], dims["Pull"]
def cap(kind, body, e=None, f=None, p=None):
    scores = {k: v for k, v in [(E, e), (F, f), (P, p)] if v is not None}
    return call("POST", "/entries", {"kind": kind, "body": f"[smoke] {body}", "scores": scores})

run = cap("aspiration", "Run a half marathon", 4, 1, 4)["entry"]["id"]
ship = cap("aspiration", "Ship SlimFin v2", 2, 3, 3)["entry"]["id"]
t1 = cap("thought", "Morning 5 km felt great", 4, 0, 4)
t2 = cap("thought", "Backtest keeps failing again", 1, 3, 3)
t3 = cap("thought", "Tax paperwork due", -4, 2, -4)
t4 = cap("thought", "Unscored idea about a pizza oven")
burnout = cap("pattern", "Burnout signature", -4, 3, -4)["entry"]["id"]

land = t1["lenses"][0]
assert land["gravity"] and land["gravity"]["entry"]["id"] == run, land
ok(f"capture reports gravity: thought -> 'Run a half marathon' (sim {land['gravity']['similarity']})")
assert t4["lenses"] == [], "unscored entry should land nowhere"

orbits = call("GET", f"/lenses/{L}/orbits")
by = {o["aspiration"]["id"]: o for o in orbits}
assert by[run]["orbitCount"] == 1 and by[ship]["orbitCount"] == 1, orbits
ok("orbits: each aspiration pulls its matching thought")

drift = call("GET", f"/lenses/{L}/drift")
assert [d["entry"]["id"] for d in drift["drifting"]] == [t3["entry"]["id"]], drift["drifting"]
assert any(u["id"] == t4["entry"]["id"] for u in drift["unscored"])
ok("drift: tax thought drifts, pizza thought is unscored in this lens")

hits = call("POST", f"/lenses/{L}/match", {"values": {E: -4, F: 3, P: -4}, "k": 3})
assert hits[0]["entry"]["id"] == burnout and hits[0]["similarity"] == 1.0, hits[0]
assert hits[1]["entry"]["id"] == t3["entry"]["id"], hits[1]
ok("match by shape (pgvector): burnout pattern first, then the tax thought")

pat = call("GET", f"/entries/{burnout}")
near = [n["entry"]["id"] for n in pat["lenses"][0]["near"]]
assert near[0] == t3["entry"]["id"], near
ok("entry detail: nearest neighbours in lens")

# --- rescoring and structural changes keep vectors consistent ---------------------------------
call("PUT", f"/entries/{t3['entry']['id']}/scores", {E: 4, P: 4, F: None})
orbits = {o["aspiration"]["id"]: o for o in call("GET", f"/lenses/{L}/orbits")}
assert orbits[run]["orbitCount"] == 2
ok("rescoring moves a thought into orbit (and clearing a score works)")

call("PUT", f"/entries/{t1['entry']['id']}/scores", {E: 9}, expect=400)
call("PUT", f"/entries/{t1['entry']['id']}/scores", {"00000000-0000-0000-0000-000000000000": 1}, expect=400)
ok("score validation (range, unknown dimension)")

call("PUT", f"/lenses/{L}/order", {"dimensionIds": [P, F, E]})
hits2 = call("POST", f"/lenses/{L}/match", {"values": {E: -4, F: 3, P: -4}, "k": 1})
assert hits2[0]["entry"]["id"] == burnout and hits2[0]["similarity"] == 1.0
ok("reordering dimensions rebuilds vectors (match unchanged)")

joy = call("POST", f"/lenses/{L}/dimensions", {"name": "Joy", "lowLabel": "flat", "highLabel": "joyful"})["id"]
call("PUT", f"/entries/{run}/scores", {joy: 5})
m = call("GET", f"/lenses/{L}/map")
assert len(m["lens"]["dimensions"]) == 4 and len(m["points"]) == 6, (len(m["lens"]["dimensions"]), len(m["points"]))
ok(f"map: 4 dimensions, {len(m['points'])} points, {len(m['themes'])} themes: " + ", ".join(t["label"] for t in m["themes"]))

call("DELETE", f"/dimensions/{joy}", expect=204)
m = call("GET", f"/lenses/{L}/map")
assert all(joy not in p["scores"] for p in m["points"])
ok("deleting a dimension removes its scores and shrinks vectors")

call("PATCH", f"/entries/{t3['entry']['id']}", {"kind": "aspiration"})
call("PATCH", f"/entries/{run}", {"status": "done"})
call("PATCH", f"/entries/{run}", {"status": "bogus"}, expect=400)
orbits = call("GET", f"/lenses/{L}/orbits")
assert run not in [o["aspiration"]["id"] for o in orbits] and len(orbits) == 2
ok("promote thought to aspiration; done aspirations stop pulling")

found = call("GET", "/entries?q=backtest")
assert any(e["id"] == t2["entry"]["id"] for e in found)
call("GET", "/entries?q=%25")  # LIKE wildcards are escaped; must not error
ok("text search")

# --- v3: the river ------------------------------------------------------------------------
detail = call("GET", f"/entries/{t3['entry']['id']}")
assert len([h for h in detail["history"] if h["scorer"] == "me"]) >= 5, detail["history"]
m = call("GET", f"/lenses/{L}/map")
assert next(p for p in m["points"] if p["id"] == t3["entry"]["id"])["was"], "rescored entry should have a trail"
ok("score history recorded; map carries the starting shape for trails")

goal = cap("aspiration", "Rest properly", -3, -4, 5)["entry"]["id"]
cap("thought", "Nap on Sunday, if I must", -3, -4, 3)
cap("thought", "Should probably take a day off", -2, -4, 3)
o = next(o for o in call("GET", f"/lenses/{L}/orbits") if o["aspiration"]["id"] == goal)
assert o["orbitCount"] == 2 and o["statedVsRevealed"] is not None and o["gapNote"] and "Pull" in o["gapNote"], o
ok(f"stated vs revealed: {o['gapNote']}")

wild = call("POST", f"/lenses/{L}/dimensions", {"name": "Source", "lowLabel": "my voice", "highLabel": "borrowed", "weight": 0, "wildcard": True})
assert wild["weight"] == 0 and wild["wildcard"] is True
call("PUT", f"/entries/{burnout}/scores", {wild["id"]: 5})
hits = call("POST", f"/lenses/{L}/match", {"values": {E: -4, F: 3, P: -4}, "k": 1})
assert hits[0]["entry"]["id"] == burnout and hits[0]["similarity"] == 1.0, hits[0]
ok("observed-only (weight 0) wild card is scored but doesn't move similarity")

call("PATCH", f"/dimensions/{F}", {"archived": True})
lens_now = next(l for l in call("GET", "/lenses") if l["id"] == L)
assert next(d for d in lens_now["dimensions"] if d["id"] == F)["archivedAt"]
call("PUT", f"/entries/{burnout}/scores", {F: 1}, expect=400)
call("PATCH", f"/dimensions/{F}", {"archived": False})
assert call("GET", f"/entries/{burnout}")["entry"]["scores"][F] == 3
ok("archive keeps scores, blocks scoring, restore brings the axis back")

before = call("POST", f"/lenses/{L}/match", {"values": {E: 4, F: 1, P: 4}, "k": 3})
call("PUT", f"/entries/{t1['entry']['id']}/scores?scorer=aaron", {E: -5, P: -5})
d = call("GET", f"/entries/{t1['entry']['id']}")
assert d["perspectives"]["aaron"][E] == -5 and d["entry"]["scores"][E] == 4
assert call("POST", f"/lenses/{L}/match", {"values": {E: 4, F: 1, P: 4}, "k": 3}) == before
call("PUT", f"/entries/{t1['entry']['id']}/scores?scorer=Bad%20Name", {E: 1}, expect=400)
assert "aaron" in call("GET", "/scorers")
ok("second perspective stored and compared, never changes your vectors")

ing = call("POST", "/ingest", {"body": "[smoke] homelab alert", "source": "homelab", "scores": {"smoke test/energy": -3}})
assert ing["entry"]["source"] == "homelab" and ing["entry"]["scores"][E] == -3
call("POST", "/ingest", {"body": "[smoke] x", "scores": {"Nope/Thing": 1}}, expect=400)
ok("ingest by 'Lens/Dimension' name with a source tag")

assert isinstance(call("GET", "/review"), list)
call("POST", f"/entries/{t1['entry']['id']}/affirm", expect=204)
ok("review queue + affirm")

# --- 0004: quick capture --------------------------------------------------------------------
unscored_before = call("GET", "/pulse")["unscored"]
n1 = call("POST", "/entries", {"body": "[smoke] plumber's number is in the drawer"})
assert n1["entry"]["kind"] == "note" and n1["entry"]["isTodo"] is False and n1["lenses"] == [], n1["entry"]
n1 = n1["entry"]["id"]
td = call("POST", "/entries", {"body": "[] [smoke] call the plumber"})["entry"]
assert td["kind"] == "note" and td["isTodo"] is True and td["body"] == "[smoke] call the plumber", td
td2 = call("POST", "/entries", {"body": "[smoke] renew passport", "todo": True})["entry"]
assert td2["isTodo"] is True
ok("a bare line saves as a note; '[]' or todo:true makes a to-do (marker stripped)")

call("POST", "/entries", {"kind": "thought", "body": "[smoke] x", "todo": True}, expect=400)
call("POST", "/entries", {"body": "[smoke] x", "scores": {E: 1}}, expect=400)
call("PUT", f"/entries/{n1}/scores", {E: 1}, expect=400)
call("PATCH", f"/entries/{t2['entry']['id']}", {"isTodo": True}, expect=400)
ok("notes refuse scores; only notes can be to-dos")

inbox = call("GET", "/inbox")
assert [e["id"] for e in inbox["todos"]][:2] == [td2["id"], td["id"]], inbox["todos"][:2]
assert n1 in [e["id"] for e in inbox["notes"]] and all(not e["isTodo"] for e in inbox["notes"])
assert call("GET", "/pulse")["unscored"] == unscored_before, "notes must not count as unscored"
assert all(u["kind"] != "note" for u in call("GET", f"/lenses/{L}/drift")["unscored"])
assert any(e["id"] == n1 for e in call("GET", "/entries?q=" + urllib.parse.quote("plumber's number")))
ok("inbox: open to-dos first, then notes; notes stay out of unscored and drift; search finds them")

call("PATCH", f"/entries/{td['id']}", {"status": "done"})
inbox = call("GET", "/inbox")
assert td["id"] not in [e["id"] for e in inbox["todos"]] and td["id"] in [e["id"] for e in inbox["doneRecently"]]
call("PATCH", f"/entries/{td['id']}", {"status": "active"})
assert td["id"] in [e["id"] for e in call("GET", "/inbox")["todos"]]
call("PATCH", f"/entries/{n1}", {"isTodo": True})
assert n1 in [e["id"] for e in call("GET", "/inbox")["todos"]]
call("PATCH", f"/entries/{n1}", {"isTodo": False})
ok("tick, untick, and turn a note into a to-do and back")

promoted = call("PATCH", f"/entries/{td2['id']}", {"kind": "thought"})
assert promoted["kind"] == "thought" and promoted["isTodo"] is False and promoted["createdAt"] == td2["createdAt"]
assert td2["id"] not in [e["id"] for e in call("GET", "/inbox")["todos"]]
assert any(u["id"] == td2["id"] for u in call("GET", f"/lenses/{L}/drift")["unscored"])
call("PUT", f"/entries/{td2['id']}/scores", {E: 2})
call("PATCH", f"/entries/{td2['id']}", {"kind": "note"}, expect=400)
ok("promote a note to a thought: keeps its date, leaves the inbox, can be scored, can't go back while scored")

old = call("POST", "/ingest", {"body": "[smoke] fix the gate", "todo": True, "source": "shortcut",
                               "createdAt": "2020-01-01T09:00:00Z"})["entry"]
assert old["kind"] == "note" and old["isTodo"] and old["createdAt"].startswith("2020-01-01"), old
quiet = call("POST", "/ingest", {"body": "[smoke] old note", "kind": "note", "createdAt": "2020-01-01T09:00:00Z"})["entry"]
call("POST", "/ingest", {"body": "[smoke] x", "createdAt": "2999-01-01T00:00:00Z"}, expect=400)
review = [e["id"] for e in call("GET", "/review?limit=200")]
assert old["id"] in review and quiet["id"] not in review, review
call("POST", f"/entries/{old['id']}/affirm", expect=204)
assert old["id"] not in [e["id"] for e in call("GET", "/review?limit=200")]
ok("stale to-do (14+ days) comes back in 'still true?'; old plain notes don't; affirming resets it")

MCP = BASE[:-4] + "/mcp"
def rpc(method, params=None, id=1):
    body = {"jsonrpc": "2.0", "method": method, **({"id": id} if id is not None else {}), **({"params": params} if params else {})}
    req = urllib.request.Request(MCP, method="POST", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else r.status
init = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "smoke", "version": "1"}})
assert init["result"]["serverInfo"]["name"] == "tacitly"
assert rpc("notifications/initialized", id=None) == 202
tools = [t["name"] for t in rpc("tools/list")["result"]["tools"]]
assert {"capture", "match", "orbits", "list_lenses", "score"} <= set(tools), tools
res = rpc("tools/call", {"name": "capture", "arguments": {"body": "[smoke] via MCP", "scores": {"Smoke test/Pull": 4}}})["result"]
assert not res["isError"] and json.loads(res["content"][0]["text"])["entry"]["source"] == "claude"
res = rpc("tools/call", {"name": "match", "arguments": {"lens": "smoke test", "values": {"energy": -4, "fear": 3, "pull": -4}, "k": 1}})["result"]
assert json.loads(res["content"][0]["text"])[0]["entry"]["id"] == burnout
assert rpc("tools/call", {"name": "orbits", "arguments": {"lens": "nope"}})["result"]["isError"] is True
ok(f"MCP endpoint: initialize, {len(tools)} tools, capture, match, tool errors")

def tool(name, args):
    res = rpc("tools/call", {"name": name, "arguments": args})["result"]
    return res["isError"], (res["content"][0]["text"] if res["isError"] else json.loads(res["content"][0]["text"]))
err, made = tool("note", {"text": "[smoke] book the dentist", "todo": True})
assert not err and made["entry"]["isTodo"] and made["entry"]["source"] == "claude", made
mid = made["entry"]["id"]
err, open_ = tool("todos", {})
assert not err and mid in [t["id"] for t in open_]
err, ticked = tool("done", {"entry_id": mid})
assert not err and ticked["status"] == "done"
assert tool("done", {"entry_id": n1})[0] is True, "a plain note can't be ticked"
assert tool("capture", {"body": "[smoke] x", "kind": "note", "scores": {"Smoke test/Pull": 1}})[0] is True
ok("MCP quick capture: note, todos, done; notes refuse scores")

pulse = call("GET", "/pulse")
export = call("GET", "/export")
assert any(l["id"] == L for l in export["lenses"])
ok(f"pulse + export ({pulse})")

if not KEEP:
    for e in call("GET", "/entries?limit=1000&q=" + urllib.parse.quote("[smoke]")):
        call("DELETE", f"/entries/{e['id']}", expect=204)
    call("DELETE", f"/lenses/{L}", expect=204)
    ok("cleaned up")

print("All good.")
