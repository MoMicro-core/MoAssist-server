'use strict';

class WidgetSessionRepository {
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

  async findByConversationId(conversationId) {
    return this.model
      .findOne({ conversationId })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async updateByToken(token, update) {
    return this.model
      .findOneAndUpdate({ token }, update, {
        new: true,
        runValidators: true,
      })
      .lean();
  }

  async deleteByChatbot(chatbotId) {
    return this.model.deleteMany({ chatbotId });
  }
}

module.exports = { WidgetSessionRepository };
