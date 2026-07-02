'use strict';

class ConnectorRepository {
  constructor(model) {
    this.model = model;
  }

  async findByChatbotId(chatbotId) {
    return this.model.findOne({ chatbotId }).lean();
  }

  async listEnabled() {
    return this.model.find({ enabled: true }).lean();
  }

  async upsertByChatbotId(chatbotId, data) {
    return this.model
      .findOneAndUpdate(
        { chatbotId },
        { $set: data },
        { new: true, upsert: true, runValidators: true },
      )
      .lean();
  }

  async deleteByChatbotId(chatbotId) {
    return this.model.deleteOne({ chatbotId });
  }
}

module.exports = { ConnectorRepository };
