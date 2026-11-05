import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowOf, initials, bySlide, slideAvatars, nextBeatMs, FAST_BEAT_MS } from '../src/board/presence.js';
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

test('slides: only people active now, on this round, and never me', () => {
  const at = (id, min, step, round = 2) => ({ ...v(id, min), step, round });
  const slides = bySlide([at(1, 0, 'a'), at(2, 0, 'a'), at(3, 1, 'b'), at(4, 5, 'b'), at(5, 0, 'c', 1), at(6, 0, null)], { me: 1, round: 2, now: NOW });
  assert.deepEqual([...slides.entries()].map(([k, row]) => [k, row.map(r => r.user.id)]), [['a', [2]], ['b', [3]]]);
});

test('slides: three avatars, then +N', () => {
  const row = [1, 2, 3, 4, 5].map(id => v(id, 0));
  assert.equal(slideAvatars(row).match(/k-av /g).length, 3);
  assert.match(slideAvatars(row), />\+2</);
  assert.equal(slideAvatars(undefined), '');
});

test('the beat is fast only with someone else active, in a tab that is showing', () => {
  const at = { me: 1, now: NOW, slowMs: 30000 };
  assert.equal(nextBeatMs({ ...at, viewers: [v(1, 0)] }), 30000, 'alone');
  assert.equal(nextBeatMs({ ...at, viewers: [v(1, 0), v(2, 1)] }), FAST_BEAT_MS, 'company');
  assert.equal(nextBeatMs({ ...at, viewers: [v(1, 0), v(2, 5)] }), 30000, 'they left a while ago');
  assert.equal(nextBeatMs({ ...at, viewers: [v(2, 1)], hidden: true }), 30000, 'hidden tab');
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
