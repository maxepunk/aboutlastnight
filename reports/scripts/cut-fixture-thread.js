#!/usr/bin/env node
/**
 * Cut a click-through fixture from a COPY of a checkpoint database (phase 3 gate, step 4).
 *
 *   node scripts/cut-fixture-thread.js --src <copy.sqlite> --thread <id> --list
 *     Lists the thread's checkpoints, newest first: id, the phase, and the stop it is
 *     paused at when it is one.
 *
 *   node scripts/cut-fixture-thread.js --src <copy.sqlite> --dst <fixture.sqlite> --thread <id>
 *       --at <checkpoint_id> [--plant <plants.json>]
 *     Copies --src to --dst, deletes the thread's checkpoints and writes after --at, so
 *     the thread ends paused where it was at --at, and plants cases into that
 *     checkpoint's state. Other threads are copied unchanged. A server started on --dst
 *     (CHECKPOINT_DB_PATH) shows the stop with the planted cases, with no model calls.
 *
 * plants.json: {"channel": value, "a.b.c": value, "+arrayChannel": item-or-items}
 * (scripts/lib/fixture-thread.js#applyPlants) plants into the checkpoint's state, which
 * the stop's payload extras read (getCheckpointData in server.js). A key prefixed
 * `interrupt:` ("interrupt:sessionConfig.accusation") plants into the stop's own
 * interrupt payload instead: the input review reads its session config from there.
 * Plant the shapes the pipeline writes.
 *
 * Neither --src nor --dst may be a production database (a `checkpoints.sqlite` under
 * `data/`): --src is opened read-only, and a fixture is cut from a copy.
 */
'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const { isProductionDb, applyPlants, splitPlants, stopOfWrites } = require('./lib/fixture-thread');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function fail(msg) {
  console.error(`[cut-fixture-thread] ${msg}`);
  process.exit(1);
}

const parseBlob = (b) => JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b));

function list(src, thread) {
  const db = new Database(src, { readonly: true, fileMustExist: true });
  const rows = db.prepare(
    "SELECT checkpoint_id, checkpoint FROM checkpoints WHERE thread_id=? AND checkpoint_ns='' ORDER BY checkpoint_id DESC"
  ).all(thread);
  const writes = db.prepare(
    "SELECT channel, value FROM writes WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id=?"
  );
  for (const r of rows) {
    const cv = parseBlob(r.checkpoint).channel_values || {};
    const stop = stopOfWrites(writes.all(thread, r.checkpoint_id)
      .filter((w) => w.channel === '__interrupt__')
      .map((w) => ({ channel: w.channel, value: parseBlob(w.value) })));
    console.log(`${r.checkpoint_id}  phase=${cv.currentPhase ?? '-'}${stop ? `  STOP ${stop}` : ''}`);
  }
  db.close();
}

async function cut({ src, dst, thread, at, plant }) {
  if (fs.existsSync(dst)) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dst + s); } catch (e) { /* absent */ } }
  const srcDb = new Database(src, { readonly: true, fileMustExist: true });
  await srcDb.backup(dst);
  srcDb.close();

  const db = new Database(dst);
  const row = db.prepare(
    "SELECT checkpoint FROM checkpoints WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id=?"
  ).get(thread, at);
  if (!row) { db.close(); fail(`no checkpoint ${at} on thread ${thread}`); }
  const removed = db.prepare(
    "DELETE FROM checkpoints WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id > ?"
  ).run(thread, at).changes;
  const removedWrites = db.prepare(
    "DELETE FROM writes WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id > ?"
  ).run(thread, at).changes;

  let planted = [];
  if (plant) {
    const plants = JSON.parse(fs.readFileSync(plant, 'utf8'));
    const { state, interrupt } = splitPlants(plants);
    if (Object.keys(state).length) {
      const cp = parseBlob(row.checkpoint);
      cp.channel_values = applyPlants(cp.channel_values, state);
      db.prepare(
        "UPDATE checkpoints SET checkpoint=? WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id=?"
      ).run(Buffer.from(JSON.stringify(cp), 'utf8'), thread, at);
    }
    if (Object.keys(interrupt).length) {
      const writes = db.prepare(
        "SELECT task_id, idx, value FROM writes WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id=? AND channel='__interrupt__'"
      ).all(thread, at);
      if (writes.length === 0) { db.close(); fail(`checkpoint ${at} is not paused at a stop: no interrupt to plant into`); }
      for (const w of writes) {
        const record = parseBlob(w.value);
        record.value = applyPlants(record.value, interrupt);
        db.prepare(
          "UPDATE writes SET value=? WHERE thread_id=? AND checkpoint_ns='' AND checkpoint_id=? AND task_id=? AND idx=? AND channel='__interrupt__'"
        ).run(Buffer.from(JSON.stringify(record), 'utf8'), thread, at, w.task_id, w.idx);
      }
    }
    planted = Object.keys(plants);
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  console.log(`cut ${thread} at ${at}: removed ${removed} checkpoints and ${removedWrites} writes after it` +
    (planted.length ? `; planted ${planted.join(', ')}` : ''));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.src || !args.thread) {
    console.log('usage: cut-fixture-thread.js --src <copy.sqlite> --thread <id> --list\n' +
      '       cut-fixture-thread.js --src <copy.sqlite> --dst <fixture.sqlite> --thread <id> --at <checkpoint_id> [--plant <plants.json>]');
    process.exit(args.help ? 0 : 1);
  }
  if (isProductionDb(args.src)) fail(`refusing ${args.src}: a production database; cut from a copy`);
  if (args.list) return list(args.src, args.thread);
  if (!args.dst || !args.at) fail('--dst and --at are required to cut (or pass --list)');
  if (isProductionDb(args.dst)) fail(`refusing to write ${args.dst}: a production database path`);
  return cut(args);
}

main().catch((e) => fail(e && e.stack || String(e)));
