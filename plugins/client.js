'use strict';

const EventEmitter = require('node:events');
const fp = require('fastify-plugin');
const crypto = require('node:crypto');

const sessions = new Map();

class Client extends EventEmitter {
  streams = [];

  constructor(fastify) {
    super();
    this.fastify = fastify;
    this.session = null;
  }

  async restoreSession({ token, request = null, socket = null }) {
    const session = await this.fastify.mongodb.sessions.findOne({ token });
    if (!session) return false;
    this.session = session.data;
    this.session.mode = session.mode;
    this.session.token = token;
    if (session.mode === 'unregistered') await this.extractGeo(request);
    if (socket) {
      this.session.stream = false;
      const client = sessions.get(session.data.uid);
      if (client) {
        client.socket.close();
        sessions.delete(session.data.uid);
      }
      sessions.set(session.data.uid, { ...this.session, socket });
    }
    await this.fastify.mongodb.user.updateOne(
      { uid: this.session.uid },
      { $set: { lastActive: new Date() } },
    );
    return true;
  }

  async extractGeo(request) {
    if (!request) return false;
    const userCountry = await this.fastify.geo.getCountry(request);
    if (!this.session) this.session = {};
    const cfg = this.fastify.config;
    const strategies = [
      
      {
        match: () => true,
        build: () => ({ language: 'english', currency: 'USD' }),
      },
    ];

    const { language, currency } = strategies
      .find((s) => s.match(userCountry))
      .build();
    if (!this.session.language) this.session.language = language;
    if (!this.session.currency) this.session.currency = currency;
    return true;
  }

  async initializeEmptySession(request) {
    this.session = {};
    this.session.mode = 'public';
    await this.extractGeo(request);
    return true;
  }

  async initializeSession({ request = null, uid, data = {}, socket = null }) {
    const restore = await this.fastify.mongodb.sessions.findOne({
      uid,
      fcmToken: data.fcmToken,
    });
    if (restore) {
      this.session = restore.data;
      this.session.mode = restore.mode;
      this.session.token = restore.token;
      if (restore.mode === 'unregistered') await this.extractGeo(request);
      if (socket) {
        this.session.stream = false;
        const client = sessions.get(restore.uid);
        if (client) {
          client.socket.close();
          sessions.delete(restore.uid);
        }
        sessions.set(restore.uid, { ...this.session, socket });
      }
      return restore.token;
    }
    const token = crypto.randomUUID();
    const newSession = await this.fastify.mongodb.sessions.create({
      token,
      uid,
      mode: data.email ? 'guest' : 'unregistered',
      fcmToken: data.fcmToken || '',
      data,
    });
    if (!newSession) return false;
    this.session = data;
    this.session.token = token;
    if (!data.email) this.session.mode = 'unregistered';
    else this.session.mode = 'guest';
    if (socket) {
      const client = sessions.get(uid);
      if (client) {
        client.socket.close();
        sessions.delete(uid);
      }
      sessions.set(uid, { ...this.session, socket });
    }
    await this.fastify.mongodb.user.updateOne(
      { uid: this.session.uid },
      { $set: { lastActive: new Date() } },
    );
    return token;
  }

  async destroy() {
    if (!this.session) return;
    await this.fastify.mongodb.sessions.deleteOne({
      token: this.session.token,
    });
    sessions.delete(this.session.uid);
    this.emit('close');
  }

  addStream(stream) {
    this.streams.push(stream);
  }

  close() {
    if (!this.session) return;
    sessions.delete(this.session.token);
    for (const stream of this.streams) {
      stream.close();
    }
  }
}

const clientPlugin = async (fastify) => {
  const session = {};
  session.createSession = () => new Client(fastify);
  session.sendMessage = (uid, message) => {
    const client = sessions.get(uid);
    if (!client || !client.socket) return;
    const payload = JSON.stringify(message);
    client.socket.send(payload);
  };
  session.getSession = async (uid) => {
    const session = sessions.get(uid);
    const user = await fastify.mongodb.user.findOne({ uid });
    const email = user.email;
    if (session) return { sessions, isRestored: false, email };
    const restoredSessions = await fastify.mongodb.sessions.find({ uid });
    if (!restoredSessions) return { email };
    const sessionsData = restoredSessions.map((s) => s.data);
    return { sessions: sessionsData, email, isRestored: true };
  };
  session.toggleStream = (client) => {
    const uid = client.session.uid;
    const session = sessions.get(uid);
    if (!session) return;
    session.stream = !session.stream;
    client.session.stream = session.stream;
    sessions.delete(uid);
    sessions.set(uid, session);
  };
  fastify.decorate('client', session);
};

module.exports = fp(clientPlugin, {
  fastify: '5.x',
});
