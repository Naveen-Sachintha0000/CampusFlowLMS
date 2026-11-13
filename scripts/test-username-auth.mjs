import assert from 'node:assert/strict';
import {normalizeUsername,isValidUsername,usernameAuthEmail,USERNAME_DOMAIN} from '../src/username-auth.js';
assert.equal(normalizeUsername('  Student_007  '),'student_007');
assert.ok(isValidUsername('student_007'));
assert.ok(isValidUsername('alex'));
for (const name of ['', 'ab', '7seven', 'a.b', 'name@example.com', 'a'.repeat(25)]) {
  assert.equal(isValidUsername(name),false,`Expected invalid: ${name}`);
  assert.throws(()=>usernameAuthEmail(name));
}
assert.equal(usernameAuthEmail('  AlEx_123 '),`alex_123@${USERNAME_DOMAIN}`);
console.log('PASS: case-insensitive username normalization, validation and internal alias generation.');
