import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowOf, initials } from '../src/board/presence.js';
import { shortDate } from '../src/board/util.js';

const NOW = Date.parse('2026-10-27T15:00:00+07:00');
const ago = min => new Date(NOW - min * 60000).toISOString();
const v = (id, min) => ({ user: { id, name: `u${id}` }, last_seen_at: ago(min) });

test('avatars: active within 2 min, faded within 15, older dropped, never me', () => {
  const row = rowOf([v(1, 0), v(2, 1), v(3, 5), v(4, 14), v(5, 16), v(6, 60 * 24)], { me: 1, now: NOW });
  assert.deepEqual(row.map(r => [r.user.id, r.state]), [[2, 'active'], [3, 'recent'], [4, 'recent']]);
});

test('avatars: someone on the Reverb channel is active whatever their heartbeat says', () => {
  const row = rowOf([v(2, 10), v(3, 1)], { me: 1, now: NOW, online: new Set(['2']) });
  assert.deepEqual(row.map(r => [r.user.id, r.state]), [[3, 'active'], [2, 'active']], 'both active, newest first');
});

test('initials skip a leading Thai vowel and take two words', () => {
  assert.equal(initials('สมชาย ใจดี'), 'สจ');
  assert.equal(initials('เอก'), 'อ');
  assert.equal(initials('Somchai Jaidee'), 'SJ');
  assert.equal(initials(''), '?');
});

test('short Thai date with the พ.ศ. year', () => {
  const d = new Date(2026, 9, 27, 14, 5);
  assert.equal(shortDate(d), '27 ต.ค. 69');
  assert.equal(shortDate(d, true), '27 ต.ค. 69 14:05');
  assert.equal(shortDate('not a date'), '');
});
