'use strict';

class SessionRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    const document = await this.model.create(data);
    return document.toObject();
  }

  async findByToken(token) {
    return this.model.findOne({ token }).lean();
  }

  async touch(token, expiresAt) {
    return this.model.findOneAndUpdate(
      { token },
      { $set: { expiresAt } },
      { new: true },
    );
  }

  async deleteByToken(token) {
    return this.model.deleteOne({ token });
  }

  async deleteByUid(uid) {
    return this.model.deleteMany({ uid });
  }
}

module.exports = { SessionRepository };
