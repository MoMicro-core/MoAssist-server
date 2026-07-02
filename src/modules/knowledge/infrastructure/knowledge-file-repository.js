'use strict';

class KnowledgeFileRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    const document = await this.model.create(data);
    return document.toObject();
  }

  async listByChatbot(chatbotId) {
    return this.model.find({ chatbotId }).sort({ updatedAt: -1 }).lean();
  }

  async listAll() {
    return this.model.find({}).lean();
  }

  async updateById(id, update) {
    return this.model
      .findOneAndUpdate({ id }, { $set: update }, { new: true })
      .lean();
  }

  async countByChatbot(chatbotId) {
    return this.model.countDocuments({ chatbotId });
  }

  async findById(id) {
    return this.model.findOne({ id }).lean();
  }

  async deleteById(id) {
    return this.model.findOneAndDelete({ id }).lean();
  }

  async deleteByChatbot(chatbotId) {
    return this.model.deleteMany({ chatbotId });
  }
}

module.exports = { KnowledgeFileRepository };
