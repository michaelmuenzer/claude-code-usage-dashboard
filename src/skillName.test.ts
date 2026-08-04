import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillName } from './skillName.js';

test('parseSkillName splits a plugin-sourced skill', () => {
  assert.deepStrictEqual(parseSkillName('superpowers:brainstorming'), {
    plugin: 'superpowers',
    skill: 'brainstorming',
  });
});

test('parseSkillName handles a skill with no plugin prefix', () => {
  assert.deepStrictEqual(parseSkillName('claude-api'), {
    plugin: null,
    skill: 'claude-api',
  });
});

test('parseSkillName only splits on the first colon', () => {
  assert.deepStrictEqual(parseSkillName('superpowers:writing-plans:extra'), {
    plugin: 'superpowers',
    skill: 'writing-plans:extra',
  });
});
