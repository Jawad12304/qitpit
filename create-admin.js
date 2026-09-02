// QitPit — create or reset an admin account.
//   node create-admin.js
// The password is typed at the terminal, never passed as an argument, so it
// never lands in shell history or the process list.

import './env.js';
import { stdin, stdout } from 'node:process';
import { db } from './db.js';
import { hashPassword, passwordProblem } from './auth.js';

const CTRL_C = 3;
const BACKSPACE = 8;
const DELETE = 127;

let piped = null;

/**
 * Prompt for one line. On a terminal this reads stdin directly and hides the
 * password as it is typed; when stdin is piped it consumes the next buffered
 * line, so the script also works from a provisioning script.
 */
async function ask(prompt, hidden = false) {
  stdout.write(prompt);

  if (!stdin.isTTY) {
    if (piped === null) {
      const chunks = [];
      for await (const c of stdin) chunks.push(c);
      piped = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
    }
    const line = piped.shift() ?? '';
    stdout.write('\n');
    return line;
  }

  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 13 || byte === 10) {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (byte === CTRL_C) {
          stdout.write('\n');
          process.exit(130);
        }
        if (byte === BACKSPACE || byte === DELETE) {
          if (value) {
            value = value.slice(0, -1);
            if (!hidden) stdout.write('\b \b');
          }
          continue;
        }
        if (byte >= 32) {
          value += String.fromCharCode(byte);
          if (!hidden) stdout.write(String.fromCharCode(byte));
        }
      }
    };
    stdin.on('data', onData);
  });
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

console.log('\n  QitPit — admin account setup\n');

const email = (await ask('  Email: ')).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That is not a valid email address.');

const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existing) {
  const yes = (await ask(`  ${email} already exists. Reset its password? (y/N) `)).trim().toLowerCase();
  if (yes !== 'y') {
    console.log('\n  Nothing changed.\n');
    process.exit(0);
  }
}

const name = existing ? '' : (await ask('  Your name: ')).trim().slice(0, 80);

console.log('\n  At least 12 characters, with upper case, lower case and a number.');
const password = await ask('  Password: ', true);

const problem = passwordProblem(password);
if (problem) fail(problem);

const again = await ask('  Repeat password: ', true);
if (password !== again) fail('The passwords did not match.');

const hash = hashPassword(password);

if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, existing.id);
  // A password reset signs out every existing session.
  db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(existing.id);
  console.log(`\n  Password reset for ${email}. All existing sessions were signed out.\n`);
} else {
  db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?,?,?)').run(email, name, hash);
  console.log(`\n  Admin account created for ${email}.`);
  console.log('  Sign in at /admin\n');
}

process.exit(0);
