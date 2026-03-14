'use strict';

const fp = require('fastify-plugin');
const {
  UnauthorizedError,
  ForbiddenError,
} = require('../src/shared/application/errors');
const {
  addDays,
  SESSION_TTL_DAYS,
} = require('../src/modules/auth/application/auth-service');

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.rooms = new Set();
    this.actorType = 'public';
    this.principal = null;
  }

  send(event, payload) {
    if (this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({ event, payload }));
  }
}

class ConnectionManager {
  constructor() {
    this.rooms = new Map();
    this.connections = new Set();
  }

  createConnection(socket) {
    const connection = new Connection(socket);
    this.connections.add(connection);
    return connection;
  }

  authenticateUser(connection, session) {
    connection.actorType = 'user';
    connection.principal = session;
    this.subscribe(connection, `user:${session.uid}`);
  }

  authenticateWidget(connection, widgetSession) {
    connection.actorType = 'widget';
    connection.principal = widgetSession;
    this.subscribe(connection, `widget:${widgetSession.token}`);
  }

  subscribe(connection, room) {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room).add(connection);
    connection.rooms.add(room);
  }

  publish(room, event, payload) {
    const members = this.rooms.get(room);
    if (!members) return;
    for (const connection of members) {
      connection.send(event, payload);
    }
  }

  remove(connection) {
    for (const room of connection.rooms) {
      const members = this.rooms.get(room);
      if (!members) continue;
      members.delete(connection);
      if (members.size === 0) this.rooms.delete(room);
    }
    this.connections.delete(connection);
  }
}

const readToken = (request) => {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  if (request.headers['x-session-token']) {
    return String(request.headers['x-session-token']);
  }
  if (request.query?.token) return String(request.query.token);
  if (request.body?.token) return String(request.body.token);
  return '';
};

const clientPlugin = async (fastify) => {
  const manager = new ConnectionManager();

  const getAppSession = async (token) => {
    if (!token) return null;
    const session = await fastify.mongodb.appSession.findOne({ token }).lean();
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      await fastify.mongodb.appSession.deleteOne({ token });
      return null;
    }

    await fastify.mongodb.appSession.updateOne(
      { token },
      { $set: { expiresAt: addDays(new Date(), SESSION_TTL_DAYS) } },
    );

    return {
      token,
      uid: session.uid,
      role: session.role,
      ...session.data,
    };
  };

  fastify.decorate('client', manager);
  fastify.decorate('readSessionToken', readToken);
  fastify.decorate('getAppSession', getAppSession);

  fastify.decorate('authenticateRequest', async (request) => {
    if (request.appSession) return request.appSession;

    const token = readToken(request);
    if (!token) throw new UnauthorizedError('Session token is required');

    const session = await getAppSession(token);

    if (!session) throw new UnauthorizedError('Session is invalid or expired');

    request.appSession = session;
    return session;
  });

  fastify.decorate('authorizeRoles', (roles) => async (request) => {
    const session = await fastify.authenticateRequest(request);

    if (!roles.includes(session.role)) {
      throw new ForbiddenError('This action is not allowed');
    }
  });
};

module.exports = fp(clientPlugin, {
  fastify: '5.x',
});
