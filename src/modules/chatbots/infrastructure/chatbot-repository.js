'use strict';

class ChatbotRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    const document = await this.model.create(data);
    return document.toObject();
  }

  async findById(id) {
    return this.model.findOne({ id }).lean();
  }

  async findDocumentById(id) {
    return this.model.findOne({ id });
  }

  async listByOwner(ownerUid) {
    return this.model.find({ ownerUid }).sort({ updatedAt: -1 }).lean();
  }

  async listAll() {
    return this.model.find({}).sort({ updatedAt: -1 }).lean();
  }

  async deleteById(id) {
    return this.model.findOneAndDelete({ id }).lean();
  }

  async updateById(id, update) {
    return this.model
      .findOneAndUpdate({ id }, update, {
        new: true,
        runValidators: true,
      })
      .lean();
  }
}

module.exports = { ChatbotRepository };
