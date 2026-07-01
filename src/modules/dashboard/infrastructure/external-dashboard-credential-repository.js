'use strict';

class ExternalDashboardCredentialRepository {
  constructor(model) {
    this.model = model;
  }

  async findByChatbotId(chatbotId) {
    return this.model.findOne({ chatbotId }).lean();
  }

  async upsert(chatbotId, data) {
    return this.model
      .findOneAndUpdate(
        { chatbotId },
        { $set: { chatbotId, ...data } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean();
  }

  async deleteByChatbotId(chatbotId) {
    return this.model.deleteOne({ chatbotId });
  }
}

module.exports = { ExternalDashboardCredentialRepository };
