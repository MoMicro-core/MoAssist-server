'use strict';

class UserRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    const document = await this.model.create(data);
    return document.toObject();
  }

  async findByUid(uid) {
    return this.model.findOne({ uid }).lean();
  }

  async findDocumentByUid(uid) {
    return this.model.findOne({ uid });
  }

  async findByStripeCustomerId(customerId) {
    return this.model.findOne({ stripeCustomerId: customerId }).lean();
  }

  async updateByUid(uid, update) {
    return this.model
      .findOneAndUpdate({ uid }, update, {
        new: true,
        runValidators: true,
      })
      .lean();
  }

  async deleteByUid(uid) {
    return this.model.findOneAndDelete({ uid }).lean();
  }
}

module.exports = { UserRepository };
