import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createIpv4PreferredStream } from '../dist/core/database.js';

test('createIpv4PreferredStream forces family 4 for host connections', () => {
  const originalConnect = net.Socket.prototype.connect;
  const calls = [];

  net.Socket.prototype.connect = function patchedConnect(...args) {
    calls.push(args);
    return this;
  };

  try {
    const socket = createIpv4PreferredStream();
    socket.connect(5432, 'db.example.com');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], {
      family: 4,
      host: 'db.example.com',
      port: 5432
    });
  } finally {
    net.Socket.prototype.connect = originalConnect;
  }
});
