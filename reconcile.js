// Payment reconciliation.
//
// Reads payments.jsonl and works out how much money we actually collected.
// Run:  node reconcile.js

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Sum integer kobo so decimal amounts never accumulate floating-point errors.
function toKobo(amount) {
  const text = String(amount).trim().replace(/,/g, "");
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Invalid payment amount");
  const value =
    BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  return match[1] === "-" ? -value : value;
}

async function reconcile(inputPath) {
  const latest = new Map();
  const lines = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue; // Unreadable lines are explicitly excluded by the README.
    }
    if (!event || !event.txn_id) continue;

    const timestamp = Date.parse(event.ts);
    if (!Number.isFinite(timestamp))
      throw new Error("Invalid payment timestamp");
    const previous = latest.get(event.txn_id);
    // File order is not chronological; compare the actual attempt timestamps.
    if (!previous || timestamp > previous.timestamp) {
      latest.set(event.txn_id, { timestamp, event });
    }
  }

  let total = 0n;
  let count = 0;
  for (const { event } of latest.values()) {
    if (event.status !== "success") continue;
    total += toKobo(event.amount);
    count += 1;
  }
  return { total, count };
}

async function main() {
  const { total, count } = await reconcile(
    path.join(__dirname, "payments.jsonl"),
  );
  const expectedText = fs
    .readFileSync(path.join(__dirname, "expected.txt"), "utf8")
    .trim();
  if (!/^\d+$/.test(expectedText))
    throw new Error("Invalid expected payment count");
  const expected = BigInt(expectedText);

  if (BigInt(count) !== expected) {
    console.log(
      `Check failed: counted ${count} successful payments, expected ${expected}.`,
    );
    console.log(
      "Something in the data isn't being handled the way the README describes.",
    );
    process.exitCode = 1;
  } else {
    // Round to the nearest naira, with halfway values toward positive infinity.
    const rounded = total >= 0n ? (total + 50n) / 100n : (total - 49n) / 100n;
    console.log(`Check passed: ${count} successful payments.`);
    console.log(`Your code: KOYA-${rounded}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { reconcile, toKobo };
