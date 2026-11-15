const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { reconcile, toKobo } = require("./reconcile");

test("amount conversion preserves decimal precision and large values", () => {
  assert.equal(toKobo("55,707.77"), 5570777n);
  assert.equal(toKobo(0.1) + toKobo(0.2), 30n);
  assert.equal(toKobo("9007199254740993.01"), 900719925474099301n);
  assert.equal(toKobo("-1.05"), -105n);
  assert.throws(() => toKobo("NaN"));
});

test("latest timestamps govern retries, with malformed lines and missing IDs skipped", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "koya-reconcile-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const event = (txn_id, status, amount, day) => JSON.stringify({
    txn_id, status, amount, currency: "NGN", ts: `2026-09-${day}T00:00:00Z`,
  });
  const input = [
    event("a", "success", "1,000.10", "03"),
    event("a", "success", 500, "01"),
    event("b", "success", 900, "01"),
    event("b", "failed", 900, "02"),
    event("c", "pending", 800, "02"),
    event("c", "success", 800, "01"),
    "broken JSON", "null", "", event(undefined, "success", 9999, "01"),
    event("d", "failed", 0.2, "01"),
    event("d", "success", 0.2, "02"),
  ].join("\n");
  const filename = path.join(directory, "payments.jsonl");
  await fs.writeFile(filename, input);
  assert.deepEqual(await reconcile(filename), { count: 2, total: 100030n });
});

test("missing input files reject rather than succeeding silently", async () => {
  await assert.rejects(reconcile(path.join(__dirname, "nonexistent-input.jsonl")), {
    code: "ENOENT",
  });
});
