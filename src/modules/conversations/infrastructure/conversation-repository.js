'use strict';

class ConversationRepository {
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

  async findByWidgetSessionToken(widgetSessionToken) {
    return this.model.findOne({ widgetSessionToken }).lean();
  }

  async listByChatbot(chatbotId, filters = {}) {
    return this.model
      .find({ chatbotId, ...filters })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async countByChatbot(chatbotId, filters = {}) {
    return this.model.countDocuments({ chatbotId, ...filters });
  }

  async countUnreadByChatbot(chatbotId) {
    return this.model.countDocuments({ chatbotId, unreadForOwner: { $gt: 0 } });
  }

  async aggregateTotals(chatbotId) {
    const [result] = await this.model.aggregate([
      { $match: { chatbotId } },
      {
        $project: {
          messagesCount: { $size: '$messages' },
          hasLead: {
            $cond: [
              { $gt: [{ $size: { $objectToArray: '$visitor' } }, 0] },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: '$messagesCount' },
          totalLeads: { $sum: '$hasLead' },
        },
      },
    ]);

    return {
      totalMessages: result?.totalMessages || 0,
      totalLeads: result?.totalLeads || 0,
    };
  }

  async deleteByChatbot(chatbotId) {
    return this.model.deleteMany({ chatbotId });
  }
}

module.exports = { ConversationRepository };
